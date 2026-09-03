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
            CancellationToken.None,
            isInitialConnection: true);
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

    [Fact]
    public async Task ReconnectWaitsForProcessingAndFencesOldTransport()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var original = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        Assert.True(manager.TryActivate(connection));
        var processingStarted = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseProcessing = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var processing = connection.ProcessIfCurrentAsync(
            original,
            async () =>
            {
                processingStarted.TrySetResult();
                await releaseProcessing.Task;
            },
            CancellationToken.None).AsTask();
        await processingStarted.Task.WaitAsync(TestTimeout);

        var reconnect = connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None).AsTask();
        Assert.False(reconnect.IsCompleted);
        releaseProcessing.TrySetResult();
        Assert.True(await processing.WaitAsync(TestTimeout));
        using var recovered = await reconnect.WaitAsync(TestTimeout);

        Assert.NotNull(recovered);
        Assert.False(await connection.ProcessIfCurrentAsync(
            original,
            () => ValueTask.CompletedTask,
            CancellationToken.None));
    }

    [Fact]
    public async Task ReconnectWaitsForOldWriterBeforeReplay()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        var originalSocket = new GatedSendWebSocket();
        using var original = connection.TryAttach(
            originalSocket,
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "message"u8.ToArray()));
        await originalSocket.SendStarted.Task.WaitAsync(TestTimeout);
        var recoveredSocket = new QueueingSendWebSocket();

        var reconnect = connection.TryReconnectAsync(
            recoveredSocket,
            TestClientPayloadProcessor.Instance,
            CancellationToken.None).AsTask();

        Assert.False(reconnect.IsCompleted);
        originalSocket.Release.TrySetResult();
        using var recovered = await reconnect.WaitAsync(TestTimeout);
        Assert.NotNull(recovered);
        Assert.Equal("message"u8.ToArray(), await recoveredSocket.ReadAsync());
    }

    [Fact]
    public async Task ReconnectWaitsForDetachedWriterBeforeReplay()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        var originalSocket = new GatedSendWebSocket();
        using var original = connection.TryAttach(
            originalSocket,
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        connection.SendGroupData(
            "room",
            fromUserId: null,
            new MessageData(MessageDataType.Text, "message"u8.ToArray()));
        await originalSocket.SendStarted.Task.WaitAsync(TestTimeout);
        connection.Detach(original);
        var recoveredSocket = new QueueingSendWebSocket();

        var reconnect = connection.TryReconnectAsync(
            recoveredSocket,
            TestClientPayloadProcessor.Instance,
            CancellationToken.None).AsTask();

        Assert.False(reconnect.IsCompleted);
        originalSocket.Release.TrySetResult();
        using var recovered = await reconnect.WaitAsync(TestTimeout);
        Assert.NotNull(recovered);
        Assert.Equal("message"u8.ToArray(), await recoveredSocket.ReadAsync());
    }

    [Fact]
    public async Task ReconnectDoesNotWaitForBlockedMessageProcessing()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var handler = application.Services.GetRequiredService<ClientConnectionHandler>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        var originalSocket = new GatedReceiveWebSocket(
            new WebSocketReceiveResult(1, WebSocketMessageType.Text, endOfMessage: true));
        var processor = new GatedProcessPayloadProcessor();
        using var original = connection.TryAttach(originalSocket, processor);
        Assert.NotNull(original);
        using var requestAborted = new CancellationTokenSource();
        var handlerTask = handler.RunAsync(
            connection.ConnectionId,
            connection,
            original,
            processor,
            requestAborted.Token);
        await originalSocket.ReceiveStarted.Task.WaitAsync(TestTimeout);

        originalSocket.Release.TrySetResult();
        await processor.Started.Task.WaitAsync(TestTimeout);
        requestAborted.Cancel();

        using var recovered = await connection.TryReconnectAsync(
            new TestWebSocket(),
            processor,
            CancellationToken.None).AsTask().WaitAsync(TestTimeout);
        Assert.NotNull(recovered);
        processor.Release.TrySetResult();
        await handlerTask.WaitAsync(TestTimeout);
    }

    [Fact]
    public async Task TerminalMessageResultClosesTransportAttachedDuringProcessing()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var handler = application.Services.GetRequiredService<ClientConnectionHandler>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        var originalSocket = new GatedReceiveWebSocket(
            new WebSocketReceiveResult(1, WebSocketMessageType.Text, endOfMessage: true));
        var processor = new GatedClosingPayloadProcessor();
        using var original = connection.TryAttach(originalSocket, processor);
        Assert.NotNull(original);
        Assert.True(manager.TryActivate(connection));
        var handlerTask = handler.RunAsync(
            connection.ConnectionId,
            connection,
            original,
            processor,
            CancellationToken.None);
        await originalSocket.ReceiveStarted.Task.WaitAsync(TestTimeout);
        originalSocket.Release.TrySetResult();
        await processor.Started.Task.WaitAsync(TestTimeout);

        var recoveredSocket = new TestWebSocket();
        using var recovered = await connection.TryReconnectAsync(
            recoveredSocket,
            processor,
            CancellationToken.None).AsTask().WaitAsync(TestTimeout);
        Assert.NotNull(recovered);
        processor.Release.TrySetResult();
        await handlerTask.WaitAsync(TestTimeout);

        Assert.Equal(WebSocketState.CloseSent, recoveredSocket.State);
        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public async Task TerminalMessageResultPreventsQueuedMessageProcessing()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var transport = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));
        var processingStarted = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseProcessing = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var terminalProcessing = connection.ProcessReceivedMessageAsync(
            async () =>
            {
                processingStarted.TrySetResult();
                await releaseProcessing.Task;
                return PayloadProcessingResult.Close(
                    WebSocketCloseStatus.InvalidPayloadData,
                    "invalid");
            },
            CancellationToken.None).AsTask();
        await processingStarted.Task.WaitAsync(TestTimeout);
        var queuedMessageProcessed = false;
        var queuedProcessing = connection.ProcessReceivedMessageAsync(
            () =>
            {
                queuedMessageProcessed = true;
                return ValueTask.FromResult(PayloadProcessingResult.Continue);
            },
            CancellationToken.None).AsTask();

        releaseProcessing.TrySetResult();

        Assert.NotNull(await terminalProcessing.WaitAsync(TestTimeout));
        Assert.Null(await queuedProcessing.WaitAsync(TestTimeout));
        Assert.False(queuedMessageProcessed);
    }

    [Fact]
    public async Task NormalCloseReceivedBeforeReconnectRemainsTerminal()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var handler = application.Services.GetRequiredService<ClientConnectionHandler>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        var originalSocket = new GatedReceiveWebSocket(new WebSocketReceiveResult(
            0,
            WebSocketMessageType.Close,
            endOfMessage: true,
            WebSocketCloseStatus.NormalClosure,
            "done"));
        using var original = connection.TryAttach(
            originalSocket,
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        Assert.True(manager.TryActivate(connection));
        var handlerTask = handler.RunAsync(
            connection.ConnectionId,
            connection,
            original,
            TestClientPayloadProcessor.Instance,
            CancellationToken.None);
        await originalSocket.ReceiveStarted.Task.WaitAsync(TestTimeout);

        var reconnect = connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None).AsTask();
        originalSocket.Release.TrySetResult();

        Assert.Null(await reconnect.WaitAsync(TestTimeout));
        await handlerTask.WaitAsync(TestTimeout);
        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public async Task CanceledReconnectCanBeRetried()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var original = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        var processingStarted = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseProcessing = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var processing = connection.ProcessIfCurrentAsync(
            original,
            async () =>
            {
                processingStarted.TrySetResult();
                await releaseProcessing.Task;
            },
            CancellationToken.None).AsTask();
        await processingStarted.Task.WaitAsync(TestTimeout);
        using var cancellation = new CancellationTokenSource();
        var canceledReconnect = connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            cancellation.Token).AsTask();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => canceledReconnect);
        releaseProcessing.TrySetResult();
        Assert.True(await processing.WaitAsync(TestTimeout));
        using var recovered = await connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None);

        Assert.NotNull(recovered);
    }

    [Fact]
    public async Task ProcessingCloseRemovesConnectionWhenTransportAlreadyEnded()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var original = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        Assert.True(manager.TryActivate(connection));
        original.Abort();

        var result = await connection.ProcessMessageIfCurrentAsync(
            original,
            () => ValueTask.FromResult(PayloadProcessingResult.Close(
                WebSocketCloseStatus.PolicyViolation,
                "invalid")),
            CancellationToken.None);
        using var recovered = await connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None);

        Assert.NotNull(result);
        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
        Assert.Null(recovered);
    }

    [Fact]
    public async Task DetachedTransportCanCommitTerminalCloseBeforeReconnect()
    {
        using var application = EmulatorApplication.Build();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        using var original = connection.TryAttach(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance);
        Assert.NotNull(original);
        Assert.True(manager.TryActivate(connection));
        var processingStarted = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseProcessing = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var processing = connection.ProcessIfCurrentAsync(
            original,
            async () =>
            {
                processingStarted.TrySetResult();
                await releaseProcessing.Task;
                connection.Detach(original);
                Assert.True(connection.CloseIfCurrent(
                    original,
                    WebSocketCloseStatus.NormalClosure,
                    "done"));
            },
            CancellationToken.None).AsTask();
        await processingStarted.Task.WaitAsync(TestTimeout);

        var reconnect = connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None).AsTask();
        releaseProcessing.TrySetResult();

        Assert.True(await processing.WaitAsync(TestTimeout));
        Assert.Null(await reconnect.WaitAsync(TestTimeout));
        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
    }

    [Fact]
    public async Task TransportAbortExpiresWhileMessageProcessingIsBlocked()
    {
        using var application = EmulatorApplication.Build(
            EmulatorApplication.CreateBuilder(
                runtimeOptions: new EmulatorRuntimeOptions
                {
                    ReconnectTimeout = TimeSpan.FromMilliseconds(50),
                }));
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var handler = application.Services.GetRequiredService<ClientConnectionHandler>();
        var connection = CreateConnection(manager, "connection", reliable: true);
        var socket = new GatedReceiveWebSocket(
            new WebSocketReceiveResult(1, WebSocketMessageType.Text, endOfMessage: true));
        var processor = new GatedProcessPayloadProcessor();
        using var transport = connection.TryAttach(socket, processor);
        Assert.NotNull(transport);
        Assert.True(manager.TryActivate(connection));
        var handlerTask = handler.RunAsync(
            connection.ConnectionId,
            connection,
            transport,
            processor,
            CancellationToken.None);
        await socket.ReceiveStarted.Task.WaitAsync(TestTimeout);
        socket.Release.TrySetResult();
        await processor.Started.Task.WaitAsync(TestTimeout);

        transport.Abort();
        await Task.Delay(TimeSpan.FromMilliseconds(250));

        Assert.False(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
        processor.Release.TrySetResult();
        await handlerTask.WaitAsync(TestTimeout);
    }

    [Fact]
    public async Task ReconnectTimeoutKeepsConnectionRecoverable()
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
        var processingStarted = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseProcessing = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var processing = connection.ProcessIfCurrentAsync(
            original,
            async () =>
            {
                processingStarted.TrySetResult();
                await releaseProcessing.Task;
            },
            CancellationToken.None).AsTask();
        await processingStarted.Task.WaitAsync(TestTimeout);

        await Assert.ThrowsAsync<TimeoutException>(() => connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None).AsTask());
        Assert.True(manager.TryGet(connection.Hub, connection.ConnectionId, out _));
        releaseProcessing.TrySetResult();
        Assert.True(await processing.WaitAsync(TestTimeout));
        using var recovered = await connection.TryReconnectAsync(
            new TestWebSocket(),
            TestClientPayloadProcessor.Instance,
            CancellationToken.None);

        Assert.NotNull(recovered);
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

    private sealed class RecordingProcessPayloadProcessor : IClientPayloadProcessor
    {
        public TaskCompletionSource Processed { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void OnConnected(LogicalConnection connection)
        {
        }

        public ValueTask<PayloadProcessingResult> ProcessAsync(
            LogicalConnection connection,
            WebSocketMessageType messageType,
            byte[] payload,
            CancellationToken cancellationToken)
        {
            Processed.TrySetResult();
            return ValueTask.FromResult(PayloadProcessingResult.Continue);
        }

        public WebSocketPayload EncodeGroupData(
            LogicalConnection connection,
            string group,
            string? fromUserId,
            MessageData data,
            ulong? sequenceId)
        {
            return new WebSocketPayload(data.Bytes, WebSocketMessageType.Text);
        }
    }

    private sealed class GatedProcessPayloadProcessor : IClientPayloadProcessor
    {
        public TaskCompletionSource Started { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource Release { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void OnConnected(LogicalConnection connection)
        {
        }

        public async ValueTask<PayloadProcessingResult> ProcessAsync(
            LogicalConnection connection,
            WebSocketMessageType messageType,
            byte[] payload,
            CancellationToken cancellationToken)
        {
            Started.TrySetResult();
            await Release.Task;
            return PayloadProcessingResult.Continue;
        }

        public WebSocketPayload EncodeGroupData(
            LogicalConnection connection,
            string group,
            string? fromUserId,
            MessageData data,
            ulong? sequenceId)
        {
            return new WebSocketPayload(data.Bytes, WebSocketMessageType.Text);
        }
    }

    private sealed class GatedClosingPayloadProcessor : IClientPayloadProcessor
    {
        public TaskCompletionSource Started { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource Release { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void OnConnected(LogicalConnection connection)
        {
        }

        public async ValueTask<PayloadProcessingResult> ProcessAsync(
            LogicalConnection connection,
            WebSocketMessageType messageType,
            byte[] payload,
            CancellationToken cancellationToken)
        {
            Started.TrySetResult();
            await Release.Task;
            return PayloadProcessingResult.Close(
                WebSocketCloseStatus.InvalidPayloadData,
                "invalid");
        }

        public WebSocketPayload EncodeGroupData(
            LogicalConnection connection,
            string group,
            string? fromUserId,
            MessageData data,
            ulong? sequenceId)
        {
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

    private sealed class GatedSendWebSocket : TestWebSocket
    {
        public TaskCompletionSource SendStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource Release { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public override async Task SendAsync(
            ArraySegment<byte> buffer,
            WebSocketMessageType messageType,
            bool endOfMessage,
            CancellationToken cancellationToken)
        {
            SendStarted.TrySetResult();
            await Release.Task;
        }
    }

    private sealed class GatedReceiveWebSocket : TestWebSocket
    {
        private readonly WebSocketReceiveResult _result;

        public GatedReceiveWebSocket(WebSocketReceiveResult result)
        {
            _result = result;
        }

        public override WebSocketCloseStatus? CloseStatus => _result.CloseStatus;

        public override string? CloseStatusDescription => _result.CloseStatusDescription;

        public override WebSocketState State => _result.MessageType == WebSocketMessageType.Close
            ? WebSocketState.CloseReceived
            : base.State;

        public TaskCompletionSource ReceiveStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource Release { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public override async Task<WebSocketReceiveResult> ReceiveAsync(
            ArraySegment<byte> buffer,
            CancellationToken cancellationToken)
        {
            ReceiveStarted.TrySetResult();
            await Release.Task;
            if (_result.Count > 0)
            {
                buffer[0] = (byte)'x';
            }
            return _result;
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