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
    private readonly int _outboundQueueCapacity;
    private readonly long _outboundQueueMaxBytes;
    private readonly ConnectionRolePermissions _sendToGroupPermissions;

    private SocketTransport? _activeTransport;
    private bool _closed;

    public LogicalConnection(
        string connectionId,
        string hub,
        ClaimsPrincipal user,
        ConnectionManager manager,
        EmulatorRuntimeOptions runtimeOptions,
        ILogger? logger = null)
    {
        ConnectionId = connectionId;
        Hub = hub;
        _manager = manager;
        _logger = logger;
        _outboundQueueCapacity = runtimeOptions.OutboundQueueCapacity;
        _outboundQueueMaxBytes = runtimeOptions.MaxOutboundQueueBytes;

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
        _sendToGroupPermissions = new(
            roles,
            "webpubsub.sendToGroup",
            "webpubsub.sendToGroups.");
    }

    public string ConnectionId { get; }

    public string Hub { get; }

    public ConcurrentDictionary<string, byte> Groups { get; } = new(StringComparer.Ordinal);

    public SocketTransport? TryAttach(WebSocket webSocket)
    {
        lock (_stateLock)
        {
            if (_closed || _activeTransport is not null)
            {
                return null;
            }

            _activeTransport = new SocketTransport(
                webSocket,
                _outboundQueueCapacity,
                _outboundQueueMaxBytes,
                _logger);
            return _activeTransport;
        }
    }

    public bool CanSendToGroup(string group)
    {
        return _sendToGroupPermissions.Check(group);
    }

    public void Send(RawMessage message)
    {
        SocketTransport? dropped;
        lock (_stateLock)
        {
            dropped = _closed || _activeTransport is null
                ? null
                : _activeTransport.TryEnqueue(message.Payload, message.MessageType) switch
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
        _closed = true;
        return transport;
    }
}