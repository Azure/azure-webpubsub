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

    private readonly object _stateLock = new();
    private readonly ConnectionManager _manager;
    private readonly ILogger? _logger;
    private readonly EmulatorRuntimeOptions _runtimeOptions;
    private readonly int _outboundQueueCapacity;
    private readonly long _outboundQueueMaxBytes;
    private readonly ConnectionRolePermissions _joinLeaveGroupPermissions;
    private readonly ConnectionRolePermissions _sendToGroupPermissions;

    private IClientPayloadProcessor? _activePayloadProcessor;
    private SocketTransport? _activeTransport;
    private bool _closed;

    public LogicalConnection(
        string connectionId,
        string hub,
        ClaimsPrincipal user,
        string? rawSendToGroup,
        ConnectionManager manager,
        EmulatorRuntimeOptions runtimeOptions,
        ILogger? logger = null)
    {
        ConnectionId = connectionId;
        Hub = hub;
        RawSendToGroup = rawSendToGroup;
        _manager = manager;
        _logger = logger;
        _runtimeOptions = runtimeOptions;
        _outboundQueueCapacity = runtimeOptions.OutboundQueueCapacity;
        _outboundQueueMaxBytes = runtimeOptions.MaxOutboundQueueBytes;

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

        Send(payloadProcessor.EncodeGroupData(this, group, fromUserId, data));
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
            _manager.Remove(this);
            _logger?.LogDebug(
                "Closing connection {ConnectionId}: {Reason}",
                ConnectionId,
                OutboundQueueFullReason);
            dropped.Abort();
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
        return transport;
    }
}