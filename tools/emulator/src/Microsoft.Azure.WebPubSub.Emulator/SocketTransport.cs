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

/// <summary>
/// One WebSocket attachment of a logical connection. Everything written to the socket
/// goes through a bounded queue drained by a single writer, so producers only pay for an
/// ordered enqueue and a slow or non-reading client can never block the broker.
/// </summary>
internal sealed class SocketTransport : IDisposable
{
    private static readonly TimeSpan CloseDrainTimeout = TimeSpan.FromSeconds(5);

    // Never disposed on purpose: a disposed source makes the captured token unusable and
    // turns concurrent send/detach/replace races into ObjectDisposedException.
    private readonly CancellationTokenSource _abortSource = new();
    private readonly CancellationToken _abortToken;
    private readonly Channel<OutboundMessage> _outbound;
    private readonly ILogger? _logger;
    private readonly Task _writeLoop;
    private int _ended;

    public SocketTransport(
        WebSocket webSocket,
        long generation,
        int queueCapacity,
        ILogger? logger = null)
    {
        WebSocket = webSocket;
        Generation = generation;
        _logger = logger;
        _abortToken = _abortSource.Token;
        _outbound = Channel.CreateBounded<OutboundMessage>(
            new BoundedChannelOptions(Math.Max(queueCapacity, 1))
            {
                SingleReader = true,
                SingleWriter = false,
                AllowSynchronousContinuations = false,
                FullMode = BoundedChannelFullMode.Wait,
            });
        _writeLoop = Task.Run(RunWriteLoopAsync);
    }

    public long Generation { get; }

    public WebSocket WebSocket { get; }

    public CancellationToken Aborted => _abortToken;

    public TransportEnqueueResult TryEnqueue(
        ReadOnlyMemory<byte> payload,
        WebSocketMessageType messageType)
    {
        if (Volatile.Read(ref _ended) != 0)
        {
            return TransportEnqueueResult.Closed;
        }

        if (_outbound.Writer.TryWrite(new OutboundMessage(payload, messageType, null, null)))
        {
            return TransportEnqueueResult.Enqueued;
        }

        return Volatile.Read(ref _ended) != 0
            ? TransportEnqueueResult.Closed
            : TransportEnqueueResult.Full;
    }

    /// <summary>
    /// Queues a close frame behind everything already queued. Falls back to an abort when
    /// the queue is full, so a stuck client is still removed without waiting on the network.
    /// </summary>
    public void CloseOutput(WebSocketCloseStatus status, string description)
    {
        var close = new OutboundMessage(
            default,
            WebSocketMessageType.Close,
            status,
            description);
        if (!_outbound.Writer.TryWrite(close))
        {
            Abort();
        }
    }

    public void Abort()
    {
        End(abortSocket: true);
    }

    /// <summary>
    /// Queues a close frame and waits for the writer to drain, so the request that owns
    /// this socket can finish only after the peer has been told why. Only the owning
    /// receive loop uses this; broker paths never wait for the network.
    /// </summary>
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
                while (_outbound.Reader.TryRead(out var message))
                {
                    if (message.CloseStatus is { } status)
                    {
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
                }
            }
        }
        catch (Exception exception)
        {
            _logger?.LogDebug(
                exception,
                "The outbound writer for WebSocket transport {Generation} ended.",
                Generation);
        }
        finally
        {
            End(abortSocket: !closedGracefully);
        }
    }
}
