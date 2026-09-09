// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class ConnectionManager
{
    private readonly ConcurrentDictionary<(string Hub, string ConnectionId), LogicalConnection> _connections = [];
    private readonly EmulatorRuntimeOptions _runtimeOptions;
    private readonly ILogger<ConnectionManager> _logger;
    private readonly UpstreamEventDispatcher _events;

    public ConnectionManager(
        EmulatorRuntimeOptions runtimeOptions,
        ILogger<ConnectionManager> logger,
        UpstreamEventDispatcher events)
    {
        _runtimeOptions = runtimeOptions;
        _logger = logger;
        _events = events;
    }

    public LogicalConnection Create(
        string connectionId,
        string hub,
        ClaimsPrincipal user,
        string? rawSendToGroup = null,
        bool reliable = false,
        string? subprotocol = null,
        string host = "localhost")
    {
        return new LogicalConnection(
            connectionId,
            hub,
            user,
            rawSendToGroup,
            this,
            _runtimeOptions,
            reliable,
            subprotocol,
            _logger,
            host);
    }

    public bool TryActivate(LogicalConnection connection)
    {
        return _connections.TryAdd(
            (connection.Hub, connection.ConnectionId),
            connection);
    }

    public bool TryGet(
        string hub,
        string connectionId,
        [NotNullWhen(true)] out LogicalConnection? connection)
    {
        return _connections.TryGetValue((hub, connectionId), out connection);
    }

    public bool ConnectionExists(string hub, string connectionId)
    {
        return _connections.ContainsKey((hub, connectionId));
    }

    public bool GroupExists(string hub, string group)
    {
        return GetHubConnections(hub).Any(connection => connection.Groups.ContainsKey(group));
    }

    public bool UserExists(string hub, string userId)
    {
        return GetUserConnections(hub, userId).Any();
    }

    public void SendToAll(
        string hub,
        MessageData data,
        IReadOnlySet<string>? excludedConnectionIds = null,
        string? filter = null)
    {
        foreach (var connection in GetHubConnections(hub)
            .Where(connection => excludedConnectionIds?.Contains(connection.ConnectionId) != true)
            .Where(connection => ODataFilterExecutor.Instance.Matches(filter, connection)))
        {
            connection.SendServerData(data);
        }
    }

    public void SendToConnection(string hub, string connectionId, MessageData data)
    {
        if (_connections.TryGetValue((hub, connectionId), out var connection))
        {
            connection.SendServerData(data);
        }
    }

    public void SendToUser(
        string hub,
        string userId,
        MessageData data,
        string? filter = null)
    {
        foreach (var connection in GetUserConnections(hub, userId)
            .Where(connection => ODataFilterExecutor.Instance.Matches(filter, connection)))
        {
            connection.SendServerData(data);
        }
    }

    public bool AddUserToGroup(string hub, string userId, string group)
    {
        var connections = GetUserConnections(hub, userId).ToArray();
        foreach (var connection in connections)
        {
            connection.TryAddToGroup(group);
        }

        return connections.Length > 0;
    }

    public void RemoveUserFromGroup(string hub, string userId, string group)
    {
        foreach (var connection in GetUserConnections(hub, userId))
        {
            connection.RemoveFromGroup(group);
        }
    }

    public void RemoveUserFromAllGroups(string hub, string userId)
    {
        foreach (var connection in GetUserConnections(hub, userId))
        {
            foreach (var group in connection.Groups.Keys)
            {
                connection.RemoveFromGroup(group);
            }
        }
    }

    public bool AddConnectionToGroup(string hub, string group, string connectionId)
    {
        return _connections.TryGetValue((hub, connectionId), out var connection) &&
            connection.TryAddToGroup(group);
    }

    public void RemoveConnectionFromGroup(string hub, string group, string connectionId)
    {
        if (_connections.TryGetValue((hub, connectionId), out var connection))
        {
            connection.RemoveFromGroup(group);
        }
    }

    public void CloseConnection(
        string hub,
        string connectionId,
        string? reason)
    {
        if (!_connections.TryGetValue((hub, connectionId), out var connection))
        {
            return;
        }

        var transport = connection.CloseByAppServer(reason);
        if (transport is not null)
        {
            _ = transport.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty);
        }
    }

    public void Remove(LogicalConnection connection, string? reason = null)
    {
        if (_connections.TryRemove(new KeyValuePair<(string, string), LogicalConnection>(
            (connection.Hub, connection.ConnectionId), connection)))
        {
            _ = _events.DispatchNotificationAsync(connection.UpstreamContext, "disconnected",
                JsonSerializer.SerializeToUtf8Bytes(new { reason = reason ?? "The connection ended." }));
        }
    }

    public void ScheduleExpiration(LogicalConnection connection, long generation)
    {
        _ = ExpireAsync(connection, generation);
    }

    public void SendToGroup(
        string hub,
        string group,
        MessageData data,
        LogicalConnection? sender,
        bool noEcho,
        IReadOnlySet<string>? excludedConnectionIds = null,
        string? filter = null)
    {
        foreach (var connection in GetHubConnections(hub)
            .Where(connection => connection.Groups.ContainsKey(group))
            .Where(connection => !noEcho || connection != sender)
            .Where(connection => excludedConnectionIds?.Contains(connection.ConnectionId) != true)
            .Where(connection => ODataFilterExecutor.Instance.Matches(filter, connection)))
        {
            connection.SendGroupData(group, sender?.UserId, data);
        }
    }

    private IEnumerable<LogicalConnection> GetHubConnections(string hub)
    {
        return _connections
            .Where(item => string.Equals(item.Key.Hub, hub, StringComparison.Ordinal))
            .Select(item => item.Value);
    }

    private IEnumerable<LogicalConnection> GetUserConnections(string hub, string userId)
    {
        return GetHubConnections(hub)
            .Where(connection => string.Equals(
                connection.UserId,
                userId,
                StringComparison.Ordinal));
    }

    private async Task ExpireAsync(LogicalConnection connection, long generation)
    {
        try
        {
            await Task.Delay(_runtimeOptions.ReconnectTimeout);
            if (connection.TryExpire(generation))
            {
                Remove(connection, "The connection recovery timeout expired.");
            }
        }
        catch (Exception exception)
        {
            _logger.LogDebug(
                exception,
                "Expiring connection {ConnectionId} failed.",
                connection.ConnectionId);
        }
    }
}