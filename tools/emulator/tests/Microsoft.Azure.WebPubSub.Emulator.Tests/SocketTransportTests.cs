// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Azure.WebPubSub.Emulator;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class SocketTransportTests
{
    [Fact]
    public async Task CloseOutput_WhenDataQueueIsFull_SendsFinalPayloadBeforeClose()
    {
        using var webSocket = new BlockingWebSocket();
        using var transport = new SocketTransport(webSocket, generation: 1, queueCapacity: 1);

        Assert.Equal(
            TransportEnqueueResult.Enqueued,
            transport.TryEnqueue("first"u8.ToArray(), WebSocketMessageType.Text));
        await webSocket.FirstSendStarted.OrTimeout();
        Assert.Equal(
            TransportEnqueueResult.Enqueued,
            transport.TryEnqueue("second"u8.ToArray(), WebSocketMessageType.Text));

        transport.CloseOutput(
            "disconnected"u8.ToArray(),
            WebSocketMessageType.Text,
            WebSocketCloseStatus.NormalClosure,
            "test-close");
        webSocket.ReleaseFirstSend();

        await webSocket.Closed.OrTimeout();
        Assert.Equal(
            ["first", "second", "disconnected", "close"],
            webSocket.Operations);
    }

    private sealed class BlockingWebSocket : WebSocket
    {
        private readonly TaskCompletionSource _closed = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _firstSendStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _releaseFirstSend = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly List<string> _operations = [];
        private int _sendCount;
        private WebSocketState _state = WebSocketState.Open;

        public Task Closed => _closed.Task;

        public Task FirstSendStarted => _firstSendStarted.Task;

        public IReadOnlyList<string> Operations => _operations;

        public override WebSocketCloseStatus? CloseStatus => null;

        public override string? CloseStatusDescription => null;

        public override WebSocketState State => _state;

        public override string? SubProtocol => null;

        public void ReleaseFirstSend()
        {
            _releaseFirstSend.TrySetResult();
        }

        public override void Abort()
        {
            _state = WebSocketState.Aborted;
            _releaseFirstSend.TrySetResult();
            _closed.TrySetResult();
        }

        public override Task CloseAsync(
            WebSocketCloseStatus closeStatus,
            string? statusDescription,
            CancellationToken cancellationToken)
        {
            return CloseOutputAsync(closeStatus, statusDescription, cancellationToken);
        }

        public override Task CloseOutputAsync(
            WebSocketCloseStatus closeStatus,
            string? statusDescription,
            CancellationToken cancellationToken)
        {
            _operations.Add("close");
            _state = WebSocketState.CloseSent;
            _closed.TrySetResult();
            return Task.CompletedTask;
        }

        public override void Dispose()
        {
            _state = WebSocketState.Closed;
            _releaseFirstSend.TrySetResult();
            _closed.TrySetResult();
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
            return RecordSendAsync(buffer.AsMemory(), cancellationToken);
        }

        public override ValueTask SendAsync(
            ReadOnlyMemory<byte> buffer,
            WebSocketMessageType messageType,
            bool endOfMessage,
            CancellationToken cancellationToken)
        {
            return new ValueTask(RecordSendAsync(buffer, cancellationToken));
        }

        private async Task RecordSendAsync(
            ReadOnlyMemory<byte> buffer,
            CancellationToken cancellationToken)
        {
            _operations.Add(Encoding.UTF8.GetString(buffer.Span));
            if (Interlocked.Increment(ref _sendCount) == 1)
            {
                _firstSendStarted.TrySetResult();
                await _releaseFirstSend.Task.WaitAsync(cancellationToken);
            }
        }
    }
}