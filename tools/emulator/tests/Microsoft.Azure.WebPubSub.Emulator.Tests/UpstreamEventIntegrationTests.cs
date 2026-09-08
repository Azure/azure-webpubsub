// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Azure.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class UpstreamEventIntegrationTests
{
    private const string Hub = "testHub";
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(30);

    [Fact]
    public async Task HttpHandlerProcessesConnectionLifecycleAndUserEvent()
    {
        var handler = new RecordingEventHandler(request =>
        {
            var eventName = request.Headers.GetValues("ce-eventName").Single();
            if (eventName == "connect")
            {
                var response = new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = JsonContent.Create(new
                    {
                        userId = "handler-user",
                        roles = new[] { "webpubsub.sendToGroups.room-*" },
                        groups = new[] { "room-a" },
                    }),
                };
                response.Headers.TryAddWithoutValidation("ce-connectionState", "initial-state");
                return response;
            }
            if (eventName == "chat-message")
            {
                var response = new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("handler-response", Encoding.UTF8, "text/plain"),
                };
                response.Headers.TryAddWithoutValidation("ce-connectionState", "updated-state");
                response.Headers.TryAddWithoutValidation("X-WebPubSub-Metadata-Result", "handled");
                return response;
            }
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        await using var application = await StartApplicationAsync(handler, new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = "http://handler/events/{hub}/{event}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "chat-*",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:0"] = "connect",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:1"] = "connected",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:2"] = "disconnected",
        });
        using var webSocket = await ConnectAsync(application, WebPubSubJsonV1PayloadProcessor.SubprotocolName);

        using (var connected = await ReceiveJsonAsync(webSocket))
        {
            Assert.Equal("handler-user", connected.RootElement.GetProperty("userId").GetString());
        }
        var connect = await handler.ReadAsync();
        Assert.Equal("connect", connect.EventName);
        Assert.Equal("0", connect.Headers["ce-id"]);
        Assert.Equal("azure.webpubsub.sys.connect", connect.Headers["ce-type"]);
        using (var connectBody = JsonDocument.Parse(connect.Body))
        {
            Assert.False(connectBody.RootElement.GetProperty("query").TryGetProperty("access_token", out _));
        }
        var connectedEvent = await handler.ReadAsync();
        Assert.Equal("connected", connectedEvent.EventName);
        Assert.Equal("1", connectedEvent.Headers["ce-id"]);
        Assert.Equal("initial-state", connectedEvent.Headers["ce-connectionState"]);

        await SendTextAsync(
            webSocket,
            """{"type":"event","event":"chat-message","dataType":"text","data":"client-payload","metadata":{"TraceId":"abc-123"},"ackId":7}""");
        using (var response = await ReceiveJsonAsync(webSocket))
        {
            Assert.Equal("handler-response", response.RootElement.GetProperty("data").GetString());
            Assert.Equal("handled", response.RootElement.GetProperty("metadata").GetProperty("result").GetString());
        }
        using (var ack = await ReceiveJsonAsync(webSocket))
        {
            Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        }
        var userEvent = await handler.ReadAsync();
        Assert.Equal("chat-message", userEvent.EventName);
        Assert.Equal("abc-123", userEvent.Headers["X-WebPubSub-Metadata-traceid"]);
        Assert.Equal("client-payload", Encoding.UTF8.GetString(userEvent.Body));

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None).WaitAsync(TestTimeout);
        var disconnected = await handler.ReadAsync();
        Assert.Equal("disconnected", disconnected.EventName);
        Assert.Equal("updated-state", disconnected.Headers["ce-connectionState"]);
    }

    [Theory]
    [InlineData(null, "token-group")]
    [InlineData("[]", "token-group")]
    [InlineData("[\"handler-group\"]", "handler-group")]
    public async Task ConnectResponseGroupsOverrideOnlyWhenNonEmpty(
        string? responseGroups,
        string expectedGroup)
    {
        var handler = new RecordingEventHandler(request =>
        {
            if (request.Headers.GetValues("ce-eventName").Single() != "connect")
            {
                return new HttpResponseMessage(HttpStatusCode.OK);
            }

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    responseGroups is null ? "{}" : $"{{\"groups\":{responseGroups}}}",
                    Encoding.UTF8,
                    "application/json"),
            };
        });
        await using var application = await StartApplicationAsync(handler, new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = "http://handler/events/{hub}/{event}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:0"] = "connect",
        });
        using var webSocket = await ConnectAsync(
            application,
            WebPubSubJsonV1PayloadProcessor.SubprotocolName,
            [new Claim("webpubsub.group", "token-group")]);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;

        var connections = application.Services.GetRequiredService<ConnectionManager>();
        Assert.True(connections.TryGet(Hub.ToLowerInvariant(), connectionId, out var connection));
        Assert.Equal([expectedGroup], connection.Groups.Keys);
    }

    [Fact]
    public async Task RawMessageIsDispatchedAndHandlerResponseIsReturned()
    {
        var handler = new RecordingEventHandler(request => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("raw-response", Encoding.UTF8, "text/plain"),
        });
        await using var application = await StartApplicationAsync(handler, new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = "http://handler/events/{hub}/{event}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "message",
        });
        using var webSocket = await ConnectAsync(application, subprotocol: null);

        await webSocket.SendAsync(
            "raw-request"u8.ToArray(),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);
        var buffer = new byte[128];
        var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Text, result.MessageType);
        Assert.Equal("raw-response", Encoding.UTF8.GetString(buffer, 0, result.Count));
        var upstream = await handler.ReadAsync();
        Assert.Equal("message", upstream.EventName);
        Assert.Equal("raw-request", Encoding.UTF8.GetString(upstream.Body));
    }

    [Fact]
    public async Task ConnectHandlerCanSelectRequestedCustomSubprotocol()
    {
        const string customSubprotocol = "custom.protocol";
        var handler = new RecordingEventHandler(request =>
        {
            var eventName = request.Headers.GetValues("ce-eventName").Single();
            return eventName == "connect"
                ? new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = JsonContent.Create(new { subprotocol = customSubprotocol }),
                }
                : new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("custom-response", Encoding.UTF8, "text/plain"),
                };
        });
        await using var application = await StartApplicationAsync(handler, new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] =
                "http://handler/events/{hub}/{event}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "message",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:0"] = "connect",
        });
        using var webSocket = await ConnectAsync(application, customSubprotocol);

        Assert.Equal(customSubprotocol, webSocket.SubProtocol);
        await webSocket.SendAsync(
            "custom-request"u8.ToArray(),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);
        var buffer = new byte[128];
        var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Text, result.MessageType);
        Assert.Equal("custom-response", Encoding.UTF8.GetString(buffer, 0, result.Count));
        Assert.Equal("connect", (await handler.ReadAsync()).EventName);
        var upstream = await handler.ReadAsync();
        Assert.Equal("message", upstream.EventName);
        Assert.Equal(customSubprotocol, upstream.Headers["ce-subprotocol"]);
        Assert.Equal("custom-request", Encoding.UTF8.GetString(upstream.Body));
    }

    [Fact]
    public async Task AppServerCloseReportsReasonToDisconnectedHandler()
    {
        var handler = new RecordingEventHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        await using var application = await StartApplicationAsync(handler, new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] = "http://handler/events/{hub}/{event}",
            ["WebPubSub:Hubs:testHub:EventHandlers:0:SystemEvents:0"] = "disconnected",
        });
        using var webSocket = await ConnectAsync(application, WebPubSubJsonV1PayloadProcessor.SubprotocolName);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;

        var connections = application.Services.GetRequiredService<ConnectionManager>();
        var normalizedHub = Hub.ToLowerInvariant();
        Assert.True(connections.TryGet(normalizedHub, connectionId, out _));
        connections.CloseConnection(normalizedHub, connectionId, "server-close");
        Assert.False(connections.TryGet(normalizedHub, connectionId, out _));

        var disconnected = await handler.ReadAsync();
        using var body = JsonDocument.Parse(disconnected.Body);
        Assert.Equal("disconnected", disconnected.EventName);
        Assert.Equal(
            "Application server closed the connection. Reason: server-close",
            body.RootElement.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task ManagedIdentityHandlerAuthUsesConfiguredResourceScope()
    {
        var credential = new RecordingTokenCredential();
        var handler = new RecordingEventHandler(request =>
        {
            Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
            Assert.Equal("test-token", request.Headers.Authorization?.Parameter);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        await using var application = await StartApplicationAsync(
            handler,
            new Dictionary<string, string?>
            {
                ["WebPubSub:Hubs:testHub:EventHandlers:0:UrlTemplate"] =
                    "http://handler/events/{hub}/{event}",
                ["WebPubSub:Hubs:testHub:EventHandlers:0:EventPattern"] = "telemetry",
                ["WebPubSub:Hubs:testHub:EventHandlers:0:Auth:Type"] = "ManagedIdentity",
                ["WebPubSub:Hubs:testHub:EventHandlers:0:Auth:ManagedIdentity:Resource"] =
                    "https://handler.example/",
            },
            credential: credential);
        using var webSocket = await ConnectAsync(application, WebPubSubJsonV1PayloadProcessor.SubprotocolName);
        using var connected = await ReceiveJsonAsync(webSocket);

        await SendTextAsync(
            webSocket,
            """{"type":"event","event":"telemetry","data":"value","ackId":1}""");
        using var ack = await ReceiveJsonAsync(webSocket);

        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("https://handler.example/.default", Assert.Single(credential.Scopes));
    }

    private static async Task<WebApplication> StartApplicationAsync(
        RecordingEventHandler handler,
        IReadOnlyDictionary<string, string?> configuration,
        TokenCredential? credential = null)
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(configuration);
        builder.Services.AddHttpClient(UpstreamEventDispatcher.HttpClientName)
            .ConfigurePrimaryHttpMessageHandler(() => handler);
        if (credential is not null)
        {
            builder.Services.AddSingleton(credential);
        }
        var application = EmulatorApplication.Build(builder);
        await application.StartAsync().WaitAsync(TestTimeout);
        return application;
    }

    private static async Task<WebSocket> ConnectAsync(
        WebApplication application,
        string? subprotocol,
        IEnumerable<Claim>? claims = null)
    {
        var client = application.GetTestServer().CreateWebSocketClient();
        if (subprotocol is not null)
        {
            client.SubProtocols.Add(subprotocol);
        }
        var token = CreateToken(claims);
        var uri = new Uri(
            $"ws://localhost{WebPubSubTokenService.ClientPathPrefix}{Hub}?access_token={Uri.EscapeDataString(token)}");
        return await client.ConnectAsync(uri, CancellationToken.None).WaitAsync(TestTimeout);
    }

    private static Task SendTextAsync(WebSocket webSocket, string message)
    {
        return webSocket.SendAsync(
            Encoding.UTF8.GetBytes(message),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);
    }

    private static async Task<JsonDocument> ReceiveJsonAsync(WebSocket webSocket)
    {
        var buffer = new byte[4096];
        var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(TestTimeout);
        Assert.Equal(WebSocketMessageType.Text, result.MessageType);
        return JsonDocument.Parse(buffer.AsMemory(0, result.Count));
    }

    private static string CreateToken(IEnumerable<Claim>? claims = null)
    {
        var token = new JwtSecurityToken(
            audience: $"http://localhost{WebPubSubTokenService.ClientPathPrefix}{Hub}",
            claims: [new Claim("sub", "token-user"), .. claims ?? []],
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed class RecordingEventHandler : HttpMessageHandler
    {
        private readonly ConcurrentQueue<ReceivedEvent> _events = new();
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responseFactory;
        private readonly SemaphoreSlim _available = new(0);

        public RecordingEventHandler(Func<HttpRequestMessage, HttpResponseMessage> responseFactory)
        {
            _responseFactory = responseFactory;
        }

        public async Task<ReceivedEvent> ReadAsync()
        {
            await _available.WaitAsync(TestTimeout);
            Assert.True(_events.TryDequeue(out var item));
            return item;
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? []
                : await request.Content.ReadAsByteArrayAsync(cancellationToken);
            var headers = request.Headers
                .Concat(request.Content?.Headers ??
                    Enumerable.Empty<KeyValuePair<string, IEnumerable<string>>>())
                .ToDictionary(
                    item => item.Key,
                    item => item.Value.LastOrDefault() ?? string.Empty,
                    StringComparer.OrdinalIgnoreCase);
            _events.Enqueue(new ReceivedEvent(headers["ce-eventName"], headers, body));
            _available.Release();
            return _responseFactory(request);
        }
    }

    private sealed record ReceivedEvent(
        string EventName,
        IReadOnlyDictionary<string, string> Headers,
        byte[] Body);

    private sealed class RecordingTokenCredential : TokenCredential
    {
        public List<string> Scopes { get; } = [];

        public override AccessToken GetToken(
            TokenRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            Scopes.AddRange(requestContext.Scopes);
            return new AccessToken("test-token", DateTimeOffset.UtcNow.AddHours(1));
        }

        public override ValueTask<AccessToken> GetTokenAsync(
            TokenRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            return ValueTask.FromResult(GetToken(requestContext, cancellationToken));
        }
    }
}
