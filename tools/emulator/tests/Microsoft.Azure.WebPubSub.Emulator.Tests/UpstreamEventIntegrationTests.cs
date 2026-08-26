// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Azure.Messaging.WebPubSub;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class UpstreamEventIntegrationTests
{
    private const string AccessKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH";
    private const string ConnectionString = $"Endpoint=http://localhost;AccessKey={AccessKey};Version=1.0;";
    private const string Hub = "testHub";
    private const string ReliableProtocol = "json.reliable.webpubsub.azure.v1";

    [Fact]
    public async Task HttpHandler_ConnectResponseOverridesConnectionAndReceivesLifecycleEvents()
    {
        var requests = Channel.CreateUnbounded<ReceivedEvent>();
        await using var handler = await StartEventHandlerAsync(requests, async (context, eventName) =>
        {
            if (eventName == "connect")
            {
                context.Response.Headers["ce-connectionState"] = "initial-state";
                context.Response.ContentType = "application/json";
                await JsonSerializer.SerializeAsync(context.Response.Body, new
                {
                    userId = "handler-user",
                    roles = new[] { "webpubsub.sendToGroups.room-*" },
                    groups = new[] { "room-a" },
                    subprotocol = ReliableProtocol,
                });
            }
        });
        await using var emulator = await StartEmulatorAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = $"{handler.Urls.Single()}/events/{{hub}}/{{event}}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "*",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:0"] = "connect",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:1"] = "connected",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:2"] = "disconnected",
        });
        using var webSocket = await ConnectAsync(emulator);

        using var connected = await ReceiveJsonAsync(webSocket);
        Assert.Equal("handler-user", connected.RootElement.GetProperty("userId").GetString());

        var connectEvent = await ReadEventAsync(requests);
        Assert.Equal("connect", connectEvent.EventName);
        Assert.Equal("azure.webpubsub.sys.connect", connectEvent.Headers["ce-type"]);
        Assert.Equal("1.0", connectEvent.Headers["ce-specversion"]);
        Assert.Equal(Hub, connectEvent.Headers["ce-hub"]);
        Assert.Equal("0", connectEvent.Headers["ce-id"]);
        Assert.Equal(
            CreateExpectedSignature(connectEvent.Headers["ce-connectionId"]),
            connectEvent.Headers["ce-signature"]);
        using (var body = JsonDocument.Parse(connectEvent.Body))
        {
            Assert.False(body.RootElement.GetProperty("query").TryGetProperty("access_token", out _));
            Assert.False(body.RootElement.GetProperty("headers").TryGetProperty("Authorization", out _));
            Assert.Contains(
                ReliableProtocol,
                body.RootElement.GetProperty("subprotocols").EnumerateArray().Select(item => item.GetString()));
        }

        var connectedEvent = await ReadEventAsync(requests);
        Assert.Equal("connected", connectedEvent.EventName);
        Assert.Equal("1", connectedEvent.Headers["ce-id"]);
        Assert.Equal("initial-state", connectedEvent.Headers["ce-connectionState"]);

        await SendJsonAsync(
            webSocket,
            """{"type":"sendToGroup","group":"room-a","dataType":"text","data":"hello","ackId":1}""");
        using (var message = await ReceiveJsonAsync(webSocket))
        {
            Assert.Equal("message", message.RootElement.GetProperty("type").GetString());
            Assert.Equal("hello", message.RootElement.GetProperty("data").GetString());
        }
        using (var ack = await ReceiveJsonAsync(webSocket))
        {
            Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        }

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None).OrTimeout();
        var disconnectedEvent = await ReadEventAsync(requests);
        Assert.Equal("disconnected", disconnectedEvent.EventName);
        Assert.Equal("2", disconnectedEvent.Headers["ce-id"]);
        using var disconnectedBody = JsonDocument.Parse(disconnectedEvent.Body);
        Assert.False(string.IsNullOrEmpty(
            disconnectedBody.RootElement.GetProperty("reason").GetString()));
    }

    [Fact]
    public async Task UserEvent_HandlerResponseAndEventHubListenerAreBothDelivered()
    {
        var requests = Channel.CreateUnbounded<ReceivedEvent>();
        await using var handler = await StartEventHandlerAsync(requests, async (context, _) =>
        {
            context.Response.Headers["ce-connectionState"] = "updated-state";
            context.Response.Headers["X-WebPubSub-Metadata-Result"] = "handled";
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync("handler-response");
        });
        var eventHub = new RecordingEventHubPublisher();
        await using var emulator = await StartEmulatorAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = $"{handler.Urls.Single()}/events/{{hub}}/{{event}}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "chat-*",
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventNameFilter:UserEventPattern"] = "chat-message",
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventHubEndpoint:FullyQualifiedNamespace"] = "events.servicebus.windows.net",
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventHubEndpoint:EventHubName"] = "client-events",
        }, eventHub);
        using var webSocket = await ConnectAsync(emulator);
        _ = await ReceiveJsonAsync(webSocket);

        await SendJsonAsync(
            webSocket,
            """{"type":"event","event":"chat-message","dataType":"text","data":"client-payload","metadata":{"TraceId":"abc-123"},"ackId":7}""");

        using (var response = await ReceiveJsonAsync(webSocket))
        {
            Assert.Equal("message", response.RootElement.GetProperty("type").GetString());
            Assert.Equal("server", response.RootElement.GetProperty("from").GetString());
            Assert.Equal("handler-response", response.RootElement.GetProperty("data").GetString());
            Assert.Equal(
                "handled",
                response.RootElement.GetProperty("metadata").GetProperty("result").GetString());
        }
        using (var ack = await ReceiveJsonAsync(webSocket))
        {
            Assert.Equal(7UL, ack.RootElement.GetProperty("ackId").GetUInt64());
            Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        }

        var handlerEvent = await ReadEventAsync(requests);
        Assert.Equal("chat-message", handlerEvent.EventName);
        Assert.Equal("azure.webpubsub.user.chat-message", handlerEvent.Headers["ce-type"]);
        Assert.Equal("abc-123", handlerEvent.Headers["X-WebPubSub-Metadata-traceid"]);
        Assert.Equal("client-payload", Encoding.UTF8.GetString(handlerEvent.Body));

        var published = await eventHub.Events.Reader.ReadAsync().AsTask().OrTimeout();
        Assert.Equal("chat-message", published.Event.EventName);
        Assert.Equal("client-payload", Encoding.UTF8.GetString(published.Event.Data.Bytes));
        Assert.Equal("abc-123", published.Event.Data.Metadata!["TraceId"]);
        Assert.Equal("events.servicebus.windows.net", published.Endpoint.FullyQualifiedNamespace);
        Assert.Equal("client-events", published.Endpoint.EventHubName);

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None).OrTimeout();
    }

    [Fact]
    public async Task UserEvent_MetadataOnlyHandlerResponse_IsDelivered()
    {
        var requests = Channel.CreateUnbounded<ReceivedEvent>();
        await using var handler = await StartEventHandlerAsync(requests, (context, _) =>
        {
            context.Response.Headers["X-WebPubSub-Metadata-Result"] = "north,west";
            return Task.CompletedTask;
        });
        await using var emulator = await StartEmulatorAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = $"{handler.Urls.Single()}/events/{{hub}}/{{event}}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "chat-message",
        });
        using var webSocket = await ConnectAsync(emulator);
        _ = await ReceiveJsonAsync(webSocket);

        await SendJsonAsync(
            webSocket,
            """{"type":"event","event":"chat-message","dataType":"text","data":"client-payload","ackId":7}""");

        using (var response = await ReceiveJsonAsync(webSocket))
        {
            Assert.Equal("message", response.RootElement.GetProperty("type").GetString());
            Assert.Equal(string.Empty, response.RootElement.GetProperty("data").GetString());
            Assert.Equal(
                "north,west",
                response.RootElement.GetProperty("metadata").GetProperty("result").GetString());
        }
        using (var ack = await ReceiveJsonAsync(webSocket))
        {
            Assert.Equal(7UL, ack.RootElement.GetProperty("ackId").GetUInt64());
            Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        }

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None).OrTimeout();
    }

    [Fact]
    public async Task UserEvent_InvalidHandlerResponseMetadata_ReturnsErrorAck()
    {
        var requests = Channel.CreateUnbounded<ReceivedEvent>();
        await using var handler = await StartEventHandlerAsync(requests, (context, _) =>
        {
            context.Response.Headers["X-WebPubSub-Metadata-Result"] = new string('a', 1025);
            return Task.CompletedTask;
        });
        await using var emulator = await StartEmulatorAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = $"{handler.Urls.Single()}/events/{{hub}}/{{event}}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "chat-message",
        });
        using var webSocket = await ConnectAsync(emulator);
        _ = await ReceiveJsonAsync(webSocket);

        await SendJsonAsync(
            webSocket,
            """{"type":"event","event":"chat-message","dataType":"text","data":"client-payload","ackId":8}""");

        using var ack = await ReceiveJsonAsync(webSocket);
        Assert.Equal(8UL, ack.RootElement.GetProperty("ackId").GetUInt64());
        Assert.False(ack.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(
            "InternalServerError",
            ack.RootElement.GetProperty("error").GetProperty("name").GetString());

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None).OrTimeout();
    }

    [Fact]
    public async Task UserEvent_WithOnlyEventHubListener_ReturnsSuccessAck()
    {
        var eventHub = new RecordingEventHubPublisher();
        await using var emulator = await StartEmulatorAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventNameFilter:UserEventPattern"] = "*",
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventHubEndpoint:FullyQualifiedNamespace"] = "events.servicebus.windows.net",
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventHubEndpoint:EventHubName"] = "client-events",
        }, eventHub);
        using var webSocket = await ConnectAsync(emulator);
        _ = await ReceiveJsonAsync(webSocket);

        await SendJsonAsync(
            webSocket,
            """{"type":"event","event":"telemetry","dataType":"json","data":{"value":42},"ackId":9}""");

        using var ack = await ReceiveJsonAsync(webSocket);
        Assert.Equal("ack", ack.RootElement.GetProperty("type").GetString());
        Assert.Equal(9UL, ack.RootElement.GetProperty("ackId").GetUInt64());
        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        var published = await eventHub.Events.Reader.ReadAsync().AsTask().OrTimeout();
        Assert.Equal("telemetry", published.Event.EventName);

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None).OrTimeout();
    }

    [Fact]
    public async Task EventHubListener_ReceivesConnectedAndDisconnectedButNotConnect()
    {
        var eventHub = new RecordingEventHubPublisher();
        await using var emulator = await StartEmulatorAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventNameFilter:SystemEvents:0"] = "connected",
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventNameFilter:SystemEvents:1"] = "disconnected",
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventHubEndpoint:FullyQualifiedNamespace"] = "events.servicebus.windows.net",
            ["WebPubSub:Hubs:testHub:EventListeners:0:EventHubEndpoint:EventHubName"] = "lifecycle-events",
        }, eventHub);
        using var webSocket = await ConnectAsync(emulator);
        _ = await ReceiveJsonAsync(webSocket);

        var connected = await eventHub.Events.Reader.ReadAsync().AsTask().OrTimeout();
        Assert.Equal("connected", connected.Event.EventName);

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None).OrTimeout();
        var disconnected = await eventHub.Events.Reader.ReadAsync().AsTask().OrTimeout();
        Assert.Equal("disconnected", disconnected.Event.EventName);
        Assert.Equal(connected.Event.ConnectionId, disconnected.Event.ConnectionId);
    }

    [Fact]
    public async Task RawWebSocket_MessageIsDispatchedAndHandlerResponseIsReturned()
    {
        var requests = Channel.CreateUnbounded<ReceivedEvent>();
        await using var handler = await StartEventHandlerAsync(requests, async (context, _) =>
        {
            context.Response.ContentType = "text/plain";
            await context.Response.WriteAsync("raw-response");
        });
        await using var emulator = await StartEmulatorAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = $"{handler.Urls.Single()}/events/{{hub}}/{{event}}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "message",
        });
        using var webSocket = await ConnectAsync(emulator, subprotocol: null);

        await webSocket.SendAsync(
            "raw-request"u8.ToArray(),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).OrTimeout();

        var buffer = new byte[128];
        var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None).OrTimeout();
        Assert.Equal(WebSocketMessageType.Text, result.MessageType);
        Assert.Equal("raw-response", Encoding.UTF8.GetString(buffer, 0, result.Count));
        var upstream = await ReadEventAsync(requests);
        Assert.Equal("message", upstream.EventName);
        Assert.Equal("raw-request", Encoding.UTF8.GetString(upstream.Body));

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None).OrTimeout();
    }

    [Fact]
    public async Task RawWebSocket_WhenMessageHandlerRejects_ClosesConnection()
    {
        var requests = Channel.CreateUnbounded<ReceivedEvent>();
        await using var handler = await StartEventHandlerAsync(requests, (context, _) =>
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            return Task.CompletedTask;
        });
        await using var emulator = await StartEmulatorAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = $"{handler.Urls.Single()}/events/{{hub}}/{{event}}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "message",
        });
        using var webSocket = await ConnectAsync(emulator, subprotocol: null);

        await webSocket.SendAsync(
            "rejected"u8.ToArray(),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).OrTimeout();
        var buffer = new byte[256];
        var close = await webSocket.ReceiveAsync(buffer, CancellationToken.None).OrTimeout();

        Assert.Equal(WebSocketMessageType.Close, close.MessageType);
        Assert.Equal(WebSocketCloseStatus.InternalServerError, close.CloseStatus);
    }

    [Fact]
    public async Task ConnectedHandler_DoesNotBlockClientMessages()
    {
        var requests = Channel.CreateUnbounded<ReceivedEvent>();
        var handlerStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseHandler = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var handler = await StartEventHandlerAsync(requests, async (_, eventName) =>
        {
            if (eventName == "connected")
            {
                handlerStarted.TrySetResult();
                await releaseHandler.Task;
            }
        });
        await using var emulator = await StartEmulatorAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = $"{handler.Urls.Single()}/events/{{hub}}/{{event}}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:0"] = "connected",
        });
        using var webSocket = await ConnectAsync(emulator);

        try
        {
            _ = await ReceiveJsonAsync(webSocket);
            await handlerStarted.Task.OrTimeout();
            await SendJsonAsync(webSocket, """{"type":"ping"}""");
            using var pong = await ReceiveJsonAsync(webSocket);
            Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
        }
        finally
        {
            releaseHandler.TrySetResult();
        }
    }

    [Fact]
    public void EventHubPublisher_MessageMatchesRuntimeAmqpBinding()
    {
        var upstreamEvent = new UpstreamEvent(
            42,
            Hub,
            "chat",
            UpstreamEventCategory.User,
            "connection-1",
            "user-1",
            ReliableProtocol,
            "state-1",
            new MessageData(MessageDataType.Json, "{\"value\":42}"u8.ToArray()),
            "localhost");

        var (eventData, sendOptions) = EventHubPublisher.CreateMessage(upstreamEvent);

        Assert.Equal("connection-1/42", eventData.MessageId);
        Assert.Equal("application/json", eventData.ContentType);
        Assert.Equal("connection-1", sendOptions.PartitionKey);
        Assert.Equal("1.0", eventData.Properties["cloudEvents:specversion"]);
        Assert.Equal("azure.webpubsub.user.chat", eventData.Properties["cloudEvents:type"]);
        Assert.Equal("/hubs/testHub/client/connection-1", eventData.Properties["cloudEvents:source"]);
        Assert.Equal("42", eventData.Properties["cloudEvents:id"]);
        Assert.Equal(Hub, eventData.Properties["cloudEvents:hub"]);
        Assert.Equal("chat", eventData.Properties["cloudEvents:eventname"]);
        Assert.Equal("connection-1", eventData.Properties["cloudEvents:connectionid"]);
        Assert.Equal("user-1", eventData.Properties["cloudEvents:userid"]);
        Assert.Equal(ReliableProtocol, eventData.Properties["cloudEvents:subprotocol"]);
        Assert.Equal("state-1", eventData.Properties["cloudEvents:connectionstate"]);
    }

    private static async Task<WebApplication> StartEmulatorAsync(
        IReadOnlyDictionary<string, string?> configuration,
        IEventHubPublisher? eventHubPublisher = null)
    {
        var builder = EmulatorApplication.CreateBuilder(runtimeOptions: new EmulatorRuntimeOptions
        {
            ReconnectTimeout = TimeSpan.FromSeconds(1),
        });
        builder.WebHost.UseTestServer();
        var values = new Dictionary<string, string?>(configuration)
        {
            ["WebPubSub:ConnectionString"] = ConnectionString,
        };
        builder.Configuration.AddInMemoryCollection(values);
        if (eventHubPublisher is not null)
        {
            builder.Services.RemoveAll<IEventHubPublisher>();
            builder.Services.AddSingleton(eventHubPublisher);
        }

        var application = EmulatorApplication.Build(builder);
        await application.StartAsync().OrTimeout();
        return application;
    }

    private static async Task<WebApplication> StartEventHandlerAsync(
        Channel<ReceivedEvent> requests,
        Func<HttpContext, string, Task> respond)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls($"http://127.0.0.1:{GetAvailablePort()}");
        var application = builder.Build();
        application.MapPost("/events/{hub}/{event}", async context =>
        {
            var eventName = context.Request.RouteValues["event"]!.ToString()!;
            using var body = new MemoryStream();
            await context.Request.Body.CopyToAsync(body);
            var headers = context.Request.Headers.ToDictionary(
                item => item.Key,
                item => item.Value.ToString(),
                StringComparer.OrdinalIgnoreCase);
            await requests.Writer.WriteAsync(new(eventName, headers, body.ToArray()));
            await respond(context, eventName);
        });
        await application.StartAsync().OrTimeout();
        return application;
    }

    private static async Task<WebSocket> ConnectAsync(
        WebApplication application,
        string? subprotocol = ReliableProtocol)
    {
        var serviceClient = new WebPubSubServiceClient(ConnectionString, Hub);
        var uri = serviceClient.GetClientAccessUri();
        var token = QueryHelpers.ParseQuery(uri.Query)["access_token"].ToString();
        var client = application.GetTestServer().CreateWebSocketClient();
        if (subprotocol is not null)
        {
            client.SubProtocols.Add(subprotocol);
        }
        return await client.ConnectAsync(
            new Uri($"ws://localhost/client/hubs/{Hub}?access_token={Uri.EscapeDataString(token)}"),
            CancellationToken.None).OrTimeout();
    }

    private static async Task<ReceivedEvent> ReadEventAsync(Channel<ReceivedEvent> events)
    {
        return await events.Reader.ReadAsync().AsTask().OrTimeout();
    }

    private static Task SendJsonAsync(WebSocket webSocket, string json)
    {
        return webSocket.SendAsync(
            Encoding.UTF8.GetBytes(json),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None);
    }

    private static async Task<JsonDocument> ReceiveJsonAsync(WebSocket webSocket)
    {
        var buffer = new byte[1024];
        using var message = new MemoryStream();
        while (true)
        {
            var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None).OrTimeout();
            Assert.NotEqual(WebSocketMessageType.Close, result.MessageType);
            message.Write(buffer, 0, result.Count);
            if (result.EndOfMessage)
            {
                return JsonDocument.Parse(message.ToArray());
            }
        }
    }

    private static int GetAvailablePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            return ((IPEndPoint)listener.LocalEndpoint).Port;
        }
        finally
        {
            listener.Stop();
        }
    }

    private static string CreateExpectedSignature(string connectionId)
    {
        var hash = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(AccessKey),
            Encoding.UTF8.GetBytes(connectionId));
        return $"sha256={Convert.ToHexStringLower(hash)}";
    }

    private sealed record ReceivedEvent(
        string EventName,
        IReadOnlyDictionary<string, string> Headers,
        byte[] Body);

    private sealed class RecordingEventHubPublisher : IEventHubPublisher
    {
        public Channel<(UpstreamEvent Event, EventHubEndpointOptions Endpoint)> Events { get; } =
            Channel.CreateUnbounded<(UpstreamEvent, EventHubEndpointOptions)>();

        public Task PublishAsync(
            UpstreamEvent upstreamEvent,
            EventHubEndpointOptions endpoint,
            CancellationToken cancellationToken)
        {
            return Events.Writer.WriteAsync((upstreamEvent, endpoint), cancellationToken).AsTask();
        }
    }
}
