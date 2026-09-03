// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Security.Claims;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class LogicalConnection
{
    private const long ReliableControlByteAllowance = 64 * 1024;
    private const int ReliableControlMessageAllowance = 32;
    private const string OutboundQueueFullReason = "The outbound message queue is full.";
    private const string ReliableBufferFullReason = "The reliable message buffer is full.";

    private readonly SemaphoreSlim _processingGate = new(1, 1);
    private readonly SemaphoreSlim _messageProcessingGate = new(1, 1);
    private readonly object _stateLock = new();
    private readonly Queue<(ulong SequenceId, WebSocketPayload Payload)> _unacknowledgedMessages = [];
    private readonly ConnectionManager _manager;
    private readonly ILogger? _logger;
    private readonly EmulatorRuntimeOptions _runtimeOptions;
    private readonly int _outboundQueueCapacity;
    private readonly long _outboundQueueMaxBytes;
    private readonly int _reliableBufferCapacity;
    private readonly long _reliableBufferMaxBytes;
    private readonly ConnectionRolePermissions _joinLeaveGroupPermissions;
    private readonly ConnectionRolePermissions _sendToGroupPermissions;

    private IClientPayloadProcessor? _activePayloadProcessor;
    private SocketTransport? _activeTransport;
    private SocketTransport? _detachedTransport;
    private long _generation;
    private ulong _nextSequenceId;
    private long _unacknowledgedBytes;
    private bool _closed;
    private bool _reconnecting;

    public LogicalConnection(
        string connectionId,
        string hub,
        ClaimsPrincipal user,
        string? rawSendToGroup,
        ConnectionManager manager,
        EmulatorRuntimeOptions runtimeOptions,
        bool reliable = false,
        string? subprotocol = null,
        ILogger? logger = null)
    {
        ConnectionId = connectionId;
        Hub = hub;
        RawSendToGroup = rawSendToGroup;
        IsReliable = reliable;
        Subprotocol = subprotocol;
        _manager = manager;
        _logger = logger;
        _runtimeOptions = runtimeOptions;
        _outboundQueueCapacity = runtimeOptions.OutboundQueueCapacity;
        _outboundQueueMaxBytes = runtimeOptions.MaxOutboundQueueBytes;
        _reliableBufferCapacity = runtimeOptions.ReliableMessageBufferCapacity;
        _reliableBufferMaxBytes = runtimeOptions.MaxReliableMessageBufferBytes;

        UserId = user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);

        foreach (var group in user.FindAll("webpubsub.group").Select(claim => claim.Value))
        {
            if (!WebPubSubNameValidator.IsValidGroupName(group))
            {
                throw new ArgumentException("A token contains an invalid group name.", nameof(user));
            }
            Groups.TryAdd(group, 0);
        }

        var roles = user.Claims
            .Where(claim => claim.Type is "role" or ClaimTypes.Role)
            .Select(claim => claim.Value)
            .ToHashSet(StringComparer.Ordinal);
        _joinLeaveGroupPermissions = new(
            roles,
            "webpubsub.joinLeaveGroup",
            "webpubsub.joinLeaveGroups.");
        _sendToGroupPermissions = new(
            roles,
            "webpubsub.sendToGroup",
            "webpubsub.sendToGroups.");
    }

    public string ConnectionId { get; }

    public string Hub { get; }

    public string? RawSendToGroup { get; }

    public string? UserId { get; }

    public bool IsReliable { get; }

    public string? Subprotocol { get; }

    public AckCache AckIdCache { get; } = new();

    public ConcurrentDictionary<string, byte> Groups { get; } = new(StringComparer.Ordinal);

    public SocketTransport? TryAttach(
        WebSocket webSocket,
        IClientPayloadProcessor payloadProcessor)
    {
        lock (_stateLock)
        {
            if (_closed || _activeTransport is not null || _generation != 0)
            {
                return null;
            }

            return AttachLocked(webSocket, payloadProcessor, replay: false);
        }
    }

    public async ValueTask<SocketTransport?> TryReconnectAsync(
        WebSocket webSocket,
        IClientPayloadProcessor payloadProcessor,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        SocketTransport? previousTransport;
        lock (_stateLock)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (_closed || !IsReliable || _activePayloadProcessor is null || _reconnecting)
            {
                return null;
            }

            previousTransport = _activeTransport ?? _detachedTransport;
            if (previousTransport is not null && !previousTransport.TryAbortForReconnect())
            {
                return null;
            }

            _reconnecting = true;
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_runtimeOptions.ReconnectTimeout);
        try
        {
            if (previousTransport is not null)
            {
                await previousTransport.WaitForCompletionAsync(timeout.Token);
            }

            await _processingGate.WaitAsync(timeout.Token);
            try
            {
                timeout.Token.ThrowIfCancellationRequested();
                lock (_stateLock)
                {
                    timeout.Token.ThrowIfCancellationRequested();
                    if (_closed || _activePayloadProcessor is null ||
                        (_activeTransport is not null &&
                            !ReferenceEquals(_activeTransport, previousTransport)))
                    {
                        return null;
                    }

                    return AttachLocked(webSocket, payloadProcessor, replay: true);
                }
            }
            finally
            {
                _processingGate.Release();
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("Timed out waiting to recover the connection.");
        }
        finally
        {
            lock (_stateLock)
            {
                _reconnecting = false;
            }
        }
    }

    private SocketTransport? AttachLocked(
        WebSocket webSocket,
        IClientPayloadProcessor payloadProcessor,
        bool replay)
    {
        var dataQueueCapacity = IsReliable
            ? Math.Max(_outboundQueueCapacity, _reliableBufferCapacity)
            : _outboundQueueCapacity;
        var queueCapacity = IsReliable
            ? Math.Min(Math.Max(dataQueueCapacity, 1), int.MaxValue - ReliableControlMessageAllowance) +
                ReliableControlMessageAllowance
            : dataQueueCapacity;
        var dataQueueMaxBytes = IsReliable
            ? Math.Max(_outboundQueueMaxBytes, _reliableBufferMaxBytes)
            : _outboundQueueMaxBytes;
        var queueMaxBytes = IsReliable
            ? Math.Min(Math.Max(dataQueueMaxBytes, 1), long.MaxValue - ReliableControlByteAllowance) +
                ReliableControlByteAllowance
            : dataQueueMaxBytes;
        var transport = new SocketTransport(
            webSocket,
            _runtimeOptions.MaxMessageSizeBytes,
            queueCapacity,
            queueMaxBytes,
            _logger);
        if (replay)
        {
            foreach (var item in _unacknowledgedMessages)
            {
                if (transport.TryEnqueue(item.Payload.Bytes, item.Payload.MessageType) !=
                    TransportEnqueueResult.Enqueued)
                {
                    transport.Abort();
                    return null;
                }
            }
        }

        _activeTransport = transport;
        _detachedTransport = null;
        _activePayloadProcessor = payloadProcessor;
        _generation++;
        return transport;
    }

    public bool CanSendToGroup(string group)
    {
        return _sendToGroupPermissions.Check(group);
    }

    public bool CanJoinLeaveGroup(string group)
    {
        return _joinLeaveGroupPermissions.Check(group);
    }

    public void SendGroupData(
        string group,
        string? fromUserId,
        MessageData data)
    {
        SendData(sequenceId => _activePayloadProcessor!.EncodeGroupData(
            this,
            group,
            fromUserId,
            data,
            sequenceId));
    }

    public void Send(WebSocketPayload payload)
    {
        IClientPayloadProcessor? payloadProcessor;
        SocketTransport? transport;
        lock (_stateLock)
        {
            payloadProcessor = _activePayloadProcessor;
            transport = _activeTransport;
            if (_closed || payloadProcessor is null || transport is null)
            {
                return;
            }
        }

        SocketTransport? dropped;
        lock (_stateLock)
        {
            if (_closed ||
                !ReferenceEquals(_activePayloadProcessor, payloadProcessor) ||
                !ReferenceEquals(_activeTransport, transport))
            {
                return;
            }

            dropped = transport.TryEnqueue(payload.Bytes, payload.MessageType) switch
            {
                TransportEnqueueResult.Enqueued => null,
                TransportEnqueueResult.Closed => null,
                TransportEnqueueResult.Full => DropTransportLocked(),
                _ => throw new InvalidOperationException("Unknown transport enqueue result."),
            };
        }

        if (dropped is not null)
        {
            FailConnection(dropped, OutboundQueueFullReason);
        }
    }

    public void SendData(Func<ulong?, WebSocketPayload> payloadFactory)
    {
        SocketTransport? dropped = null;
        var failureReason = OutboundQueueFullReason;
        var failed = false;
        lock (_stateLock)
        {
            if (_closed || _activePayloadProcessor is null ||
                (!IsReliable && _activeTransport is null))
            {
                return;
            }

            WebSocketPayload payload;
            if (IsReliable)
            {
                if (_nextSequenceId == ulong.MaxValue ||
                    _unacknowledgedMessages.Count >= _reliableBufferCapacity)
                {
                    dropped = DropTransportLocked();
                    failed = true;
                    failureReason = ReliableBufferFullReason;
                    goto Complete;
                }

                var sequenceId = _nextSequenceId + 1;
                payload = payloadFactory(sequenceId);
                if (payload.Bytes.Length > _reliableBufferMaxBytes - _unacknowledgedBytes)
                {
                    dropped = DropTransportLocked();
                    failed = true;
                    failureReason = ReliableBufferFullReason;
                    goto Complete;
                }

                _nextSequenceId = sequenceId;
                _unacknowledgedMessages.Enqueue((sequenceId, payload));
                _unacknowledgedBytes += payload.Bytes.Length;
            }
            else
            {
                payload = payloadFactory(null);
            }

            if (_activeTransport is not null &&
                _activeTransport.TryEnqueue(payload.Bytes, payload.MessageType) ==
                TransportEnqueueResult.Full)
            {
                dropped = DropTransportLocked();
                failed = true;
            }

        Complete:
            ;
        }

        if (failed)
        {
            FailConnection(dropped, failureReason);
        }
    }

    public void Acknowledge(ulong sequenceId)
    {
        if (!IsReliable)
        {
            return;
        }

        lock (_stateLock)
        {
            while (_unacknowledgedMessages.TryPeek(out var item) &&
                item.SequenceId <= sequenceId)
            {
                _unacknowledgedMessages.Dequeue();
                _unacknowledgedBytes -= item.Payload.Bytes.Length;
            }
        }
    }

    public async ValueTask<bool> ProcessIfCurrentAsync(
        SocketTransport transport,
        Func<ValueTask> process,
        CancellationToken cancellationToken)
    {
        await _processingGate.WaitAsync(cancellationToken);
        try
        {
            lock (_stateLock)
            {
                if (_closed || !ReferenceEquals(_activeTransport, transport))
                {
                    return false;
                }
            }

            await process();
            return true;
        }
        finally
        {
            _processingGate.Release();
        }
    }

    public async ValueTask<PayloadProcessingResult?> ProcessMessageIfCurrentAsync(
        SocketTransport transport,
        Func<ValueTask<PayloadProcessingResult>> process,
        CancellationToken cancellationToken)
    {
        await _processingGate.WaitAsync(cancellationToken);
        try
        {
            lock (_stateLock)
            {
                if (_closed || !ReferenceEquals(_activeTransport, transport))
                {
                    return null;
                }
            }

            var result = await process();
            if (result.CloseStatus is { } closeStatus && !CloseIfCurrent(
                transport,
                closeStatus,
                result.CloseDescription ?? string.Empty))
            {
                return null;
            }

            return result;
        }
        finally
        {
            _processingGate.Release();
        }
    }

    public async ValueTask<(
        PayloadProcessingResult Result,
        SocketTransport? ClosingTransport)?> ProcessReceivedMessageAsync(
        Func<ValueTask<PayloadProcessingResult>> process,
        CancellationToken cancellationToken)
    {
        await _messageProcessingGate.WaitAsync(cancellationToken);
        try
        {
            lock (_stateLock)
            {
                if (_closed)
                {
                    return null;
                }
            }

            var result = await process();
            var closingTransport = result.CloseStatus is { } closeStatus
                ? Close(closeStatus, result.CloseDescription ?? string.Empty)
                : null;
            return (result, closingTransport);
        }
        finally
        {
            _messageProcessingGate.Release();
        }
    }

    public bool CloseIfCurrent(
        SocketTransport transport,
        WebSocketCloseStatus closeStatus,
        string closeDescription)
    {
        lock (_stateLock)
        {
            if (_closed ||
                (!ReferenceEquals(_activeTransport, transport) &&
                    !ReferenceEquals(_detachedTransport, transport)))
            {
                return false;
            }

            transport.TryCloseOutput(closeStatus, closeDescription);
            _closed = true;
            _activeTransport = null;
            _detachedTransport = null;
            _activePayloadProcessor = null;
            ClearReliableBufferLocked();
        }

        _manager.Remove(this);
        return true;
    }

    public SocketTransport? Close(
        WebSocketCloseStatus closeStatus,
        string closeDescription)
    {
        SocketTransport? transport;
        lock (_stateLock)
        {
            if (_closed)
            {
                return null;
            }

            transport = _activeTransport ?? _detachedTransport;
            transport?.TryCloseOutput(closeStatus, closeDescription);
            _closed = true;
            _activeTransport = null;
            _detachedTransport = null;
            _activePayloadProcessor = null;
            ClearReliableBufferLocked();
        }

        _manager.Remove(this);
        return transport;
    }

    public void Detach(SocketTransport transport)
    {
        var remove = false;
        var expire = false;
        long generation = 0;
        lock (_stateLock)
        {
            if (ReferenceEquals(_activeTransport, transport))
            {
                _activeTransport = null;
                if (_closed || !IsReliable || transport.IsClosing)
                {
                    _activePayloadProcessor = null;
                    _detachedTransport = null;
                    _closed = true;
                    ClearReliableBufferLocked();
                    remove = true;
                }
                else
                {
                    _detachedTransport = transport;
                    generation = _generation;
                    expire = true;
                }
            }
        }

        if (remove)
        {
            _manager.Remove(this);
        }
        else if (expire)
        {
            _manager.ScheduleExpiration(this, generation);
        }
    }

    public bool TryExpire(long generation)
    {
        lock (_stateLock)
        {
            if (_closed || _activeTransport is not null || _generation != generation)
            {
                return false;
            }

            _closed = true;
            _activePayloadProcessor = null;
            _detachedTransport?.Abort();
            _detachedTransport = null;
            ClearReliableBufferLocked();
            return true;
        }
    }

    private SocketTransport? DropTransportLocked()
    {
        var transport = _activeTransport ?? _detachedTransport;
        _activeTransport = null;
        _detachedTransport = null;
        _activePayloadProcessor = null;
        _closed = true;
        ClearReliableBufferLocked();
        return transport;
    }

    private void FailConnection(SocketTransport? transport, string reason)
    {
        _manager.Remove(this);
        _logger?.LogDebug(
            "Closing connection {ConnectionId}: {Reason}",
            ConnectionId,
            reason);
        transport?.Abort();
    }

    private void ClearReliableBufferLocked()
    {
        _unacknowledgedMessages.Clear();
        _unacknowledgedBytes = 0;
    }
}