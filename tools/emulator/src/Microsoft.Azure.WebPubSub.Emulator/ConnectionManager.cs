// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Security.Claims;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class ConnectionManager
{
    private readonly ConcurrentDictionary<(string Hub, string ConnectionId), LogicalConnection> _connections = [];
    private readonly object _groupStateLock = new();
    private readonly WebPubSubTokenService _tokenService;
    private readonly EmulatorRuntimeOptions _runtimeOptions;
    private readonly UpstreamEventDispatcher _events;
    private readonly ILogger<ConnectionManager> _logger;

    public ConnectionManager(
        WebPubSubTokenService tokenService,
        EmulatorRuntimeOptions runtimeOptions,
        UpstreamEventDispatcher events,
        ILogger<ConnectionManager> logger)
    {
        _tokenService = tokenService;
        _runtimeOptions = runtimeOptions;
        _events = events;
        _logger = logger;
    }

    public LogicalConnection Create(
        string connectionId,
        string hub,
        string? subprotocol,
        ClaimsPrincipal user,
        string host,
        string? connectionState)
    {
        var connection = new LogicalConnection(
            connectionId,
            hub,
            subprotocol,
            user,
            host,
            connectionState,
            this,
            _tokenService,
            _runtimeOptions,
            _logger);
        return _connections.TryAdd((hub, connection.ConnectionId), connection)
            ? connection
            : throw new InvalidOperationException($"Connection '{connectionId}' already exists.");
    }

    public bool TryGet(
        string hub,
        string connectionId,
        [NotNullWhen(true)] out LogicalConnection? connection)
    {
        return _connections.TryGetValue((hub, connectionId), out connection);
    }

    public void Remove(LogicalConnection connection, string reason)
    {
        var removed = false;
        lock (_groupStateLock)
        {
            if (_connections.TryRemove((connection.Hub, connection.ConnectionId), out _))
            {
                ClearAllGroupState(connection);
                removed = true;
            }
        }

        if (removed)
        {
            _ = NotifyDisconnectedAsync(connection, reason);
        }
    }

    public void ScheduleExpiration(LogicalConnection connection, long generation)
    {
        _ = ExpireAsync(connection, generation);
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
        return GetUserConnections(hub, userId).Length > 0;
    }

    public bool AddConnectionToGroup(string hub, string connectionId, string group)
    {
        lock (_groupStateLock)
        {
            if (!TryGet(hub, connectionId, out var connection))
            {
                return false;
            }

            connection.Groups.TryAdd(group, 0);
            return true;
        }
    }

    public bool AddToGroup(LogicalConnection connection, string group)
    {
        lock (_groupStateLock)
        {
            if (!IsActiveConnection(connection))
            {
                return false;
            }

            connection.Groups.TryAdd(group, 0);
            return true;
        }
    }

    public bool RemoveConnectionFromGroup(string hub, string connectionId, string group)
    {
        if (!TryGet(hub, connectionId, out var connection))
        {
            return false;
        }

        RemoveFromGroup(connection, group);
        return true;
    }

    public void RemoveConnectionFromAllGroups(string hub, string connectionId)
    {
        if (TryGet(hub, connectionId, out var connection))
        {
            RemoveFromAllGroups(connection);
        }
    }

    public void AddConnectionsToGroups(
        string hub,
        IReadOnlyList<string> groups,
        string? filter)
    {
        lock (_groupStateLock)
        {
            foreach (var connection in GetHubConnections(hub)
                .Where(connection => ODataFilterExecutor.Instance.Matches(filter, connection)))
            {
                foreach (var group in groups)
                {
                    connection.Groups.TryAdd(group, 0);
                }
            }
        }
    }

    public void RemoveConnectionsFromGroups(
        string hub,
        IReadOnlyList<string> groups,
        string? filter)
    {
        foreach (var connection in GetHubConnections(hub)
            .Where(connection => ODataFilterExecutor.Instance.Matches(filter, connection)))
        {
            foreach (var group in groups)
            {
                RemoveFromGroup(connection, group);
            }
        }
    }

    public bool AddUserToGroup(string hub, string userId, string group)
    {
        lock (_groupStateLock)
        {
            var connections = GetUserConnections(hub, userId);
            foreach (var connection in connections)
            {
                connection.Groups.TryAdd(group, 0);
            }

            return connections.Length > 0;
        }
    }

    public void RemoveUserFromGroup(string hub, string userId, string group)
    {
        foreach (var connection in GetUserConnections(hub, userId))
        {
            RemoveFromGroup(connection, group);
        }
    }

    public void RemoveUserFromAllGroups(string hub, string userId)
    {
        foreach (var connection in GetUserConnections(hub, userId))
        {
            RemoveFromAllGroups(connection);
        }
    }

    public void RemoveFromGroup(LogicalConnection connection, string group)
    {
        lock (_groupStateLock)
        {
            if (connection.Groups.TryRemove(group, out _))
            {
                ClearGroupState(connection, group);
                connection.GroupStateSubscriptions.Unsubscribe(group);
            }
        }
    }

    public bool SetGroupState(
        LogicalConnection connection,
        string group,
        Dictionary<string, string>? state)
    {
        lock (_groupStateLock)
        {
            if (!IsActiveGroupMember(connection, group))
            {
                return false;
            }

            var updatedAt = state is null
                ? connection.GroupStateStore.ClearState(group)
                : connection.GroupStateStore.SetState(group, state);
            PublishGroupStateUpdate(connection, group, state, updatedAt);
            return true;
        }
    }

    public bool SubscribeGroupState(
        LogicalConnection connection,
        string group,
        out GroupStateItem[] snapshot)
    {
        lock (_groupStateLock)
        {
            if (!IsActiveGroupMember(connection, group))
            {
                snapshot = [];
                return false;
            }

            connection.GroupStateSubscriptions.Subscribe(group);
            snapshot = GetGroupStateSnapshot(connection.Hub, group);
            return true;
        }
    }

    public void UnsubscribeGroupState(LogicalConnection connection, string group)
    {
        lock (_groupStateLock)
        {
            connection.GroupStateSubscriptions.Unsubscribe(group);
        }
    }

    private GroupStateItem[] GetGroupStateSnapshot(string hub, string group)
    {
        return GetHubConnections(hub)
            .Where(connection => connection.Groups.ContainsKey(group))
            .Select(connection => (Connection: connection, Entry: connection.GroupStateStore.GetState(group)))
            .Where(item => item.Entry is not null)
            .OrderBy(item => item.Connection.ConnectionId, StringComparer.Ordinal)
            .Take(200)
            .Select(item => new GroupStateItem(
                item.Connection.ConnectionId,
                item.Connection.UserId,
                item.Entry!.State,
                item.Entry.UpdatedAt))
            .ToArray();
    }

    public bool CloseConnection(string hub, string connectionId, string reason)
    {
        if (!TryGet(hub, connectionId, out var connection))
        {
            return false;
        }

        connection.Close(reason);
        return true;
    }

    public void CloseUserConnections(
        string hub,
        string userId,
        string reason,
        IReadOnlySet<string>? excludedConnectionIds = null)
    {
        foreach (var connection in GetUserConnections(hub, userId)
            .Where(connection => excludedConnectionIds?.Contains(connection.ConnectionId) != true))
        {
            connection.Close(reason);
        }
    }

    public void CloseAllConnections(
        string hub,
        string reason,
        IReadOnlySet<string>? excludedConnectionIds = null)
    {
        CloseConnections(
            GetHubConnections(hub),
            reason,
            excludedConnectionIds);
    }

    public void CloseGroupConnections(
        string hub,
        string group,
        string reason,
        IReadOnlySet<string>? excludedConnectionIds = null)
    {
        CloseConnections(
            GetHubConnections(hub).Where(connection => connection.Groups.ContainsKey(group)),
            reason,
            excludedConnectionIds);
    }

    public GroupMemberPage ListConnectionsInGroup(
        string hub,
        string group,
        int maxPageSize,
        int? top,
        string? continuationToken)
    {
        var limit = Math.Min(maxPageSize, top ?? int.MaxValue);
        var candidates = GetHubConnections(hub)
            .Where(connection => connection.Groups.ContainsKey(group))
            .Where(connection => string.Compare(
                connection.ConnectionId,
                continuationToken,
                StringComparison.InvariantCulture) > 0)
            .OrderBy(connection => connection.ConnectionId, StringComparer.InvariantCulture)
            .Take(limit + 1)
            .ToArray();
        var members = candidates
            .Take(limit)
            .Select(connection => new GroupMember(connection.ConnectionId, connection.UserId))
            .ToArray();
        var hasMore = candidates.Length > limit && (!top.HasValue || top.Value > limit);
        return new GroupMemberPage(
            members,
            hasMore ? members[^1].ConnectionId : null,
            hasMore);
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

    public bool SendToConnection(string hub, string connectionId, MessageData data)
    {
        if (!TryGet(hub, connectionId, out var connection))
        {
            return false;
        }

        connection.SendServerData(data);
        return true;
    }

    public void SendToUser(string hub, string userId, MessageData data, string? filter = null)
    {
        foreach (var connection in GetUserConnections(hub, userId)
            .Where(connection => ODataFilterExecutor.Instance.Matches(filter, connection)))
        {
            connection.SendServerData(data);
        }
    }

    /// <summary>
    /// Fan-out is a sequence of non-blocking enqueues, so one slow or closed receiver can
    /// never fail the publisher or the other members of the group.
    /// </summary>
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

    private LogicalConnection[] GetUserConnections(string hub, string userId)
    {
        return GetHubConnections(hub)
            .Where(connection => string.Equals(connection.UserId, userId, StringComparison.Ordinal))
            .ToArray();
    }

    private static void CloseConnections(
        IEnumerable<LogicalConnection> connections,
        string reason,
        IReadOnlySet<string>? excludedConnectionIds)
    {
        foreach (var connection in connections
            .Where(connection => excludedConnectionIds?.Contains(connection.ConnectionId) != true)
            .ToArray())
        {
            connection.Close(reason);
        }
    }

    private void RemoveFromAllGroups(LogicalConnection connection)
    {
        lock (_groupStateLock)
        {
            foreach (var group in connection.Groups.Keys)
            {
                RemoveFromGroup(connection, group);
            }
        }
    }

    private bool IsActiveGroupMember(LogicalConnection connection, string group)
    {
        return IsActiveConnection(connection) &&
            connection.Groups.ContainsKey(group);
    }

    private bool IsActiveConnection(LogicalConnection connection)
    {
        return _connections.TryGetValue((connection.Hub, connection.ConnectionId), out var active) &&
            ReferenceEquals(active, connection);
    }

    private void ClearAllGroupState(LogicalConnection connection)
    {
        foreach (var group in connection.GroupStateStore.GetAllGroupsWithState())
        {
            ClearGroupState(connection, group);
        }
    }

    private void ClearGroupState(LogicalConnection connection, string group)
    {
        if (connection.GroupStateStore.GetState(group) is null)
        {
            return;
        }

        var updatedAt = connection.GroupStateStore.ClearState(group);
        PublishGroupStateUpdate(connection, group, state: null, updatedAt);
    }

    private void PublishGroupStateUpdate(
        LogicalConnection owner,
        string group,
        IReadOnlyDictionary<string, string>? state,
        long updatedAt)
    {
        var item = new GroupStateItem(owner.ConnectionId, owner.UserId, state, updatedAt);
        foreach (var connection in GetHubConnections(owner.Hub)
            .Where(connection => connection.Groups.ContainsKey(group))
            .Where(connection => connection.GroupStateSubscriptions.IsSubscribed(group)))
        {
            connection.SendGroupStateUpdate(group, item);
        }
    }

    private async Task ExpireAsync(LogicalConnection connection, long generation)
    {
        try
        {
            await Task.Delay(_runtimeOptions.ReconnectTimeout);
            if (connection.TryExpire(generation))
            {
                Remove(connection, "Connection recovery timed out.");
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

    private async Task NotifyDisconnectedAsync(LogicalConnection connection, string reason)
    {
        try
        {
            await _events.DispatchNotificationAsync(connection.CreateSystemEvent(
                "disconnected",
                new MessageData(
                    MessageDataType.Json,
                    System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new { reason }))));
        }
        catch (Exception exception)
        {
            _logger.LogWarning(
                exception,
                "Dispatching disconnected for connection {ConnectionId} failed.",
                connection.ConnectionId);
        }
    }
}
