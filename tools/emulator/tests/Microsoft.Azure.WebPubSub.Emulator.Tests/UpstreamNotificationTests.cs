// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.Http;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class UpstreamNotificationTests
{
    private const string JsonProtocol = "json.webpubsub.azure.v1";
    private const string ReliableProtocol = "json.reliable.webpubsub.azure.v1";
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(10);

    [Theory]
    [InlineData(null, "client", 200)]
    [InlineData(JsonProtocol, "server", 200)]
    [InlineData(JsonProtocol, "client", 503)]
    [InlineData(JsonProtocol, "protocol", 200)]
    [InlineData(ReliableProtocol, "client", 200)]
    public async Task LifecycleUsesCloudEventsAndNotifiesOnlyOnce(
        string? protocol, string closeMode, int upstreamStatus)
    {
        var events = Channel.CreateUnbounded<ReceivedEvent>();
        await using var upstream = await StartUpstreamAsync(events, upstreamStatus);
        await using var app = await StartEmulatorAsync(upstream);
        using var socket = await ConnectAsync(app, protocol);
        if (protocol is not null)
        {
            using var connectedFrame = await ReceiveJsonAsync(socket);
            Assert.Equal("connected", connectedFrame.RootElement.GetProperty("event").GetString());
        }
        var connected = await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout);
        var id = connected.Headers["ce-connectionId"];
        Assert.Equal("/events/chat/connected", connected.Path);
        Assert.Equal("{}", connected.Body);
        Assert.Equal("1", connected.Headers["ce-id"]);
        Assert.Equal("1.0", connected.Headers["ce-specversion"]);
        Assert.Equal("1.0", connected.Headers["ce-awpsversion"]);
        Assert.Equal("azure.webpubsub.sys.connected", connected.Headers["ce-type"]);
        Assert.Equal($"/hubs/chat/client/{id}", connected.Headers["ce-source"]);
        Assert.Equal("用户", connected.Headers["ce-userId"]);
        Assert.Equal("application/json", connected.Headers["Content-Type"]);
        Assert.Equal("127.0.0.1", connected.Headers["WebHook-Request-Origin"]);
        Assert.True(Guid.TryParse(connected.Headers["x-ms-client-request-id"], out _));
        Assert.True(DateTimeOffset.TryParse(connected.Headers["ce-time"], out _));
        Assert.Equal(protocol ?? "", connected.Headers.GetValueOrDefault("ce-subprotocol", ""));
        var hash = HMACSHA256.HashData(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey), Encoding.UTF8.GetBytes(id));
        Assert.Equal($"sha256={Convert.ToHexStringLower(hash)}", connected.Headers["ce-signature"]);

        var manager = app.Services.GetRequiredService<ConnectionManager>();
        Assert.True(manager.TryGet("chat", id, out var connection));
        if (closeMode == "server")
        {
            manager.CloseConnection("chat", id, "test-close");
            using var disconnectedFrame = await ReceiveJsonAsync(socket);
            Assert.Equal("disconnected", disconnectedFrame.RootElement.GetProperty("event").GetString());
        }
        else if (closeMode == "protocol")
        {
            await socket.SendAsync(new byte[] { 1 }, WebSocketMessageType.Binary, true, CancellationToken.None).WaitAsync(TestTimeout);
        }
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "test-close", CancellationToken.None).WaitAsync(TestTimeout);
        var disconnected = await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout);
        Assert.Equal("2", disconnected.Headers["ce-id"]);
        Assert.Equal("azure.webpubsub.sys.disconnected", disconnected.Headers["ce-type"]);
        Assert.Equal(connected.Headers["ce-signature"], disconnected.Headers["ce-signature"]);
        Assert.NotEqual(connected.Headers["x-ms-client-request-id"], disconnected.Headers["x-ms-client-request-id"]);
        using var body = JsonDocument.Parse(disconnected.Body);
        Assert.Equal(closeMode switch
            {
                "server" => "Application server closed the connection. Reason: test-close",
                "protocol" => "The JSON subprotocol requires text messages.",
                _ => "test-close",
            },
            body.RootElement.GetProperty("reason").GetString());
        if (upstreamStatus != 200)
        {
            Assert.False(disconnected.Headers.ContainsKey("Cookie"));
        }
        Assert.False(manager.ConnectionExists("chat", id));
        manager.Remove(connection!);
        Assert.Equal(3, connection!.UpstreamContext.GetNextEventId());
        Assert.False(events.Reader.TryRead(out _));

        var replacement = manager.Create(id, "chat", new ClaimsPrincipal(), host: connection.UpstreamContext.Host);
        Assert.True(manager.TryActivate(replacement));
        manager.Remove(connection);
        Assert.True(manager.TryGet("chat", id, out var current));
        Assert.Same(replacement, current);
        Assert.Equal(4, connection.UpstreamContext.GetNextEventId());
        manager.Remove(replacement);
        Assert.Equal("disconnected", (await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout)).Headers["ce-eventName"]);
        Assert.False(events.Reader.TryRead(out _));
    }

    [Fact]
    public async Task ConnectedNotificationSurvivesClientRequestEnding()
    {
        var events = Channel.CreateUnbounded<ReceivedEvent>();
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var completed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var upstream = await StartUpstreamAsync(events, afterReceive: async context =>
        {
            if (context.Request.Headers["ce-eventName"] == "connected")
            {
                await release.Task.WaitAsync(TestTimeout);
                completed.TrySetResult(!context.RequestAborted.IsCancellationRequested);
            }
        });
        await using var app = await StartEmulatorAsync(upstream);
        using var socket = await ConnectAsync(app, null);
        try
        {
            Assert.Equal("connected", (await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout)).Headers["ce-eventName"]);
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None).WaitAsync(TestTimeout);
            Assert.Equal("disconnected", (await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout)).Headers["ce-eventName"]);
        }
        finally
        {
            release.TrySetResult();
        }
        Assert.True(await completed.Task.WaitAsync(TestTimeout));
    }

    [Fact]
    public async Task RealHttpCookiesAreConnectionScopedAndRoutingIsExact()
    {
        var events = Channel.CreateUnbounded<ReceivedEvent>();
        await using var upstream = await StartUpstreamAsync(events);
        await using var app = await StartEmulatorAsync(upstream);
        using var http = app.Services.GetRequiredService<IHttpClientFactory>().CreateClient(HttpUpstreamTrigger.HttpClientName);
        Assert.Equal(TimeSpan.FromSeconds(100), http.Timeout);
        var dispatcher = app.Services.GetRequiredService<UpstreamEventDispatcher>();
        var a = new UpstreamConnectionContext("a", "CHAT", "用户", null, "localhost");
        var b = new UpstreamConnectionContext("b", "CHAT", "second", null, "localhost");
        await dispatcher.DispatchNotificationAsync(a, "connected", "{}"u8.ToArray()).WaitAsync(TestTimeout);
        Assert.Equal("", (await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout)).Headers.GetValueOrDefault("Cookie", ""));
        await dispatcher.DispatchNotificationAsync(b, "connected", "{}"u8.ToArray()).WaitAsync(TestTimeout);
        Assert.Equal("", (await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout)).Headers.GetValueOrDefault("Cookie", ""));
        await dispatcher.DispatchNotificationAsync(a, "disconnected", "{}"u8.ToArray()).WaitAsync(TestTimeout);
        Assert.Equal("affinity=a", (await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout)).Headers["Cookie"]);
        await dispatcher.DispatchNotificationAsync(
            new UpstreamConnectionContext("missing", "missing", null, null, "localhost"),
            "connected", "{}"u8.ToArray()).WaitAsync(TestTimeout);
        Assert.False(events.Reader.TryRead(out _));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ReliableDetachNotifiesOnlyOnFinalRemoval(bool reconnect)
    {
        var events = Channel.CreateUnbounded<ReceivedEvent>();
        await using var upstream = await StartUpstreamAsync(events);
        await using var app = await StartEmulatorAsync(upstream, reconnect ? TimeSpan.FromMinutes(1) : TimeSpan.FromMilliseconds(200));
        using var socket = await ConnectAsync(app, ReliableProtocol);
        using var frame = await ReceiveJsonAsync(socket);
        var id = frame.RootElement.GetProperty("connectionId").GetString()!;
        var token = frame.RootElement.GetProperty("reconnectionToken").GetString()!;
        Assert.Equal("1", (await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout)).Headers["ce-id"]);
        await socket.CloseOutputAsync(WebSocketCloseStatus.EndpointUnavailable, "detach", CancellationToken.None).WaitAsync(TestTimeout);
        // Wait for the old transport to end before attempting recovery.
        try
        {
            await socket.ReceiveAsync(new byte[4096], CancellationToken.None).WaitAsync(TestTimeout);
        }
        catch (WebSocketException)
        {
        }
        if (reconnect)
        {
            var uri = new Uri($"{Endpoint(app).Replace("http:", "ws:")}/client/hubs/chat?awps_connection_id={id}&awps_reconnection_token={Uri.EscapeDataString(token)}");
            using var recovered = await ConnectAsync(app, ReliableProtocol, uri);
            await recovered.CloseAsync(WebSocketCloseStatus.NormalClosure, "recovered-close", CancellationToken.None).WaitAsync(TestTimeout);
        }
        var disconnected = await events.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout);
        Assert.Equal("disconnected", disconnected.Headers["ce-eventName"]);
        Assert.Equal("2", disconnected.Headers["ce-id"]);
        using var body = JsonDocument.Parse(disconnected.Body);
        Assert.Equal(reconnect ? "recovered-close" : "The connection recovery timeout expired.",
            body.RootElement.GetProperty("reason").GetString());
        Assert.False(events.Reader.TryRead(out _));
    }

    private static async Task<WebApplication> StartUpstreamAsync(
        Channel<ReceivedEvent> events, int status = 200, Func<HttpContext, Task>? afterReceive = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.WebHost.ConfigureKestrel(options => options.RequestHeaderEncodingSelector = _ => Encoding.UTF8);
        var app = builder.Build();
        app.Run(async context =>
        {
            var body = await new System.IO.StreamReader(context.Request.Body).ReadToEndAsync();
            events.Writer.TryWrite(new ReceivedEvent(context.Request.Path.Value!,
                context.Request.Headers.ToDictionary(p => p.Key, p => p.Value.ToString(), StringComparer.OrdinalIgnoreCase), body));
            if (afterReceive is not null)
            {
                await afterReceive(context);
            }
            context.Response.StatusCode = status;
            context.Response.Cookies.Append("affinity", context.Request.Headers["ce-connectionId"].ToString());
        });
        await app.StartAsync().WaitAsync(TestTimeout);
        return app;
    }

    private static async Task<WebApplication> StartEmulatorAsync(WebApplication upstream, TimeSpan? reconnectTimeout = null)
    {
        var builder = EmulatorApplication.CreateBuilder(["--urls=http://127.0.0.1:0"],
            new EmulatorRuntimeOptions { ReconnectTimeout = reconnectTimeout ?? TimeSpan.FromSeconds(30) });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventHandlers:0:UrlTemplate"] = Endpoint(upstream) + "/events/{HUB}/{event}",
            ["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:0"] = "connected",
            ["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:1"] = "disconnected",
            ["WebPubSub:Hubs:chat:EventHandlers:1:UrlTemplate"] = Endpoint(upstream) + "/wrong-handler",
            ["WebPubSub:Hubs:chat:EventHandlers:1:SystemEvents:0"] = "connected",
            ["WebPubSub:Hubs:_default:EventHandlers:0:UrlTemplate"] = Endpoint(upstream) + "/wrong-default",
            ["WebPubSub:Hubs:_default:EventHandlers:0:SystemEvents:0"] = "connected",
        });
        var app = EmulatorApplication.Build(builder);
        await app.StartAsync().WaitAsync(TestTimeout);
        return app;
    }

    private static async Task<ClientWebSocket> ConnectAsync(WebApplication app, string? protocol, Uri? uri = null)
    {
        var socket = new ClientWebSocket();
        if (protocol is not null)
        {
            socket.Options.AddSubProtocol(protocol);
        }
        var token = new JwtSecurityToken(audience: Endpoint(app) + "/client/hubs/chat",
            claims: [new Claim("sub", "用户")], expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)), SecurityAlgorithms.HmacSha256));
        var address = uri ?? new Uri(Endpoint(app).Replace("http:", "ws:") + "/client/hubs/chat?access_token=" + new JwtSecurityTokenHandler().WriteToken(token));
        await socket.ConnectAsync(address, CancellationToken.None).WaitAsync(TestTimeout);
        return socket;
    }

    private static async Task<JsonDocument> ReceiveJsonAsync(WebSocket socket)
    {
        var bytes = new byte[4096];
        var result = await socket.ReceiveAsync(bytes, CancellationToken.None).WaitAsync(TestTimeout);
        Assert.Equal(WebSocketMessageType.Text, result.MessageType);
        return JsonDocument.Parse(bytes.AsMemory(0, result.Count));
    }

    private static string Endpoint(WebApplication app) => app.Urls.Single();

    private sealed record ReceivedEvent(string Path, Dictionary<string, string> Headers, string Body);
}