// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal readonly record struct OutboundMessage(
    ReadOnlyMemory<byte> Payload,
    WebSocketMessageType MessageType,
    WebSocketCloseStatus? CloseStatus,
    string? CloseDescription);

internal enum TransportEnqueueResult
{
    Enqueued,
    Full,
    Closed,
}

internal sealed class SocketTransport : IDisposable
{
    private static readonly TimeSpan CloseDrainTimeout = TimeSpan.FromSeconds(5);

    private readonly CancellationTokenSource _abortSource = new();
    private readonly CancellationToken _abortToken;
    private readonly object _enqueueLock = new();
    private readonly Channel<OutboundMessage> _outbound;
    private readonly int _dataCapacity;
    private readonly long _maxDataBytes;
    private readonly ILogger? _logger;
    private readonly Task _writeLoop;
    private int _queuedDataMessages;
    private long _queuedDataBytes;
    private bool _closeQueued;
    private int _ended;

    public SocketTransport(
        WebSocket webSocket,
        int queueCapacity,
        long maxQueueBytes,
        ILogger? logger = null)
    {
        WebSocket = webSocket;
        _logger = logger;
        _abortToken = _abortSource.Token;
        _dataCapacity = Math.Min(Math.Max(queueCapacity, 1), int.MaxValue - 1);
        _maxDataBytes = Math.Max(maxQueueBytes, 1);
        _outbound = Channel.CreateBounded<OutboundMessage>(
            new BoundedChannelOptions(_dataCapacity + 1)
            {
                SingleReader = true,
                SingleWriter = false,
                AllowSynchronousContinuations = false,
                FullMode = BoundedChannelFullMode.Wait,
            });
        _writeLoop = Task.Run(RunWriteLoopAsync);
    }

    public WebSocket WebSocket { get; }

    public CancellationToken Aborted => _abortToken;

    public bool IsClosing
    {
        get
        {
            lock (_enqueueLock)
            {
                return _closeQueued;
            }
        }
    }

    public TransportEnqueueResult TryEnqueue(
        ReadOnlyMemory<byte> payload,
        WebSocketMessageType messageType)
    {
        lock (_enqueueLock)
        {
            if (Volatile.Read(ref _ended) != 0 || _closeQueued)
            {
                return TransportEnqueueResult.Closed;
            }

            if (_queuedDataMessages >= _dataCapacity ||
                payload.Length > _maxDataBytes - _queuedDataBytes)
            {
                return TransportEnqueueResult.Full;
            }

            if (_outbound.Writer.TryWrite(new OutboundMessage(
                payload,
                messageType,
                null,
                null)))
            {
                _queuedDataMessages++;
                _queuedDataBytes += payload.Length;
                return TransportEnqueueResult.Enqueued;
            }

            return TransportEnqueueResult.Closed;
        }
    }

    public void CloseOutput(WebSocketCloseStatus status, string description)
    {
        QueueClose(new OutboundMessage(
            default,
            WebSocketMessageType.Close,
            status,
            description));
    }

    public void Abort()
    {
        End(abortSocket: true);
    }

    public async Task CloseAsync(WebSocketCloseStatus status, string description)
    {
        CloseOutput(status, description);
        try
        {
            await _writeLoop.WaitAsync(CloseDrainTimeout).ConfigureAwait(false);
        }
        catch (Exception exception) when (
            exception is TimeoutException or OperationCanceledException)
        {
            Abort();
        }
    }

    public void Dispose()
    {
        Abort();
        try
        {
            WebSocket.Dispose();
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private void QueueClose(OutboundMessage close)
    {
        var abort = false;
        lock (_enqueueLock)
        {
            if (Volatile.Read(ref _ended) != 0 || _closeQueued)
            {
                return;
            }

            _closeQueued = true;
            abort = !_outbound.Writer.TryWrite(close);
        }

        if (abort)
        {
            Abort();
        }
    }

    private void End(bool abortSocket)
    {
        if (Interlocked.Exchange(ref _ended, 1) == 0)
        {
            _outbound.Writer.TryComplete();
        }

        if (abortSocket)
        {
            try
            {
                _abortSource.Cancel();
            }
            catch (ObjectDisposedException)
            {
            }
        }

        if (!abortSocket)
        {
            return;
        }

        try
        {
            WebSocket.Abort();
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private async Task RunWriteLoopAsync()
    {
        var closedGracefully = false;
        try
        {
            while (await _outbound.Reader.WaitToReadAsync(_abortToken).ConfigureAwait(false))
            {
                while (true)
                {
                    OutboundMessage message;
                    lock (_enqueueLock)
                    {
                        if (!_outbound.Reader.TryRead(out message))
                        {
                            break;
                        }

                    }

                    if (message.CloseStatus is { } status)
                    {
                        if (!message.Payload.IsEmpty)
                        {
                            await WebSocket
                                .SendAsync(message.Payload, message.MessageType, endOfMessage: true, _abortToken)
                                .ConfigureAwait(false);
                        }

                        if (WebSocket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                        {
                            await WebSocket
                                .CloseOutputAsync(status, message.CloseDescription, _abortToken)
                                .ConfigureAwait(false);
                        }

                        closedGracefully = true;
                        return;
                    }

                    await WebSocket
                        .SendAsync(message.Payload, message.MessageType, endOfMessage: true, _abortToken)
                        .ConfigureAwait(false);
                    lock (_enqueueLock)
                    {
                        _queuedDataMessages--;
                        _queuedDataBytes -= message.Payload.Length;
                    }
                }
            }
        }
        catch (Exception exception)
        {
            _logger?.LogDebug(
                exception,
                "The outbound WebSocket writer ended.");
        }
        finally
        {
            End(abortSocket: !closedGracefully);
        }
    }
}