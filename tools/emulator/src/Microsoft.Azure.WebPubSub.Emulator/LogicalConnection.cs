// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Security.Claims;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class LogicalConnection : IODataFilterModel
{
    // Headroom above the reliable buffer so acks, pongs, and replay never lose their slot.
    // The unacknowledged buffer stays the definitive cap for reliable data messages.
    private const int ControlMessageAllowance = 32;
    private const string OutboundQueueFullReason = "The outbound message queue is full.";
    private const string ReliableBufferFullReason = "The reliable message buffer is full.";

    private readonly object _stateLock = new();
    private readonly HashSet<ulong> _ackIds = [];
    private readonly SortedDictionary<ulong, byte[]> _unacknowledgedMessages = [];
    private readonly ConnectionManager _manager;
    private readonly WebPubSubTokenService _tokenService;
    private readonly ILogger? _logger;
    private readonly int _bufferCapacity;
    private readonly int _bufferMaxBytes;
    private readonly int _outboundQueueCapacity;
    private readonly ConnectionRolePermissions _joinLeavePermissions;
    private readonly ConnectionRolePermissions _sendToGroupPermissions;

    private SocketTransport? _activeTransport;
    private long _generation;
    private int _messageId;
    private long _unacknowledgedMessageBytes;
    private ulong _nextSequenceId;
    private bool _closed;

    public LogicalConnection(
        string connectionId,
        string hub,
        string? subprotocol,
        ClaimsPrincipal user,
        string host,
        string? connectionState,
        ConnectionManager manager,
        WebPubSubTokenService tokenService,
        EmulatorRuntimeOptions runtimeOptions,
        ILogger? logger = null)
    {
        ConnectionId = connectionId;
        Hub = hub;
        Subprotocol = subprotocol;
        User = user;
        Host = host;
        ConnectionState = connectionState;
        _manager = manager;
        _tokenService = tokenService;
        _logger = logger;
        _bufferCapacity = runtimeOptions.ReliableMessageBufferCapacity;
        _bufferMaxBytes = runtimeOptions.ReliableMessageBufferMaxBytes;
        _outboundQueueCapacity = ControlMessageAllowance +
            Math.Min(Math.Max(_bufferCapacity, 1), int.MaxValue - ControlMessageAllowance);

        UserId = user.FindFirstValue("sub") ??
            user.FindFirstValue(ClaimTypes.NameIdentifier);

        foreach (var group in user.FindAll("webpubsub.group").Select(claim => claim.Value))
        {
            Groups.TryAdd(group, 0);
        }

        Roles = user.Claims
            .Where(claim => claim.Type is "role" or ClaimTypes.Role)
            .Select(claim => claim.Value)
            .ToHashSet(StringComparer.Ordinal);
        _joinLeavePermissions = new(
            Roles,
            "webpubsub.joinLeaveGroup",
            "webpubsub.joinLeaveGroups.");
        _sendToGroupPermissions = new(
            Roles,
            "webpubsub.sendToGroup",
            "webpubsub.sendToGroups.");
    }

    public string ConnectionId { get; }

    public string Hub { get; }

    public string? Subprotocol { get; }

    public ClaimsPrincipal User { get; }

    public string Host { get; }

    public string? UserId { get; }

    public string? ConnectionState { get; private set; }

    public ConcurrentDictionary<string, byte> Groups { get; } = new(StringComparer.Ordinal);

    string[] IODataFilterModel.Groups => Groups.Keys.ToArray();

    string? IODataFilterModel.Protocol => Subprotocol;

    public HashSet<string> Roles { get; }

    public bool IsReliable => Subprotocol == WebPubSubJsonProtocol.ReliableJsonSubprotocol;

    public bool IsRaw => Subprotocol is null;

    /// <summary>
    /// Replaces the transport of this connection. Replay is queued while the state lock is
    /// held, so replayed messages are always ahead of anything published afterwards.
    /// </summary>
    public SocketTransport? TryAttach(WebSocket webSocket, bool replay)
    {
        SocketTransport? previous;
        SocketTransport current;
        lock (_stateLock)
        {
            if (_closed)
            {
                return null;
            }

            previous = _activeTransport;
            current = new SocketTransport(
                webSocket,
                ++_generation,
                _outboundQueueCapacity,
                _logger);
            _activeTransport = current;

            if (replay)
            {
                foreach (var payload in _unacknowledgedMessages.Values)
                {
                    _ = current.TryEnqueue(payload, WebSocketMessageType.Text);
                }
            }
        }

        previous?.Abort();
        return current;
    }

    public void SendConnected()
    {
        var token = IsReliable
            ? _tokenService.IssueReconnectionToken(ConnectionId)
            : null;
        SendControl(WebPubSubJsonProtocol.WriteConnected(UserId, ConnectionId, token));
    }

    public void SendAck(ulong ackId)
    {
        SendControl(WebPubSubJsonProtocol.WriteAck(ackId));
    }

    public void SendErrorAck(ulong ackId, string name, string message)
    {
        SendControl(WebPubSubJsonProtocol.WriteErrorAck(ackId, name, message));
    }

    public void SendPong()
    {
        SendControl(WebPubSubJsonProtocol.WritePong());
    }

    public void SendGroupData(string group, string? fromUserId, MessageData data)
    {
        if (IsRaw)
        {
            SendRaw(data);
            return;
        }

        SendData(sequenceId =>
            WebPubSubJsonProtocol.WriteGroupData(group, fromUserId, data, sequenceId));
    }

    public void SendServerData(MessageData data)
    {
        if (IsRaw)
        {
            SendRaw(data);
            return;
        }

        SendData(sequenceId => WebPubSubJsonProtocol.WriteServerData(data, sequenceId));
    }

    public void Acknowledge(ulong sequenceId)
    {
        lock (_stateLock)
        {
            var acknowledged = _unacknowledgedMessages.Keys
                .TakeWhile(id => id <= sequenceId)
                .ToArray();
            foreach (var id in acknowledged)
            {
                _unacknowledgedMessageBytes -= _unacknowledgedMessages[id].LongLength;
                _unacknowledgedMessages.Remove(id);
            }
        }
    }

    public bool TryAddAckId(ulong ackId)
    {
        lock (_stateLock)
        {
            return _ackIds.Add(ackId);
        }
    }

    public bool CanJoinOrLeave(string group)
    {
        return _joinLeavePermissions.Check(group);
    }

    public bool CanSendToGroup(string group)
    {
        return _sendToGroupPermissions.Check(group);
    }

    public UpstreamEvent CreateSystemEvent(string eventName, MessageData data)
    {
        return CreateEvent(eventName, UpstreamEventCategory.System, data);
    }

    public UpstreamEvent CreateUserEvent(string eventName, MessageData data)
    {
        return CreateEvent(eventName, UpstreamEventCategory.User, data);
    }

    public void SetConnectionState(string? connectionState)
    {
        if (connectionState is not null)
        {
            ConnectionState = connectionState;
        }
    }

    public void Detach(long generation, bool normalClose)
    {
        var remove = false;
        lock (_stateLock)
        {
            if (_activeTransport?.Generation != generation)
            {
                return;
            }

            _activeTransport = null;
            if (normalClose || !IsReliable)
            {
                _closed = true;
                remove = true;
            }
        }

        if (remove)
        {
            _manager.Remove(this, normalClose ? "The client closed the connection." : "The connection ended.");
        }
        else
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
            return true;
        }
    }

    public void Close(string reason)
    {
        SocketTransport? transport;
        lock (_stateLock)
        {
            if (_closed)
            {
                return;
            }

            _closed = true;
            transport = _activeTransport;
            _activeTransport = null;
        }

        _manager.Remove(this, reason);
        if (transport is not null)
        {
            if (IsRaw)
            {
                transport.CloseOutput(WebSocketCloseStatus.NormalClosure, reason);
            }
            else
            {
                transport.CloseOutput(
                    WebPubSubJsonProtocol.WriteDisconnected(reason),
                    WebSocketMessageType.Text,
                    WebSocketCloseStatus.NormalClosure,
                    reason);
            }
        }
    }

    private UpstreamEvent CreateEvent(
        string eventName,
        UpstreamEventCategory category,
        MessageData data)
    {
        return new(
            Interlocked.Increment(ref _messageId),
            Hub,
            eventName,
            category,
            ConnectionId,
            UserId,
            Subprotocol,
            ConnectionState,
            data,
            Host);
    }

    private void SendData(Func<ulong?, byte[]> payloadFactory)
    {
        SocketTransport? dropped;
        var remove = false;
        var reason = OutboundQueueFullReason;
        lock (_stateLock)
        {
            if (_closed)
            {
                return;
            }

            if (!IsReliable)
            {
                dropped = EnqueueLocked(payloadFactory(null), WebSocketMessageType.Text);
                remove = dropped is not null;
            }
            else if (_unacknowledgedMessages.Count >= _bufferCapacity)
            {
                dropped = DropReceiverLocked();
                remove = true;
                reason = ReliableBufferFullReason;
            }
            else
            {
                var sequenceId = _nextSequenceId + 1;
                var payload = payloadFactory(sequenceId);
                if (_unacknowledgedMessageBytes + payload.LongLength > _bufferMaxBytes)
                {
                    dropped = DropReceiverLocked();
                    remove = true;
                    reason = ReliableBufferFullReason;
                }
                else
                {
                    _nextSequenceId = sequenceId;
                    _unacknowledgedMessages.Add(sequenceId, payload);
                    _unacknowledgedMessageBytes += payload.LongLength;
                    dropped = EnqueueLocked(payload, WebSocketMessageType.Text);
                    remove = dropped is not null;
                }
            }
        }

        if (remove)
        {
            _manager.Remove(this, reason);
        }
        if (dropped is not null)
        {
            dropped.CloseOutput(WebSocketCloseStatus.PolicyViolation, reason);
        }
    }

    private void SendRaw(MessageData data)
    {
        var messageType = data.Type == MessageDataType.Binary
            ? WebSocketMessageType.Binary
            : WebSocketMessageType.Text;
        Publish(data.Bytes, messageType);
    }

    private void SendControl(byte[] payload)
    {
        Publish(payload, WebSocketMessageType.Text);
    }

    private void Publish(byte[] payload, WebSocketMessageType messageType)
    {
        SocketTransport? dropped;
        lock (_stateLock)
        {
            dropped = _closed ? null : EnqueueLocked(payload, messageType);
        }

        if (dropped is not null)
        {
            _manager.Remove(this, OutboundQueueFullReason);
            dropped.CloseOutput(WebSocketCloseStatus.PolicyViolation, OutboundQueueFullReason);
        }
    }

    /// <summary>
    /// Enqueue only. The state lock is never held across network I/O, and a receiver that
    /// cannot keep up is detached here and closed by the caller outside the lock.
    /// </summary>
    private SocketTransport? EnqueueLocked(byte[] payload, WebSocketMessageType messageType)
    {
        var transport = _activeTransport;
        if (transport is null)
        {
            return null;
        }

        return transport.TryEnqueue(payload, messageType) switch
        {
            TransportEnqueueResult.Enqueued => null,
            // The receive loop will detach this generation and schedule reliable
            // expiration. Until then, reliable messages remain buffered for replay.
            TransportEnqueueResult.Closed => null,
            TransportEnqueueResult.Full => DropReceiverLocked(),
            _ => throw new InvalidOperationException("Unknown transport enqueue result."),
        };
    }

    private SocketTransport? DropReceiverLocked()
    {
        var transport = _activeTransport;
        _activeTransport = null;
        _closed = true;
        _unacknowledgedMessages.Clear();
        _unacknowledgedMessageBytes = 0;
        return transport;
    }
}
