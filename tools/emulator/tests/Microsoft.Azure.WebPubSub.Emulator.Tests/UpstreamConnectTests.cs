// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class UpstreamConnectTests
{
    private const string JsonProtocol = "json.webpubsub.azure.v1";
    private const string ReliableProtocol = "json.reliable.webpubsub.azure.v1";
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(15);

    [Theory]
    [InlineData("state", false)]
    [InlineData("", true)]
    public async Task ConnectGatesUpgradeStripsCredentialsAndPreservesContext(string state, bool bearerOnly)
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            await release.Task.WaitAsync(TestTimeout);
            context.Response.Headers["ce-connectionState"] = state;
            context.Response.Cookies.Append("affinity", "connect");
            await context.Response.WriteAsync("{\"userId\":\"用户\",\"roles\":[],\"groups\":[\"new-room\"]}");
        });
        using var socket = new ClientWebSocket();
        socket.Options.AddSubProtocol(JsonProtocol);
        socket.Options.SetRequestHeader("Authorization", "Bearer " + fixture.Token);
        socket.Options.SetRequestHeader("X-ASRS-Internal-Test", "private");
        socket.Options.SetRequestHeader("X-Custom", "value");
        var connecting = socket.ConnectAsync(fixture.ClientUri(bearerOnly: bearerOnly), CancellationToken.None);
        var connect = await fixture.ReadAsync("connect");
        try
        {
            Assert.False(connecting.IsCompleted);
            Assert.False(fixture.Manager.ConnectionExists("chat", connect.Id));
            Assert.Equal("0", connect.Headers["ce-id"]);
            Assert.Equal("token-user", connect.Headers["ce-userId"]);
            Assert.False(connect.Headers.ContainsKey("ce-subprotocol"));
            Assert.False(connect.Headers.ContainsKey("Authorization"));
            Assert.False(connect.Headers.ContainsKey("Cookie"));
            Assert.Equal("application/json", connect.Headers["Content-Type"]);
            using var body = JsonDocument.Parse(connect.Body);
            var root = body.RootElement;
            Assert.Equal(new[] { "one", "two" }, root.GetProperty("claims").GetProperty("custom").EnumerateArray().Select(x => x.GetString()));
            Assert.Equal(new[] { "a", "b" }, root.GetProperty("query").GetProperty("tag").EnumerateArray().Select(x => x.GetString()));
            Assert.DoesNotContain(root.GetProperty("query").EnumerateObject(), p => p.Name.Equals("access_token", StringComparison.OrdinalIgnoreCase));
            Assert.DoesNotContain(root.GetProperty("headers").EnumerateObject(), p => p.Name.Equals("Authorization", StringComparison.OrdinalIgnoreCase) || p.Name.StartsWith("X-ASRS-Internal-", StringComparison.OrdinalIgnoreCase));
            Assert.Equal("value", root.GetProperty("headers").GetProperty("X-Custom")[0].GetString());
            Assert.Equal(JsonProtocol, root.GetProperty("subprotocols")[0].GetString());
            Assert.Equal(0, root.GetProperty("clientCertificates").GetArrayLength());
            Assert.DoesNotContain(fixture.Token, connect.Body);
        }
        finally
        {
            release.TrySetResult();
        }
        await connecting.WaitAsync(TestTimeout);
        var connected = await fixture.ReadAsync("connected");
        Assert.Equal(connect.Id, connected.Id);
        Assert.Equal("1", connected.Headers["ce-id"]);
        Assert.Equal("用户", connected.Headers["ce-userId"]);
        Assert.Equal(JsonProtocol, connected.Headers["ce-subprotocol"]);
        Assert.Equal(state, connected.Headers["ce-connectionState"]);
        Assert.Equal("affinity=connect", connected.Headers["Cookie"]);
        Assert.Equal(connect.Headers["ce-signature"], connected.Headers["ce-signature"]);
        Assert.True(fixture.Manager.TryGet("chat", connect.Id, out var connection));
        Assert.Equal("用户", connection.UserId);
        Assert.Equal(new[] { "new-room" }, connection.Groups.Keys);
        Assert.False(connection.CanJoinLeaveGroup("room"));
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None).WaitAsync(TestTimeout);
        var disconnected = await fixture.ReadAsync("disconnected");
        Assert.Equal("2", disconnected.Headers["ce-id"]);
        Assert.Equal(state, disconnected.Headers["ce-connectionState"]);
    }

    [Theory]
    [InlineData("", 204, "token-user", true, "room", JsonProtocol)]
    [InlineData("null", 200, "token-user", true, "room", JsonProtocol)]
    [InlineData("{\"groups\":[],\"roles\":null}", 202, "token-user", true, "room", JsonProtocol)]
    [InlineData("{\"userId\":\"\",\"roles\":[]}", 200, "", false, "room", JsonProtocol)]
    [InlineData("{\"userId\":null,\"groups\":[\"new-room\"],\"roles\":[\"webpubsub.joinLeaveGroup\"]}", 200, "token-user", true, "new-room", JsonProtocol)]
    [InlineData("{\"subprotocol\":\"custom.protocol\"}", 200, "token-user", true, "room", "custom.protocol")]
    [InlineData("{\"subprotocol\":\"json.reliable.webpubsub.azure.v1\"}", 200, "token-user", true, "room", ReliableProtocol)]
    public async Task ResponseOverridesUseRuntimeSemantics(string body, int status, string userId, bool canJoin, string group, string protocol)
    {
        await using var fixture = await Fixture.StartAsync(context =>
        {
            context.Response.StatusCode = status;
            // Connect payload parsing is independent of Content-Type.
            context.Response.ContentType = "text/plain";
            return context.Response.WriteAsync(body);
        });
        using var socket = new ClientWebSocket();
        socket.Options.AddSubProtocol(JsonProtocol);
        socket.Options.AddSubProtocol(protocol == JsonProtocol ? "custom.protocol" : protocol);
        await socket.ConnectAsync(fixture.ClientUri(), CancellationToken.None).WaitAsync(TestTimeout);
        var connect = await fixture.ReadAsync("connect");
        await fixture.ReadAsync("connected");
        Assert.Equal(protocol, socket.SubProtocol);
        Assert.True(fixture.Manager.TryGet("chat", connect.Id, out var connection));
        Assert.Equal(userId, connection.UserId);
        Assert.Equal(canJoin, connection.CanJoinLeaveGroup("room"));
        Assert.Equal(new[] { group }, connection.Groups.Keys);
        Assert.Equal(protocol == ReliableProtocol, connection.IsReliable);
        if (protocol == "custom.protocol")
        {
            fixture.Manager.SendToConnection("chat", connect.Id, new MessageData(MessageDataType.Binary, new byte[] { 1, 2 }));
            var buffer = new byte[8];
            var message = await socket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(TestTimeout);
            Assert.Equal(WebSocketMessageType.Binary, message.MessageType);
            Assert.Equal(new byte[] { 1, 2 }, buffer[..message.Count]);
        }
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None).WaitAsync(TestTimeout);
        await fixture.ReadAsync("disconnected");
    }

    [Theory]
    [InlineData(401, "denied", 401)]
    [InlineData(403, "denied", 403)]
    [InlineData(429, "busy", 429)]
    [InlineData(200, "not-json", 500)]
    [InlineData(200, "{\"groups\":[null]}", 500)]
    [InlineData(200, "{\"groups\":[\" \"]}", 500)]
    [InlineData(200, "{\"roles\":[null]}", 500)]
    public async Task FailedConnectNeverActivatesOrNotifies(int status, string body, int expected)
    {
        await using var fixture = await Fixture.StartAsync(context =>
        {
            context.Response.StatusCode = status;
            return context.Response.WriteAsync(body);
        });
        using var response = await fixture.UpgradeAsync();
        Assert.Equal(expected, (int)response.StatusCode);
        var connect = await fixture.ReadAsync("connect");
        Assert.False(fixture.Manager.ConnectionExists("chat", connect.Id));
        Assert.False(fixture.Events.Reader.TryRead(out _));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task OversizedResponseIsRejectedWithOrWithoutContentLength(bool knownLength)
    {
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            if (knownLength) context.Response.ContentLength = 16 * 1024 * 1024 + 1;
            var block = new byte[64 * 1024];
            for (var i = 0; i < 257; i++)
            {
                await context.Response.Body.WriteAsync(block, context.RequestAborted);
            }
        });
        using var response = await fixture.UpgradeAsync();
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var connect = await fixture.ReadAsync("connect");
        Assert.False(fixture.Manager.ConnectionExists("chat", connect.Id));
        Assert.False(fixture.Events.Reader.TryRead(out _));
    }

    [Fact]
    public async Task ConnectRetriesReuseEventAndRecoverySkipsConnect()
    {
        var attempts = 0;
        await using var fixture = await Fixture.StartAsync(context =>
        {
            context.Response.StatusCode = ++attempts == 1 ? 503 : 200;
            return Task.CompletedTask;
        });
        using var socket = new ClientWebSocket();
        socket.Options.AddSubProtocol(ReliableProtocol);
        await socket.ConnectAsync(fixture.ClientUri(), CancellationToken.None).WaitAsync(TestTimeout);
        var first = await fixture.ReadAsync("connect");
        var retry = await fixture.ReadAsync("connect");
        Assert.Equal(first.Id, retry.Id);
        Assert.Equal(first.Body, retry.Body);
        Assert.Equal(first.Headers["x-ms-client-request-id"], retry.Headers["x-ms-client-request-id"]);
        Assert.Equal("0", retry.Headers["ce-id"]);
        await fixture.ReadAsync("connected");
        var buffer = new byte[4096];
        var frame = await socket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(TestTimeout);
        using var connected = JsonDocument.Parse(buffer.AsMemory(0, frame.Count));
        var token = connected.RootElement.GetProperty("reconnectionToken").GetString();
        socket.Abort();
        using var recovered = new ClientWebSocket();
        recovered.Options.AddSubProtocol(ReliableProtocol);
        await recovered.ConnectAsync(new Uri(fixture.ClientUri().GetLeftPart(UriPartial.Path) +
            $"?awps_connection_id={first.Id}&awps_reconnection_token={Uri.EscapeDataString(token!)}"), CancellationToken.None).WaitAsync(TestTimeout);
        await recovered.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None).WaitAsync(TestTimeout);
        var disconnected = await fixture.ReadAsync("disconnected");
        Assert.Equal("2", disconnected.Headers["ce-id"]);
        Assert.Equal(2, attempts);
        Assert.False(fixture.Events.Reader.TryRead(out _));
    }

    [Fact]
    public async Task FailedValidationDoesNotSendConnect()
    {
        await using var fixture = await Fixture.StartAsync(_ => throw new InvalidOperationException("Must not dispatch connect."), allowOrigin: false);
        using var response = await fixture.UpgradeAsync();
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.False(fixture.Manager.UserExists("chat", "token-user"));
        Assert.False(fixture.Events.Reader.TryRead(out _));
    }

    private sealed class Fixture(WebApplication upstream, WebApplication app, Channel<Received> events) : IAsyncDisposable
    {
        public Channel<Received> Events => events;
        public ConnectionManager Manager => app.Services.GetRequiredService<ConnectionManager>();
        public string Token { get; } = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            audience: app.Urls.Single() + "/client/hubs/chat",
            claims: [new Claim("sub", "token-user"), new Claim("role", "webpubsub.joinLeaveGroup"),
                new Claim("webpubsub.group", "room"), new Claim("custom", "one"), new Claim("custom", "two")],
            expires: DateTime.UtcNow.AddHours(1), signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)), SecurityAlgorithms.HmacSha256)));

        public Uri ClientUri(bool bearerOnly = false) => new(app.Urls.Single().Replace("http:", "ws:") +
            "/client/hubs/chat?tag=a&tag=b" + (bearerOnly ? "" : "&ACCESS_TOKEN=" + Token));

        public async Task<Received> ReadAsync(string name)
        {
            var received = await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout);
            Assert.Equal(name, received.Headers["ce-eventName"]);
            return received;
        }

        public async Task<HttpResponseMessage> UpgradeAsync()
        {
            using var client = new HttpClient();
            using var request = new HttpRequestMessage(HttpMethod.Get, ClientUri().ToString().Replace("ws:", "http:"));
            request.Headers.Add("Connection", "Upgrade");
            request.Headers.Add("Upgrade", "websocket");
            request.Headers.Add("Sec-WebSocket-Version", "13");
            request.Headers.Add("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==");
            return await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).WaitAsync(TestTimeout);
        }

        public async ValueTask DisposeAsync()
        {
            await app.DisposeAsync();
            await upstream.DisposeAsync();
        }

        public static async Task<Fixture> StartAsync(Func<HttpContext, Task> onConnect, bool allowOrigin = true)
        {
            var events = Channel.CreateUnbounded<Received>();
            var builder = WebApplication.CreateBuilder(["--urls=http://127.0.0.1:0"]);
            builder.Logging.ClearProviders();
            var upstream = builder.Build();
            upstream.Run(async context =>
            {
                if (HttpMethods.IsOptions(context.Request.Method))
                {
                    Assert.Equal("/events/chat/validate", context.Request.Path.Value);
                    if (allowOrigin) context.Response.Headers["WebHook-Allowed-Origin"] = "*";
                    return;
                }
                var body = await new StreamReader(context.Request.Body).ReadToEndAsync();
                events.Writer.TryWrite(new Received(body, context.Request.Headers.ToDictionary(
                    h => h.Key, h => h.Value.ToString(), StringComparer.OrdinalIgnoreCase)));
                if (context.Request.Headers["ce-eventName"] == "connect") await onConnect(context);
            });
            await upstream.StartAsync().WaitAsync(TestTimeout);
            var emulator = EmulatorApplication.CreateBuilder(["--urls=http://127.0.0.1:0"]);
            emulator.Logging.ClearProviders();
            emulator.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["WebPubSub:Hubs:chat:EventHandlers:0:UrlTemplate"] = upstream.Urls.Single() + "/events/{hub}/{event}",
                ["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:0"] = "connect",
                ["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:1"] = "connected",
                ["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:2"] = "disconnected",
            });
            var app = EmulatorApplication.Build(emulator);
            await app.StartAsync().WaitAsync(TestTimeout);
            return new Fixture(upstream, app, events);
        }
    }

    private sealed record Received(string Body, Dictionary<string, string> Headers)
    {
        public string Id => Headers["ce-connectionId"];
    }
}