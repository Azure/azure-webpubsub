// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Security.Claims;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class LogicalConnection
{
    private const string OutboundQueueFullReason = "The outbound message queue is full.";
    private const string ReliableBufferFullReason = "The reliable message buffer is full.";

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
    private ulong _nextSequenceId;
    private long _unacknowledgedBytes;
    private bool _closed;

    public LogicalConnection(
        string connectionId,
        string hub,
        ClaimsPrincipal user,
        string? rawSendToGroup,
        ConnectionManager manager,
        EmulatorRuntimeOptions runtimeOptions,
        bool reliable = false,
        ILogger? logger = null)
    {
        ConnectionId = connectionId;
        Hub = hub;
        RawSendToGroup = rawSendToGroup;
        IsReliable = reliable;
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

    public AckCache AckIdCache { get; } = new();

    public ConcurrentDictionary<string, byte> Groups { get; } = new(StringComparer.Ordinal);

    public SocketTransport? TryAttach(
        WebSocket webSocket,
        IClientPayloadProcessor payloadProcessor)
    {
        lock (_stateLock)
        {
            if (_closed || _activeTransport is not null)
            {
                return null;
            }

            _activeTransport = new SocketTransport(
                webSocket,
                _runtimeOptions.MaxMessageSizeBytes,
                _outboundQueueCapacity,
                _outboundQueueMaxBytes,
                _logger);
            _activePayloadProcessor = payloadProcessor;
            return _activeTransport;
        }
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

        SendData(sequenceId => payloadProcessor.EncodeGroupData(
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
        lock (_stateLock)
        {
            if (_closed || _activeTransport is null)
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
                    failureReason = ReliableBufferFullReason;
                    goto Complete;
                }

                var sequenceId = _nextSequenceId + 1;
                payload = payloadFactory(sequenceId);
                if (payload.Bytes.Length > _reliableBufferMaxBytes - _unacknowledgedBytes)
                {
                    dropped = DropTransportLocked();
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

            if (_activeTransport.TryEnqueue(payload.Bytes, payload.MessageType) ==
                TransportEnqueueResult.Full)
            {
                dropped = DropTransportLocked();
            }

        Complete:
            ;
        }

        if (dropped is not null)
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
            if (sequenceId > _nextSequenceId)
            {
                return;
            }

            while (_unacknowledgedMessages.TryPeek(out var item) &&
                item.SequenceId <= sequenceId)
            {
                _unacknowledgedMessages.Dequeue();
                _unacknowledgedBytes -= item.Payload.Bytes.Length;
            }
        }
    }

    public void Detach(SocketTransport transport)
    {
        var remove = false;
        lock (_stateLock)
        {
            if (ReferenceEquals(_activeTransport, transport))
            {
                _activeTransport = null;
                _activePayloadProcessor = null;
                _closed = true;
                ClearReliableBufferLocked();
                remove = true;
            }
        }

        if (remove)
        {
            _manager.Remove(this);
        }
    }

    private SocketTransport? DropTransportLocked()
    {
        var transport = _activeTransport;
        _activeTransport = null;
        _activePayloadProcessor = null;
        _closed = true;
        ClearReliableBufferLocked();
        return transport;
    }

    private void FailConnection(SocketTransport transport, string reason)
    {
        _manager.Remove(this);
        _logger?.LogDebug(
            "Closing connection {ConnectionId}: {Reason}",
            ConnectionId,
            reason);
        transport.Abort();
    }

    private void ClearReliableBufferLocked()
    {
        _unacknowledgedMessages.Clear();
        _unacknowledgedBytes = 0;
    }
}