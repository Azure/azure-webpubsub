// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class WebPubSubJsonV1IntegrationTests
{
    private const string Hub = "chat";
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task JsonClientsJoinPublishAndLeaveGroup()
    {
        await using var application = await StartApplicationAsync();
        using var receiver = await ConnectJsonAsync(
            application,
            roles: ["webpubsub.joinLeaveGroup.room"]);
        using var sender = await ConnectJsonAsync(
            application,
            roles: ["webpubsub.sendToGroup.room"],
            userId: "alice");

        await SendJsonAsync(receiver, new
        {
            type = "joinGroup",
            group = "room",
            ackId = 1,
        });
        using (var joinAck = await ReceiveJsonAsync(receiver))
        {
            AssertSuccessAck(joinAck.RootElement, 1);
        }

        await SendJsonAsync(sender, new
        {
            type = "sendToGroup",
            group = "room",
            dataType = "text",
            data = "hello",
            ackId = 1,
            ttlSeconds = 300,
        });
        using (var sendAck = await ReceiveJsonAsync(sender))
        {
            AssertSuccessAck(sendAck.RootElement, 1);
        }
        using (var message = await ReceiveJsonAsync(receiver))
        {
            Assert.Equal("message", message.RootElement.GetProperty("type").GetString());
            Assert.Equal("group", message.RootElement.GetProperty("from").GetString());
            Assert.Equal("room", message.RootElement.GetProperty("group").GetString());
            Assert.Equal("alice", message.RootElement.GetProperty("fromUserId").GetString());
            Assert.Equal("text", message.RootElement.GetProperty("dataType").GetString());
            Assert.Equal("hello", message.RootElement.GetProperty("data").GetString());
        }

        await SendJsonAsync(receiver, new
        {
            type = "leaveGroup",
            group = "room",
            ackId = 2,
        });
        using var leaveAck = await ReceiveJsonAsync(receiver);
        AssertSuccessAck(leaveAck.RootElement, 2);

        await SendJsonAsync(sender, new
        {
            type = "sendToGroup",
            group = "room",
            data = "after-leave",
            ackId = 2,
        });
        using (var sendAfterLeaveAck = await ReceiveJsonAsync(sender))
        {
            AssertSuccessAck(sendAfterLeaveAck.RootElement, 2);
        }
        await SendJsonAsync(receiver, new { type = "ping" });
        using var pong = await ReceiveJsonAsync(receiver);
        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
    }

    [Fact]
    public async Task JsonGroupMessagesPreserveDataTypesMetadataAndNoEcho()
    {
        await using var application = await StartApplicationAsync();
        using var receiver = await ConnectJsonAsync(application, groups: ["room"]);
        using var sender = await ConnectJsonAsync(
            application,
            roles: ["webpubsub.sendToGroup.room"],
            groups: ["room"]);
        var requests = new[]
        {
            """{"type":"sendToGroup","group":"room","dataType":"text","data":"hello","noEcho":true,"ackId":1,"metadata":{"trace-id":"one"}}""",
            """{"type":"sendToGroup","group":"room","dataType":"binary","data":"AQID","noEcho":true,"ackId":2,"metadata":{"trace-id":"two"}}""",
            """{"type":"sendToGroup","group":"room","data":{"value":42},"noEcho":true,"ackId":3,"metadata":{"trace-id":"three"}}""",
        };

        for (ulong ackId = 1; ackId <= (ulong)requests.Length; ackId++)
        {
            await SendTextAsync(sender, requests[ackId - 1]);
            using var ack = await ReceiveJsonAsync(sender);
            AssertSuccessAck(ack.RootElement, ackId);
            using var message = await ReceiveJsonAsync(receiver);
            Assert.Equal(
                ackId == 1 ? "text" : ackId == 2 ? "binary" : "json",
                message.RootElement.GetProperty("dataType").GetString());
            Assert.Equal(
                ackId == 1 ? "one" : ackId == 2 ? "two" : "three",
                message.RootElement.GetProperty("metadata").GetProperty("trace-id").GetString());
            if (ackId == 1)
            {
                Assert.Equal("hello", message.RootElement.GetProperty("data").GetString());
            }
            else if (ackId == 2)
            {
                Assert.Equal(
                    new byte[] { 1, 2, 3 },
                    message.RootElement.GetProperty("data").GetBytesFromBase64());
            }
            else
            {
                Assert.Equal(42, message.RootElement.GetProperty("data").GetProperty("value").GetInt32());
            }
        }

        await SendJsonAsync(sender, new { type = "ping" });
        using var pong = await ReceiveJsonAsync(sender);
        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
    }

    [Fact]
    public async Task DuplicateMetadataKeyClosesJsonConnection()
    {
        await using var application = await StartApplicationAsync();
        using var client = await ConnectJsonAsync(
            application,
            roles: ["webpubsub.sendToGroup.room"]);

        await SendTextAsync(
            client,
            """{"type":"sendToGroup","group":"room","data":"hello","metadata":{"trace":"one","trace":"two"}}""");
        var result = await client.ReceiveAsync(new byte[512], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.InvalidPayloadData, result.CloseStatus);
    }

    [Fact]
    public async Task MetadataKeysAreCaseSensitive()
    {
        await using var application = await StartApplicationAsync();
        using var receiver = await ConnectJsonAsync(application, groups: ["room"]);
        using var sender = await ConnectJsonAsync(
            application,
            roles: ["webpubsub.sendToGroup.room"]);

        await SendTextAsync(
            sender,
            """{"type":"sendToGroup","group":"room","data":"hello","ackId":1,"metadata":{"Trace":"one","trace":"two"}}""");
        using (var ack = await ReceiveJsonAsync(sender))
        {
            AssertSuccessAck(ack.RootElement, 1);
        }
        using var message = await ReceiveJsonAsync(receiver);
        var metadata = message.RootElement.GetProperty("metadata");
        Assert.Equal("one", metadata.GetProperty("Trace").GetString());
        Assert.Equal("two", metadata.GetProperty("trace").GetString());
    }

    [Theory]
    [InlineData("event-name_1.2")]
    [InlineData("E")]
    public async Task ValidEventNamesReachLifetimeHandler(string eventName)
    {
        var handler = new SuccessfulLifetimeHandler();
        await using var application = await StartApplicationAsync(handler);
        using var client = await ConnectJsonAsync(application);

        await SendJsonAsync(client, new
        {
            type = "event",
            @event = eventName,
            data = "hello",
            ackId = 1,
        });
        using var ack = await ReceiveJsonAsync(client);

        AssertSuccessAck(ack.RootElement, 1);
        Assert.Equal(eventName, handler.Message?.EventName);
    }

    [Fact]
    public async Task EventNameLengthMatchesProductionBoundary()
    {
        var handler = new SuccessfulLifetimeHandler();
        await using var application = await StartApplicationAsync(handler);
        using var validClient = await ConnectJsonAsync(application);
        var validEventName = "a" + new string('b', 127);

        await SendJsonAsync(validClient, new
        {
            type = "event",
            @event = validEventName,
            data = "hello",
            ackId = 1,
        });
        using (var ack = await ReceiveJsonAsync(validClient))
        {
            AssertSuccessAck(ack.RootElement, 1);
        }

        using var invalidClient = await ConnectJsonAsync(application);
        await SendJsonAsync(invalidClient, new
        {
            type = "event",
            @event = validEventName + "c",
            data = "hello",
        });
        var result = await invalidClient.ReceiveAsync(new byte[512], CancellationToken.None)
            .WaitAsync(TestTimeout);
        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.InvalidPayloadData, result.CloseStatus);
    }

    [Theory]
    [InlineData("1event")]
    [InlineData("bad/event")]
    [InlineData("bad event")]
    public async Task InvalidEventNamesCloseJsonConnection(string eventName)
    {
        await using var application = await StartApplicationAsync();
        using var client = await ConnectJsonAsync(application);

        await SendJsonAsync(client, new
        {
            type = "event",
            @event = eventName,
            data = "hello",
        });
        var result = await client.ReceiveAsync(new byte[512], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.InvalidPayloadData, result.CloseStatus);
    }

    [Fact]
    public async Task SequenceAckIsAcceptedWithoutEnablingReliableDelivery()
    {
        await using var application = await StartApplicationAsync();
        using var client = await ConnectJsonAsync(application);

        await SendJsonAsync(client, new { type = "sequenceAck", sequenceId = 1 });
        await SendJsonAsync(client, new { type = "ping" });
        using var pong = await ReceiveJsonAsync(client);

        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
    }

    [Fact]
    public async Task JsonAckReportsForbiddenAndDuplicateRequests()
    {
        await using var application = await StartApplicationAsync();
        using var unauthorized = await ConnectJsonAsync(application);
        await SendJsonAsync(unauthorized, new
        {
            type = "joinGroup",
            group = "room",
            ackId = 1,
        });
        using (var forbidden = await ReceiveJsonAsync(unauthorized))
        {
            AssertErrorAck(
                forbidden.RootElement,
                1,
                "Forbidden",
                "The client does not have permission to join group 'room'.");
        }

        using var authorized = await ConnectJsonAsync(
            application,
            roles: ["webpubsub.joinLeaveGroup.room"]);
        var join = new { type = "joinGroup", group = "room", ackId = 1 };
        await SendJsonAsync(authorized, join);
        using (var success = await ReceiveJsonAsync(authorized))
        {
            AssertSuccessAck(success.RootElement, 1);
        }
        await SendJsonAsync(authorized, join);
        using var duplicate = await ReceiveJsonAsync(authorized);
        AssertErrorAck(
            duplicate.RootElement,
            1,
            "Duplicate",
            "Message with ack-id: 1 has been processed");
    }

    [Fact]
    public async Task EventFailureWithAckReturnsErrorAndKeepsConnectionOpen()
    {
        await using var application = await StartApplicationAsync();
        using var client = await ConnectJsonAsync(application);
        var request = new
        {
            type = "event",
            @event = "message",
            dataType = "text",
            data = "hello",
            ackId = 7,
        };

        await SendJsonAsync(client, request);
        using (var error = await ReceiveJsonAsync(client))
        {
            AssertErrorAck(
                error.RootElement,
                7,
                "InternalServerError",
                "Internal server error");
        }

        await SendJsonAsync(client, request);
        using (var retried = await ReceiveJsonAsync(client))
        {
            AssertErrorAck(
                retried.RootElement,
                7,
                "InternalServerError",
                "Internal server error");
        }

        await SendJsonAsync(client, new { type = "ping" });
        using var pong = await ReceiveJsonAsync(client);
        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
    }

    [Fact]
    public async Task EventFailureWithoutAckLogsAndKeepsConnectionOpen()
    {
        var logs = new TestLoggerProvider();
        await using var application = await StartApplicationAsync(loggerProvider: logs);
        using var client = await ConnectJsonAsync(application);

        await SendJsonAsync(client, new
        {
            type = "event",
            @event = "message",
            dataType = "text",
            data = "hello",
        });
        await SendJsonAsync(client, new { type = "ping" });
        using var pong = await ReceiveJsonAsync(client);

        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
        Assert.Contains(
            logs.Messages,
            message => message.Contains(
                "failed to send event message",
                StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task EventHandlerResponsePrecedesSuccessAck()
    {
        var handler = new SuccessfulLifetimeHandler(
            new MessageData(MessageDataType.Json, "{\"accepted\":true}"u8.ToArray()));
        await using var application = await StartApplicationAsync(handler);
        using var client = await ConnectJsonAsync(application);

        await SendJsonAsync(client, new
        {
            type = "event",
            @event = "message",
            data = new { value = 42 },
            ackId = 9,
            metadata = new { trace = "test" },
        });
        using (var response = await ReceiveJsonAsync(client))
        {
            Assert.Equal("message", response.RootElement.GetProperty("type").GetString());
            Assert.Equal("server", response.RootElement.GetProperty("from").GetString());
            Assert.True(response.RootElement.GetProperty("data").GetProperty("accepted").GetBoolean());
        }
        using var ack = await ReceiveJsonAsync(client);
        AssertSuccessAck(ack.RootElement, 9);
        Assert.Equal("message", handler.Message?.EventName);
        Assert.Equal(
            "test",
            handler.Message?.Data.Metadata?["trace"]);
    }

    [Fact]
    public async Task InvalidMessageTtlClosesJsonConnection()
    {
        await using var application = await StartApplicationAsync();
        using var client = await ConnectJsonAsync(
            application,
            roles: ["webpubsub.sendToGroup.room"]);

        await SendJsonAsync(client, new
        {
            type = "sendToGroup",
            group = "room",
            data = "hello",
            ttlSeconds = 301,
            ackId = 1,
        });
        var result = await client.ReceiveAsync(new byte[512], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.InvalidPayloadData, result.CloseStatus);
    }

    [Fact]
    public async Task LongInvalidTypeClosesJsonConnectionGracefully()
    {
        await using var application = await StartApplicationAsync();
        using var client = await ConnectJsonAsync(application);

        await SendJsonAsync(client, new { type = new string('x', 1024) });
        var result = await client.ReceiveAsync(new byte[512], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.InvalidPayloadData, result.CloseStatus);
        Assert.Equal(
            "The client message is not a valid JSON protocol message.",
            result.CloseStatusDescription);
    }

    private static async Task<WebApplication> StartApplicationAsync(
        IWebPubSubConnectionLifetimeHandler? lifetimeHandler = null,
        ILoggerProvider? loggerProvider = null)
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        if (lifetimeHandler is not null)
        {
            builder.Services.AddSingleton(lifetimeHandler);
        }
        if (loggerProvider is not null)
        {
            builder.Logging.AddProvider(loggerProvider);
        }
        var application = EmulatorApplication.Build(builder);
        await application.StartAsync().WaitAsync(TestTimeout);
        return application;
    }

    private static async Task<WebSocket> ConnectJsonAsync(
        WebApplication application,
        IEnumerable<string>? roles = null,
        IEnumerable<string>? groups = null,
        string? userId = null)
    {
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
        var token = CreateToken(roles ?? [], groups ?? [], userId);
        var uri = new Uri(
            $"ws://localhost{WebPubSubTokenService.ClientPathPrefix}{Hub}?access_token={Uri.EscapeDataString(token)}");
        var webSocket = await client.ConnectAsync(uri, CancellationToken.None)
            .WaitAsync(TestTimeout);
        using var connected = await ReceiveJsonAsync(webSocket);
        Assert.Equal("connected", connected.RootElement.GetProperty("event").GetString());
        return webSocket;
    }

    private static Task SendJsonAsync(WebSocket webSocket, object message)
    {
        return webSocket.SendAsync(
            JsonSerializer.SerializeToUtf8Bytes(message),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);
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
        var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None)
            .WaitAsync(TestTimeout);
        Assert.Equal(WebSocketMessageType.Text, result.MessageType);
        Assert.True(result.EndOfMessage);
        return JsonDocument.Parse(buffer.AsMemory(0, result.Count));
    }

    private static void AssertSuccessAck(JsonElement message, ulong ackId)
    {
        Assert.Equal("ack", message.GetProperty("type").GetString());
        Assert.Equal(ackId, message.GetProperty("ackId").GetUInt64());
        Assert.True(message.GetProperty("success").GetBoolean());
    }

    private static void AssertErrorAck(
        JsonElement message,
        ulong ackId,
        string errorName,
        string errorMessage)
    {
        Assert.Equal("ack", message.GetProperty("type").GetString());
        Assert.Equal(ackId, message.GetProperty("ackId").GetUInt64());
        Assert.False(message.GetProperty("success").GetBoolean());
        Assert.Equal(errorName, message.GetProperty("error").GetProperty("name").GetString());
        Assert.Equal(errorMessage, message.GetProperty("error").GetProperty("message").GetString());
    }

    private static string CreateToken(
        IEnumerable<string> roles,
        IEnumerable<string> groups,
        string? userId)
    {
        var claims = roles
            .Select(role => new Claim("role", role))
            .Concat(groups.Select(group => new Claim("webpubsub.group", group)))
            .Concat(userId is null ? [] : [new Claim("sub", userId)]);
        var token = new JwtSecurityToken(
            audience: $"http://localhost{WebPubSubTokenService.ClientPathPrefix}{Hub}",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed class SuccessfulLifetimeHandler : IWebPubSubConnectionLifetimeHandler
    {
        private readonly MessageData? _response;

        public SuccessfulLifetimeHandler()
        {
        }

        public SuccessfulLifetimeHandler(MessageData response)
        {
            _response = response;
        }

        public ClientMessagePayload? Message { get; private set; }

        public Task<UpstreamEventResult> SendMessageAsync(
            LogicalConnection connection,
            ClientMessagePayload message,
            CancellationToken cancellationToken = default)
        {
            Message = message;
            return Task.FromResult(new UpstreamEventResult(_response));
        }
    }

    private sealed class TestLoggerProvider : ILoggerProvider
    {
        public ConcurrentQueue<string> Messages { get; } = new();

        public ILogger CreateLogger(string categoryName)
        {
            return new TestLogger(Messages);
        }

        public void Dispose()
        {
        }

        private sealed class TestLogger : ILogger
        {
            private readonly ConcurrentQueue<string> _messages;

            public TestLogger(ConcurrentQueue<string> messages)
            {
                _messages = messages;
            }

            public IDisposable? BeginScope<TState>(TState state) where TState : notnull
            {
                return null;
            }

            public bool IsEnabled(LogLevel logLevel)
            {
                return true;
            }

            public void Log<TState>(
                LogLevel logLevel,
                EventId eventId,
                TState state,
                Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                _messages.Enqueue(formatter(state, exception));
            }
        }
    }
}
