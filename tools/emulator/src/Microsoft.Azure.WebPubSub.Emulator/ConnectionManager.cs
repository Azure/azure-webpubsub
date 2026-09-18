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
        string host,
        SimpleWebSocketModeFeature? simpleWebSocketMode = null,
        bool reliable = false,
        string? subprotocol = null)
    {
        var context = UpstreamConnectionContext.Create(connectionId, hub, user, subprotocol, host);
        return Create(context, user, simpleWebSocketMode, reliable);
    }

    public LogicalConnection Create(
        UpstreamConnectionContext context, ClaimsPrincipal user, SimpleWebSocketModeFeature? simpleWebSocketMode = null, bool reliable = false)
    {
        return new LogicalConnection(
            context,
            user,
            simpleWebSocketMode,
            this,
            _runtimeOptions,
            reliable,
            _logger);
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

    public (string ConnectionId, string? UserId)[] GetGroupMembers(
        string hub, string group, string? afterConnectionId, int count)
    {
        // Keep only the requested page (plus the caller's lookahead), not a full group snapshot.
        var members = new SortedSet<LogicalConnection>(Comparer<LogicalConnection>.Create(
            (left, right) => StringComparer.InvariantCulture.Compare(left.ConnectionId, right.ConnectionId)));
        foreach (var connection in GetHubConnections(hub))
        {
            if (string.Compare(connection.ConnectionId, afterConnectionId, StringComparison.InvariantCulture) > 0 &&
                connection.Groups.ContainsKey(group))
            {
                members.Add(connection);
                if (members.Count > count)
                {
                    members.Remove(members.Max!);
                }
            }
        }

        return members.Select(connection => (connection.ConnectionId, connection.UserId)).ToArray();
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
            RemoveFromAllGroups(connection);
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

    public void RemoveConnectionFromAllGroups(string hub, string connectionId)
    {
        if (TryGet(hub, connectionId, out var connection))
        {
            RemoveFromAllGroups(connection);
        }
    }

    public void AddConnectionsToGroups(string hub, IReadOnlyList<string> groups, string? filter)
    {
        UpdateGroups(hub, groups, filter, add: true);
    }

    public void RemoveConnectionsFromGroups(string hub, IReadOnlyList<string> groups, string? filter)
    {
        UpdateGroups(hub, groups, filter, add: false);
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

        CloseConnection(connection, reason);
    }

    public void CloseAllConnections(
        string hub,
        IReadOnlySet<string>? excludedConnectionIds = null,
        string? reason = null)
    {
        CloseConnections(GetHubConnections(hub), excludedConnectionIds, reason);
    }

    public void CloseGroupConnections(
        string hub,
        string group,
        IReadOnlySet<string>? excludedConnectionIds = null,
        string? reason = null)
    {
        CloseConnections(
            GetHubConnections(hub).Where(connection => connection.Groups.ContainsKey(group)),
            excludedConnectionIds,
            reason);
    }

    public void CloseUserConnections(
        string hub,
        string userId,
        IReadOnlySet<string>? excludedConnectionIds = null,
        string? reason = null)
    {
        CloseConnections(GetUserConnections(hub, userId), excludedConnectionIds, reason);
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

    private void UpdateGroups(string hub, IReadOnlyList<string> groups, string? filter, bool add)
    {
        // Select every target before changing membership: the filter can depend on groups.
        var snapshot = GetHubConnections(hub)
            .Where(connection => ODataFilterExecutor.Instance.Matches(filter, connection))
            .ToArray();
        foreach (var connection in snapshot)
        {
            foreach (var group in groups)
            {
                if (add)
                {
                    connection.TryAddToGroup(group);
                }
                else
                {
                    connection.RemoveFromGroup(group);
                }
            }
        }
    }

    private static void RemoveFromAllGroups(LogicalConnection connection)
    {
        foreach (var group in connection.Groups.Keys)
        {
            connection.RemoveFromGroup(group);
        }
    }

    private static void CloseConnections(
        IEnumerable<LogicalConnection> connections,
        IReadOnlySet<string>? excludedConnectionIds,
        string? reason)
    {
        var snapshot = connections
            .Where(connection => excludedConnectionIds?.Contains(connection.ConnectionId) != true)
            .ToArray();
        foreach (var connection in snapshot)
        {
            // Close the selected instance, not a replacement registered under the same ID.
            CloseConnection(connection, reason);
        }
    }

    private static void CloseConnection(LogicalConnection connection, string? reason)
    {
        var transport = connection.CloseByAppServer(reason);
        if (transport is not null)
        {
            _ = transport.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty);
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