// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.WebSockets;
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

public class UpstreamUserEventTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    [Theory]
    [InlineData("*", "room.message", true)]
    [InlineData("join, ROOM.*", "room.message", true)]
    [InlineData("room.*", "room.message.more", false)]
    [InlineData("room.**", "room.message.more", true)]
    [InlineData("room.?", "room.a", true)]
    [InlineData("room.?", "room..", false)]
    [InlineData("CONNECTED", "connected", true)]
    [InlineData(null, "connected", false)]
    public async Task RoutesUserEventsSeparatelyFromSystemEvents(string? pattern, string name, bool matches)
    {
        await using var fixture = await Fixture.StartAsync(_ => Task.CompletedTask, pattern);
        using var socket = await fixture.ConnectAsync();
        await SendAsync(socket, name);
        using var ack = await ReceiveAsync(socket);
        Assert.Equal(matches, ack.RootElement.GetProperty("success").GetBoolean());
        if (matches)
        {
            var received = await fixture.ReadAsync();
            Assert.Equal("azure.webpubsub.user." + name, received.Headers["ce-type"]);
        }
        else
        {
            Assert.False(fixture.Events.Reader.TryRead(out _));
            Assert.Equal("InternalServerError", ack.RootElement.GetProperty("error").GetProperty("name").GetString());
        }
    }

    [Theory]
    [InlineData("text/plain", "hello", "text")]
    [InlineData("text/plain; charset=utf-8", "你好", "text")]
    [InlineData("application/json", "{\"answer\":42}", "json")]
    [InlineData("application/octet-stream", "hello", "binary")]
    [InlineData(null, "hello", "binary")]
    [InlineData("unsupported/type", "", "text")]
    public async Task ResponseBodyAndMetadataPrecedeAck(string? contentType, string body, string expectedType)
    {
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            context.Response.ContentType = contentType;
            context.Response.Headers["X-WebPubSub-Metadata-Trace"] = new[] { "first", " middle, last " };
            context.Response.Headers["X-WebPubSub-Metadata-"] = "ignored";
            await context.Response.Body.WriteAsync(Encoding.UTF8.GetBytes(body));
        });
        using var socket = await fixture.ConnectAsync();
        await SendAsync(socket, "message");
        using var data = await ReceiveAsync(socket);
        Assert.Equal("message", data.RootElement.GetProperty("type").GetString());
        Assert.Equal("server", data.RootElement.GetProperty("from").GetString());
        Assert.Equal(expectedType, data.RootElement.GetProperty("dataType").GetString());
        Assert.Equal("last", data.RootElement.GetProperty("metadata").GetProperty("trace").GetString());
        Assert.Single(data.RootElement.GetProperty("metadata").EnumerateObject());
        Assert.Equal(expectedType switch
        {
            "binary" => Convert.ToBase64String(Encoding.UTF8.GetBytes(body)),
            "json" => body,
            _ => body,
        }, expectedType == "json" ? data.RootElement.GetProperty("data").GetRawText() : data.RootElement.GetProperty("data").GetString());
        using var ack = await ReceiveAsync(socket);
        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
    }

    [Theory]
    [InlineData("text", "\"你好\"", "你好", "text/plain; charset=utf-8")]
    [InlineData("json", "{\"value\":1}", "{\"value\":1}", "application/json")]
    [InlineData("binary", "\"AP8=\"", null, "application/octet-stream")]
    public async Task RequestCarriesTypedBytesAndMetadata(string type, string data, string? text, string contentType)
    {
        await using var fixture = await Fixture.StartAsync(_ => Task.CompletedTask);
        using var socket = await fixture.ConnectAsync();
        await socket.SendAsync(Encoding.UTF8.GetBytes($$$"""{"type":"event","event":"message","ackId":1,"dataType":"{{{type}}}","data":{{{data}}},"metadata":{"Trace":"value"}}"""), WebSocketMessageType.Text, true, CancellationToken.None);
        using var ack = await ReceiveAsync(socket);
        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        var received = await fixture.ReadAsync();
        Assert.Equal(text is null ? new byte[] { 0, 255 } : Encoding.UTF8.GetBytes(text), received.Body);
        Assert.Equal(contentType, received.Headers["Content-Type"]);
        Assert.Equal("value", received.Headers["x-webpubsub-metadata-trace"]);
        Assert.Equal("2", received.Headers["ce-id"]);
        Assert.False(received.Headers.ContainsKey("Authorization"));
    }

    [Fact]
    public async Task RetryReusesIdentityAndSuccessfulStatePersistsWithoutDuplicateDispatch()
    {
        var attempts = 0;
        await using var fixture = await Fixture.StartAsync(context =>
        {
            context.Response.StatusCode = ++attempts == 1 ? 503 : 200;
            context.Response.Headers["ce-connectionState"] = "";
            context.Response.Cookies.Append("affinity", "user");
            return Task.CompletedTask;
        });
        using var socket = await fixture.ConnectAsync(reliable: true);
        await SendAsync(socket, "message");
        using var ack = await ReceiveAsync(socket);
        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        var first = await fixture.ReadAsync();
        var retry = await fixture.ReadAsync();
        Assert.Equal(first.Headers["ce-id"], retry.Headers["ce-id"]);
        Assert.Equal(first.Headers["x-ms-client-request-id"], retry.Headers["x-ms-client-request-id"]);
        Assert.Equal(first.Body, retry.Body);
        Assert.Equal("initial", first.Headers["ce-connectionState"]);
        await SendAsync(socket, "message");
        using var duplicate = await ReceiveAsync(socket);
        Assert.Equal("Duplicate", duplicate.RootElement.GetProperty("error").GetProperty("name").GetString());
        Assert.Equal(2, attempts);
        await SendAsync(socket, "message", 2);
        using var nextAck = await ReceiveAsync(socket);
        var next = await fixture.ReadAsync();
        Assert.Equal("3", next.Headers["ce-id"]);
        Assert.Equal("", next.Headers["ce-connectionState"]);
        Assert.Equal("affinity=user", next.Headers["Cookie"]);
        Assert.Equal(first.Headers["ce-signature"], next.Headers["ce-signature"]);
    }

    [Theory]
    [InlineData(400, "text/plain", "private upstream error")]
    [InlineData(429, "text/plain", "private upstream error")]
    [InlineData(200, "unsupported/type", "nonempty")]
    public async Task FailureDoesNotUpdateStateOrCacheAck(int status, string contentType, string body)
    {
        var count = 0;
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            if (++count > 1) return;
            context.Response.StatusCode = status;
            context.Response.ContentType = contentType;
            context.Response.Headers["ce-connectionState"] = "must-not-apply";
            context.Response.Headers["x-webpubsub-metadata-error"] = "must-not-forward";
            await context.Response.WriteAsync(body);
        });
        using var socket = await fixture.ConnectAsync();
        await SendAsync(socket, "message");
        using var failed = await ReceiveAsync(socket);
        Assert.False(failed.RootElement.GetProperty("success").GetBoolean());
        Assert.False(failed.RootElement.TryGetProperty("metadata", out _));
        Assert.Equal("Internal server error", failed.RootElement.GetProperty("error").GetProperty("message").GetString());
        await fixture.ReadAsync();
        await SendAsync(socket, "message");
        using var success = await ReceiveAsync(socket);
        Assert.True(success.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("initial", (await fixture.ReadAsync()).Headers["ce-connectionState"]);
        Assert.Equal(2, count);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task OversizedResponseFailsWithOrWithoutContentLength(bool knownLength)
    {
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            if (knownLength) context.Response.ContentLength = 16 * 1024 * 1024 + 1;
            var block = new byte[64 * 1024];
            for (var i = 0; i < 257; i++) await context.Response.Body.WriteAsync(block, context.RequestAborted);
        });
        using var socket = await fixture.ConnectAsync();
        await SendAsync(socket, "message");
        using var ack = await ReceiveAsync(socket);
        Assert.False(ack.RootElement.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task FirstMatchingHandlerWinsWithoutDefaultHubFallback()
    {
        await using var fixture = await Fixture.StartAsync(context =>
        {
            context.Response.ContentType = "text/plain";
            return context.Response.WriteAsync(context.Request.Path);
        }, extraSettings: new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventHandlers:1:UrlTemplate"] = "http://127.0.0.1:1/must-not-call",
            ["WebPubSub:Hubs:chat:EventHandlers:1:EventPattern"] = "*",
            ["WebPubSub:Hubs:_default:EventHandlers:0:UrlTemplate"] = "http://127.0.0.1:1/must-not-call",
            ["WebPubSub:Hubs:_default:EventHandlers:0:EventPattern"] = "*",
        });
        using var socket = await fixture.ConnectAsync();
        await SendAsync(socket, "message");
        using var data = await ReceiveAsync(socket);
        Assert.Equal("/events/chat/message", data.RootElement.GetProperty("data").GetString());
        using var ack = await ReceiveAsync(socket);
        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        await Assert.ThrowsAsync<InvalidOperationException>(() => fixture.Dispatcher.DispatchUserEventAsync(
            new UpstreamConnectionContext("missing", "unconfigured", null, null, "localhost"),
            new ClientMessagePayload("message", new MessageData(MessageDataType.Text, ReadOnlyMemory<byte>.Empty)), CancellationToken.None));
    }

    [Fact]
    public async Task ValidationFailureNeverDispatchesUserEvent()
    {
        await using var fixture = await Fixture.StartAsync(_ => Task.CompletedTask, allowOrigin: false);
        await Assert.ThrowsAsync<HttpRequestException>(() => fixture.Dispatcher.DispatchUserEventAsync(
            new UpstreamConnectionContext("blocked", "chat", null, null, "localhost"),
            new ClientMessagePayload("message", new MessageData(MessageDataType.Text, ReadOnlyMemory<byte>.Empty)), CancellationToken.None));
        Assert.False(fixture.Events.Reader.TryRead(out _));
    }

    [Fact]
    public async Task ReliableResponseWithoutAckIsReplayedAfterRecovery()
    {
        await using var fixture = await Fixture.StartAsync(context =>
        {
            context.Response.ContentType = "text/plain";
            return context.Response.WriteAsync("reply");
        });
        using var socket = await fixture.ConnectAsync(reliable: true);
        await socket.SendAsync("{\"type\":\"event\",\"event\":\"message\",\"dataType\":\"text\",\"data\":\"hello\"}"u8.ToArray(),
            WebSocketMessageType.Text, true, CancellationToken.None);
        using var data = await ReceiveAsync(socket);
        Assert.Equal(1, data.RootElement.GetProperty("sequenceId").GetInt32());
        Assert.Equal("reply", data.RootElement.GetProperty("data").GetString());
        var received = await fixture.ReadAsync();
        socket.Abort();
        using var recovered = new ClientWebSocket();
        recovered.Options.AddSubProtocol("json.reliable.webpubsub.azure.v1");
        await recovered.ConnectAsync(fixture.RecoveryUri(received.Headers["ce-connectionId"]), CancellationToken.None).WaitAsync(Timeout);
        using var replay = await ReceiveAsync(recovered);
        Assert.Equal(data.RootElement.GetRawText(), replay.RootElement.GetRawText());
        Assert.False(fixture.Events.Reader.TryRead(out _));
    }

    [Fact]
    public async Task CancellationReachesHttpRequest()
    {
        var aborted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            using var registration = context.RequestAborted.Register(() => aborted.TrySetResult());
            await aborted.Task.WaitAsync(Timeout);
        });
        using var cancellation = new CancellationTokenSource();
        var context = new UpstreamConnectionContext("connection", "chat", null, null, "localhost");
        var sending = fixture.Dispatcher.DispatchUserEventAsync(context,
            new ClientMessagePayload("message", new MessageData(MessageDataType.Text, "hello"u8.ToArray())), cancellation.Token);
        await fixture.ReadAsync();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => sending);
        await aborted.Task.WaitAsync(Timeout);
    }

    private static Task SendAsync(ClientWebSocket socket, string name, int ackId = 1) => socket.SendAsync(
        Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { type = "event", @event = name, ackId, dataType = "text", data = "hello" })),
        WebSocketMessageType.Text, true, CancellationToken.None);

    private static async Task<JsonDocument> ReceiveAsync(ClientWebSocket socket)
    {
        var buffer = new byte[4096];
        var result = await socket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(Timeout);
        Assert.Equal(WebSocketMessageType.Text, result.MessageType);
        Assert.True(result.EndOfMessage);
        return JsonDocument.Parse(buffer.AsMemory(0, result.Count));
    }

    private sealed record Received(byte[] Body, Dictionary<string, string> Headers);

    private sealed class Fixture(WebApplication upstream, WebApplication app, Channel<Received> events) : IAsyncDisposable
    {
        public Channel<Received> Events => events;
        public UpstreamEventDispatcher Dispatcher => app.Services.GetRequiredService<UpstreamEventDispatcher>();
        public Task<Received> ReadAsync() => events.Reader.ReadAsync().AsTask().WaitAsync(Timeout);
        private string? _reconnectionToken;

        public Uri RecoveryUri(string connectionId) => new(app.Urls.Single().Replace("http:", "ws:") +
            $"/client/hubs/chat?awps_connection_id={connectionId}&awps_reconnection_token={Uri.EscapeDataString(_reconnectionToken!)}");

        public async Task<ClientWebSocket> ConnectAsync(bool reliable = false)
        {
            var endpoint = app.Urls.Single() + "/client/hubs/chat";
            var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
                audience: endpoint, expires: DateTime.UtcNow.AddHours(1), signingCredentials: new SigningCredentials(
                    new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)), SecurityAlgorithms.HmacSha256)));
            var socket = new ClientWebSocket();
            socket.Options.AddSubProtocol(reliable ? "json.reliable.webpubsub.azure.v1" : "json.webpubsub.azure.v1");
            await socket.ConnectAsync(new Uri(endpoint.Replace("http:", "ws:") + "?access_token=" + token), CancellationToken.None).WaitAsync(Timeout);
            using var connected = await ReceiveAsync(socket);
            Assert.Equal("connected", connected.RootElement.GetProperty("event").GetString());
            if (reliable) _reconnectionToken = connected.RootElement.GetProperty("reconnectionToken").GetString();
            return socket;
        }

        public async ValueTask DisposeAsync()
        {
            await app.DisposeAsync();
            await upstream.DisposeAsync();
        }

        public static async Task<Fixture> StartAsync(Func<HttpContext, Task> onEvent, string? pattern = "*",
            Dictionary<string, string?>? extraSettings = null, bool allowOrigin = true)
        {
            var events = Channel.CreateUnbounded<Received>();
            var builder = WebApplication.CreateBuilder(["--urls=http://127.0.0.1:0"]);
            builder.Logging.ClearProviders();
            var upstream = builder.Build();
            upstream.Run(async context =>
            {
                if (HttpMethods.IsOptions(context.Request.Method))
                {
                    if (allowOrigin) context.Response.Headers["WebHook-Allowed-Origin"] = "*";
                    return;
                }
                if (context.Request.Headers["ce-type"].ToString().StartsWith("azure.webpubsub.sys.", StringComparison.Ordinal))
                {
                    context.Response.Headers["ce-connectionState"] = "initial";
                    return;
                }
                using var body = new MemoryStream();
                await context.Request.Body.CopyToAsync(body);
                events.Writer.TryWrite(new Received(body.ToArray(), context.Request.Headers.ToDictionary(
                    h => h.Key, h => h.Value.ToString(), StringComparer.OrdinalIgnoreCase)));
                await onEvent(context);
            });
            await upstream.StartAsync();
            var emulator = EmulatorApplication.CreateBuilder(["--urls=http://127.0.0.1:0"]);
            emulator.Logging.ClearProviders();
            emulator.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["WebPubSub:Hubs:chat:EventHandlers:0:UrlTemplate"] = upstream.Urls.Single() + "/events/{hub}/{event}",
                ["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:0"] = "connect",
                ["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:1"] = "connected",
                ["WebPubSub:Hubs:chat:EventHandlers:0:EventPattern"] = pattern,
            });
            if (extraSettings is not null) emulator.Configuration.AddInMemoryCollection(extraSettings);
            var app = EmulatorApplication.Build(emulator);
            await app.StartAsync();
            return new Fixture(upstream, app, events);
        }
    }
}