// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Net.WebSockets;
using System.Security.Claims;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class ConnectionManager
{
    private readonly ConcurrentDictionary<(string Hub, string ConnectionId), LogicalConnection> _connections = [];
    private readonly EmulatorRuntimeOptions _runtimeOptions;
    private readonly ILogger<ConnectionManager> _logger;

    public ConnectionManager(
        EmulatorRuntimeOptions runtimeOptions,
        ILogger<ConnectionManager> logger)
    {
        _runtimeOptions = runtimeOptions;
        _logger = logger;
    }

    public LogicalConnection Create(
        string connectionId,
        string hub,
        ClaimsPrincipal user,
        string? rawSendToGroup = null,
        bool reliable = false,
        string? subprotocol = null)
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

    public void SendToConnection(string hub, string connectionId, MessageData data)
    {
        if (_connections.TryGetValue((hub, connectionId), out var connection))
        {
            connection.SendServerData(data);
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

    public void Remove(LogicalConnection connection)
    {
        _connections.TryRemove((connection.Hub, connection.ConnectionId), out _);
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
        bool noEcho)
    {
        foreach (var connection in _connections
            .Where(item => string.Equals(item.Key.Hub, hub, StringComparison.Ordinal))
            .Select(item => item.Value)
            .Where(connection => connection.Groups.ContainsKey(group))
            .Where(connection => !noEcho || connection != sender))
        {
            connection.SendGroupData(group, sender?.UserId, data);
        }
    }

    private async Task ExpireAsync(LogicalConnection connection, long generation)
    {
        try
        {
            await Task.Delay(_runtimeOptions.ReconnectTimeout);
            if (connection.TryExpire(generation))
            {
                Remove(connection);
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