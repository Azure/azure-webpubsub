// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class LogicalConnectionTests
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(30);

    [Fact]
    public void DetachRemovesActivatedConnection()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection");
        using var transport = connection.TryAttach(new TestWebSocket(), TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));

        connection.Detach(transport);

        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
        Assert.Null(connection.TryAttach(new TestWebSocket(), TestClientPayloadProcessor.Instance));
    }

    [Fact]
    public void TokenGroupsAreScopedToEachConnection()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var first = CreateConnection(manager, "first", "room");
        var second = CreateConnection(manager, "second");

        Assert.True(first.Groups.ContainsKey("room"));
        Assert.False(second.Groups.ContainsKey("room"));
    }

    [Fact]
    public async Task GroupDataUsesAttachedPayloadProcessor()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection");
        var webSocket = new RecordingSendWebSocket();
        var processor = new TestClientPayloadProcessor(
            new WebSocketPayload("encoded"u8.ToArray(), WebSocketMessageType.Text));
        using var transport = connection.TryAttach(webSocket, processor);
        Assert.NotNull(transport);

        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Binary, new byte[] { 1, 2, 3 }));
        var sent = await webSocket.Sent.Task.WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Text, sent.MessageType);
        Assert.Equal("encoded"u8.ToArray(), sent.Payload);
    }

    [Fact]
    public async Task OutboundByteLimitAbortsAndRemovesConnection()
    {
        using var application = EmulatorApplication.Build(
            EmulatorApplication.CreateBuilder(
                runtimeOptions: new EmulatorRuntimeOptions
                {
                    OutboundQueueCapacity = 10,
                    MaxOutboundQueueBytes = 6,
                }));
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection");
        var webSocket = new BlockingSendWebSocket();
        using var transport = connection.TryAttach(webSocket, TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));

        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Binary, new byte[4]));
        await webSocket.SendStarted.Task.WaitAsync(TestTimeout);
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Binary, new byte[3]));

        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
        Assert.Equal(WebSocketState.Aborted, webSocket.State);
        Assert.True(transport.Aborted.IsCancellationRequested);
        Assert.Null(connection.TryAttach(new TestWebSocket(), TestClientPayloadProcessor.Instance));
    }

    [Fact]
    public void ReliableGroupDataUsesIncreasingSequenceIds()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        var processor = new RecordingSequencePayloadProcessor();
        using var transport = connection.TryAttach(new TestWebSocket(), processor);
        Assert.NotNull(transport);

        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "first"u8.ToArray()));
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "second"u8.ToArray()));

        Assert.Equal(new ulong?[] { 1, 2 }, processor.SequenceIds);
    }

    [Fact]
    public void SequenceAckReleasesReliableBufferCapacity()
    {
        using var application = EmulatorApplication.Build(
            EmulatorApplication.CreateBuilder(
                runtimeOptions: new EmulatorRuntimeOptions
                {
                    ReliableMessageBufferCapacity = 1,
                }));
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var transport = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));

        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "first"u8.ToArray()));
        connection.Acknowledge(1);
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "second"u8.ToArray()));

        Assert.True(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public void CumulativeSequenceAckReleasesReliableBufferBytes()
    {
        using var application = EmulatorApplication.Build(
            EmulatorApplication.CreateBuilder(
                runtimeOptions: new EmulatorRuntimeOptions
                {
                    MaxReliableMessageBufferBytes = 8,
                }));
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var transport = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));

        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Binary, new byte[4]));
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Binary, new byte[4]));
        connection.Acknowledge(2);
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Binary, new byte[8]));

        Assert.True(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public void FutureSequenceAckReleasesReliableBufferCapacity()
    {
        using var application = EmulatorApplication.Build(
            EmulatorApplication.CreateBuilder(
                runtimeOptions: new EmulatorRuntimeOptions
                {
                    ReliableMessageBufferCapacity = 1,
                }));
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var transport = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));

        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "first"u8.ToArray()));
        connection.Acknowledge(ulong.MaxValue);
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "second"u8.ToArray()));

        Assert.True(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public void ReliableBufferByteLimitAbortsAndRemovesConnection()
    {
        using var application = EmulatorApplication.Build(
            EmulatorApplication.CreateBuilder(
                runtimeOptions: new EmulatorRuntimeOptions
                {
                    MaxReliableMessageBufferBytes = 6,
                }));
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var transport = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));

        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Binary, new byte[4]));
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Binary, new byte[3]));

        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
        Assert.True(transport.Aborted.IsCancellationRequested);
    }

    [Fact]
    public async Task ReliableDetachBuffersAndReplaysUnacknowledgedDataInOrder()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", "room", reliable: true);
        using var original = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        Assert.True(manager.TryActivate(connection));
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "acknowledged"u8.ToArray()));
        connection.Acknowledge(1);
        connection.Detach(original);

        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "second"u8.ToArray()));
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "third"u8.ToArray()));
        var recoveredSocket = new QueueingSendWebSocket();
        using var recovered = await connection.TryReconnectAsync(
            recoveredSocket,
            TestClientPayloadProcessor.Instance,
            CancellationToken.None);

        Assert.NotNull(recovered);
        Assert.True(connection.Groups.ContainsKey("room"));
        Assert.Equal("second"u8.ToArray(), await recoveredSocket.ReadAsync());
        Assert.Equal("third"u8.ToArray(), await recoveredSocket.ReadAsync());
    }

    [Fact]
    public async Task ReliableRecoveryRequiresDetachedConnectionLifecycle()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);

        using var prematureRecovery = await connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None);
        using var original = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        connection.Detach(original);
        using var bypass = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);

        Assert.Null(prematureRecovery);
        Assert.Null(bypass);
    }

    [Fact]
    public void ReliableBufferOverflowWhileDetachedRemovesConnection()
    {
        using var application = EmulatorApplication.Build(
            EmulatorApplication.CreateBuilder(
                runtimeOptions: new EmulatorRuntimeOptions
                {
                    ReliableMessageBufferCapacity = 1,
                }));
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var transport = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));
        connection.Detach(transport);

        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "first"u8.ToArray()));
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "second"u8.ToArray()));

        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public void ReliableNormalCloseRemovesConnection()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var transport = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));

        transport.CloseOutput(WebSocketCloseStatus.NormalClosure, "done");
        connection.Detach(transport);

        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public async Task ReliableNonNormalCloseCanReconnect()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var handler = application.Services.GetRequiredService<ClientConnectionHandler>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var original = connection.TryAttach(
            new NonNormalClosingWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        Assert.True(manager.TryActivate(connection));

        await handler.RunAsync(
            connection.ConnectionId,
            connection,
            original,
            TestClientPayloadProcessor.Instance,
            CancellationToken.None);
        connection.Detach(original);
        using var recovered = await connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None);

        Assert.NotNull(recovered);
        Assert.True(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public async Task ReliableDetachExpiresWithoutReconnect()
    {
        using var application = EmulatorApplication.Build(
            EmulatorApplication.CreateBuilder(
                runtimeOptions: new EmulatorRuntimeOptions
                {
                    ReconnectTimeout = TimeSpan.FromMilliseconds(50),
                }));
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var transport = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));

        connection.Detach(transport);
        await Task.Delay(250);

        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public async Task ReconnectFencesPreviousExpiration()
    {
        using var application = EmulatorApplication.Build(
            EmulatorApplication.CreateBuilder(
                runtimeOptions: new EmulatorRuntimeOptions
                {
                    ReconnectTimeout = TimeSpan.FromMilliseconds(50),
                }));
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var original = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        Assert.True(manager.TryActivate(connection));
        connection.Detach(original);

        using var recovered = await connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None);
        await Task.Delay(250);

        Assert.NotNull(recovered);
        Assert.True(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    private static LogicalConnection CreateConnection(
        ConnectionManager manager,
        string connectionId,
        string? group = null,
        bool reliable = false)
    {
        var claims = group is null
            ? []
            : new[] { new Claim("webpubsub.group", group) };
        return manager.Create(
            connectionId,
            "chat",
            new ClaimsPrincipal(new ClaimsIdentity(claims)),
            reliable: reliable);
    }

    private sealed class TestClientPayloadProcessor : IClientPayloadProcessor
    {
        public static TestClientPayloadProcessor Instance { get; } = new(
            new WebSocketPayload(ReadOnlyMemory<byte>.Empty, WebSocketMessageType.Text));

        private readonly WebSocketPayload _webSocketPayload;

        public TestClientPayloadProcessor(WebSocketPayload webSocketPayload)
        {
            _webSocketPayload = webSocketPayload;
        }

        public void OnConnected(LogicalConnection connection)
        {
        }

        public ValueTask<PayloadProcessingResult> ProcessAsync(
            LogicalConnection connection,
            WebSocketMessageType messageType,
            byte[] payload,
            CancellationToken cancellationToken)
        {
            return ValueTask.FromResult(PayloadProcessingResult.Continue);
        }

        public WebSocketPayload EncodeGroupData(
            LogicalConnection connection,
            string group,
            string? fromUserId,
            MessageData data,
            ulong? sequenceId)
        {
            return _webSocketPayload.Bytes.IsEmpty
                ? new WebSocketPayload(
                    data.Bytes,
                    data.Type == MessageDataType.Binary
                        ? WebSocketMessageType.Binary
                        : WebSocketMessageType.Text)
                : _webSocketPayload;
        }
    }

    private sealed class RecordingSequencePayloadProcessor : IClientPayloadProcessor
    {
        public List<ulong?> SequenceIds { get; } = [];

        public void OnConnected(LogicalConnection connection)
        {
        }

        public ValueTask<PayloadProcessingResult> ProcessAsync(
            LogicalConnection connection,
            WebSocketMessageType messageType,
            byte[] payload,
            CancellationToken cancellationToken)
        {
            return ValueTask.FromResult(PayloadProcessingResult.Continue);
        }

        public WebSocketPayload EncodeGroupData(
            LogicalConnection connection,
            string group,
            string? fromUserId,
            MessageData data,
            ulong? sequenceId)
        {
            SequenceIds.Add(sequenceId);
            return new WebSocketPayload(data.Bytes, WebSocketMessageType.Text);
        }
    }

    private class TestWebSocket : WebSocket
    {
        private WebSocketState _state = WebSocketState.Open;

        public override WebSocketCloseStatus? CloseStatus => null;

        public override string? CloseStatusDescription => null;

        public override WebSocketState State => _state;

        public override string? SubProtocol => null;

        public override void Abort()
        {
            _state = WebSocketState.Aborted;
        }

        public override Task CloseAsync(
            WebSocketCloseStatus closeStatus,
            string? statusDescription,
            CancellationToken cancellationToken)
        {
            _state = WebSocketState.Closed;
            return Task.CompletedTask;
        }

        public override Task CloseOutputAsync(
            WebSocketCloseStatus closeStatus,
            string? statusDescription,
            CancellationToken cancellationToken)
        {
            _state = WebSocketState.CloseSent;
            return Task.CompletedTask;
        }

        public override void Dispose()
        {
            _state = WebSocketState.Closed;
        }

        public override Task<WebSocketReceiveResult> ReceiveAsync(
            ArraySegment<byte> buffer,
            CancellationToken cancellationToken)
        {
            throw new NotSupportedException();
        }

        public override Task SendAsync(
            ArraySegment<byte> buffer,
            WebSocketMessageType messageType,
            bool endOfMessage,
            CancellationToken cancellationToken)
        {
            return Task.CompletedTask;
        }
    }

    private sealed class BlockingSendWebSocket : TestWebSocket
    {
        public TaskCompletionSource SendStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public override async Task SendAsync(
            ArraySegment<byte> buffer,
            WebSocketMessageType messageType,
            bool endOfMessage,
            CancellationToken cancellationToken)
        {
            SendStarted.TrySetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
        }
    }

    private sealed class NonNormalClosingWebSocket : TestWebSocket
    {
        public override WebSocketCloseStatus? CloseStatus =>
            WebSocketCloseStatus.EndpointUnavailable;

        public override WebSocketState State => WebSocketState.CloseReceived;

        public override Task<WebSocketReceiveResult> ReceiveAsync(
            ArraySegment<byte> buffer,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(new WebSocketReceiveResult(
                0,
                WebSocketMessageType.Close,
                endOfMessage: true,
                CloseStatus,
                "unavailable"));
        }
    }

    private sealed class RecordingSendWebSocket : TestWebSocket
    {
        public TaskCompletionSource<(byte[] Payload, WebSocketMessageType MessageType)> Sent { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public override Task SendAsync(
            ArraySegment<byte> buffer,
            WebSocketMessageType messageType,
            bool endOfMessage,
            CancellationToken cancellationToken)
        {
            Sent.TrySetResult((buffer.ToArray(), messageType));
            return Task.CompletedTask;
        }
    }

    private sealed class QueueingSendWebSocket : TestWebSocket
    {
        private readonly Channel<byte[]> _sent = Channel.CreateUnbounded<byte[]>();

        public override Task SendAsync(
            ArraySegment<byte> buffer,
            WebSocketMessageType messageType,
            bool endOfMessage,
            CancellationToken cancellationToken)
        {
            _sent.Writer.TryWrite(buffer.ToArray());
            return Task.CompletedTask;
        }

        public async Task<byte[]> ReadAsync()
        {
            return await _sent.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout);
        }
    }
}