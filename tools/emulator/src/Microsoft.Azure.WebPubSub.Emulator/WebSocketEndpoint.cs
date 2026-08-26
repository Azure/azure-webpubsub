// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class WebSocketEndpoint
{
    private const string AccessTokenQueryName = "access_token";
    private const string ConnectionIdQueryName = "awps_connection_id";
    private const string ReconnectionTokenQueryName = "awps_reconnection_token";

    private readonly ConnectionManager _connections;
    private readonly WebPubSubTokenService _tokenService;
    private readonly EmulatorRuntimeOptions _runtimeOptions;
    private readonly UpstreamEventDispatcher _events;
    private readonly ILogger<WebSocketEndpoint> _logger;

    public WebSocketEndpoint(
        ConnectionManager connections,
        WebPubSubTokenService tokenService,
        EmulatorRuntimeOptions runtimeOptions,
        UpstreamEventDispatcher events,
        ILogger<WebSocketEndpoint> logger)
    {
        _connections = connections;
        _tokenService = tokenService;
        _runtimeOptions = runtimeOptions;
        _events = events;
        _logger = logger;
    }

    public async Task HandleAsync(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        var hub = context.Request.RouteValues["hub"]?.ToString();
        if (string.IsNullOrWhiteSpace(hub))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        var subprotocol = SelectSubprotocol(context);
        if (context.WebSockets.WebSocketRequestedProtocols.Count > 0 && subprotocol is null)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("No supported Web PubSub subprotocol was requested.");
            return;
        }

        var reconnectConnectionId = context.Request.Query[ConnectionIdQueryName].ToString();
        if (!string.IsNullOrEmpty(reconnectConnectionId))
        {
            await HandleReconnectAsync(context, hub, subprotocol, reconnectConnectionId);
            return;
        }

        var accessToken = GetAccessToken(context);
        if (string.IsNullOrEmpty(accessToken))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        ClaimsPrincipal user;
        try
        {
            user = _tokenService.ValidateClientToken(hub, accessToken);
        }
        catch (Exception exception) when (
            exception is SecurityTokenException or ArgumentException)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var connectionId = Guid.NewGuid().ToString("N");
        var connectResult = await _events.DispatchConnectAsync(
            CreateConnectEvent(context, hub, connectionId, user),
            context.RequestAborted);
        if (!connectResult.Succeeded)
        {
            context.Response.StatusCode = (int)connectResult.StatusCode;
            if (connectResult.Error is not null)
            {
                await context.Response.WriteAsync(connectResult.Error);
            }
            return;
        }

        if (!TryApplyConnectResponse(
            context,
            user,
            subprotocol,
            connectResult.Response,
            out user,
            out subprotocol,
            out var error))
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsync(error);
            return;
        }

        using var webSocket = await context.WebSockets.AcceptWebSocketAsync(subprotocol);
        var connection = _connections.Create(
            connectionId,
            hub,
            subprotocol,
            user,
            context.Request.Host.Value ?? "localhost",
            connectResult.ConnectionState);
        using var transport = connection.TryAttach(webSocket, replay: false);
        if (transport is null)
        {
            await CloseUnrecoverableAsync(webSocket, "The connection is no longer available.");
            return;
        }

        if (!connection.IsRaw)
        {
            connection.SendConnected();
        }

        _ = _events.DispatchNotificationAsync(
            connection.CreateSystemEvent(
                "connected",
                new MessageData(MessageDataType.Json, "{}"u8.ToArray())),
            context.RequestAborted);

        await RunReceiveLoopAsync(connection, transport, context.RequestAborted);
    }

    private async Task HandleReconnectAsync(
        HttpContext context,
        string hub,
        string? subprotocol,
        string connectionId)
    {
        // A failed recovery must be a WebSocket closure with 1008 so the SDK stops
        // recovering and opens a new connection. See protocols/client/client-spec.md.
        var token = context.Request.Query[ReconnectionTokenQueryName].ToString();
        LogicalConnection? connection = null;
        var recoverable = subprotocol == WebPubSubJsonProtocol.ReliableJsonSubprotocol &&
            !string.IsNullOrEmpty(token) &&
            _connections.TryGet(hub, connectionId, out connection) &&
            connection.Subprotocol == subprotocol &&
            _tokenService.ValidateReconnectionToken(connectionId, token);

        using var webSocket = await context.WebSockets.AcceptWebSocketAsync(subprotocol);
        var transport = recoverable ? connection!.TryAttach(webSocket, replay: true) : null;
        if (transport is null)
        {
            await CloseUnrecoverableAsync(webSocket, "The connection can no longer be recovered.");
            return;
        }

        using (transport)
        {
            await RunReceiveLoopAsync(connection!, transport, context.RequestAborted);
        }
    }

    private async Task CloseUnrecoverableAsync(WebSocket webSocket, string reason)
    {
        try
        {
            await webSocket.CloseOutputAsync(
                WebSocketCloseStatus.PolicyViolation,
                reason,
                CancellationToken.None);
        }
        catch (Exception exception) when (
            exception is WebSocketException or OperationCanceledException or ObjectDisposedException)
        {
            _logger.LogDebug(exception, "Closing an unrecoverable WebSocket request failed.");
        }
    }

    private async Task RunReceiveLoopAsync(
        LogicalConnection connection,
        SocketTransport transport,
        CancellationToken requestAborted)
    {
        var recoverable = true;
        var detachReason = "The connection ended.";
        using var linkedCancellation = CancellationTokenSource.CreateLinkedTokenSource(
            requestAborted,
            transport.Aborted);
        try
        {
            while (!linkedCancellation.IsCancellationRequested)
            {
                var message = await WebSocketMessageReader.ReadAsync(
                    transport.WebSocket,
                    _runtimeOptions.MaxMessageSizeBytes,
                    linkedCancellation.Token);

                if (message.IsClose)
                {
                    if (message.CloseStatus == WebSocketCloseStatus.NormalClosure)
                    {
                        recoverable = false;
                        detachReason = "The client closed the connection.";
                    }
                    if (transport.WebSocket.State == WebSocketState.CloseReceived)
                    {
                        await transport.CloseAsync(
                            message.CloseStatus ?? WebSocketCloseStatus.NormalClosure,
                            message.CloseStatusDescription ?? string.Empty);
                    }
                    break;
                }

                if (transport.IsClosing)
                {
                    continue;
                }

                if (connection.IsRaw)
                {
                    var dataType = message.MessageType == WebSocketMessageType.Binary
                        ? MessageDataType.Binary
                        : MessageDataType.Text;
                    var result = await _events.DispatchUserEventAsync(
                        connection.CreateUserEvent(
                            "message",
                            new MessageData(dataType, message.Payload.ToArray())),
                        linkedCancellation.Token);
                    connection.SetConnectionState(result.ConnectionState);
                    if (result.Succeeded)
                    {
                        if (result.Response is not null)
                        {
                            connection.SendServerData(result.Response);
                        }
                        continue;
                    }

                    var rejectReason = result.Error ?? "Dispatching the message event failed.";
                    await transport.CloseAsync(
                        WebSocketCloseStatus.InternalServerError,
                        rejectReason);
                    recoverable = false;
                    detachReason = rejectReason;
                    break;
                }

                if (message.MessageType != WebSocketMessageType.Text)
                {
                    const string invalidTypeReason = "The JSON subprotocol only accepts text messages.";
                    await transport.CloseAsync(
                        WebSocketCloseStatus.InvalidMessageType,
                        invalidTypeReason);
                    recoverable = false;
                    detachReason = invalidTypeReason;
                    break;
                }

                var closeReason = await ProcessMessageAsync(
                    connection,
                    WebPubSubJsonProtocol.Parse(message.Payload),
                    linkedCancellation.Token);
                if (closeReason is not null)
                {
                    await transport.CloseAsync(
                        WebSocketCloseStatus.InternalServerError,
                        closeReason);
                    recoverable = false;
                    detachReason = closeReason;
                    break;
                }
            }
        }
        catch (OperationCanceledException) when (linkedCancellation.IsCancellationRequested)
        {
        }
        catch (Exception exception) when (
            exception is WebSocketException or InvalidDataException or JsonException
                or ObjectDisposedException)
        {
            _logger.LogDebug(
                exception,
                "WebSocket transport {Generation} for connection {ConnectionId} ended.",
                transport.Generation,
                connection.ConnectionId);
            transport.Abort();
        }
        finally
        {
            connection.Detach(transport.Generation, recoverable, detachReason);
        }
    }

    private async Task<string?> ProcessMessageAsync(
        LogicalConnection connection,
        ClientMessage message,
        CancellationToken cancellationToken)
    {
        var ackId = message switch
        {
            JoinGroupMessage join => join.AckId,
            LeaveGroupMessage leave => leave.AckId,
            SendToGroupMessage send => send.AckId,
            EventMessage clientEvent => clientEvent.AckId,
            _ => null,
        };
        if (ackId.HasValue && !connection.TryAddAckId(ackId.Value))
        {
            connection.SendErrorAck(
                ackId.Value,
                "Duplicate",
                $"The ackId '{ackId.Value}' has already been used by this connection.");
            return null;
        }

        switch (message)
        {
            case JoinGroupMessage join:
                if (!connection.CanJoinOrLeave(join.Group))
                {
                    SendForbiddenAck(connection, join.AckId, "join", join.Group);
                    return null;
                }
                _connections.AddToGroup(connection, join.Group);
                SendAck(connection, join.AckId);
                break;
            case LeaveGroupMessage leave:
                if (!connection.CanJoinOrLeave(leave.Group))
                {
                    SendForbiddenAck(connection, leave.AckId, "leave", leave.Group);
                    return null;
                }
                _connections.RemoveFromGroup(connection, leave.Group);
                SendAck(connection, leave.AckId);
                break;
            case SendToGroupMessage send:
                if (!connection.CanSendToGroup(send.Group))
                {
                    SendForbiddenAck(connection, send.AckId, "send to", send.Group);
                    return null;
                }
                _connections.SendToGroup(
                    connection.Hub,
                    send.Group,
                    send.Data,
                    connection,
                    send.NoEcho);
                SendAck(connection, send.AckId);
                break;
            case SequenceAckMessage sequenceAck:
                connection.Acknowledge(sequenceAck.SequenceId);
                break;
            case PingMessage:
                connection.SendPong();
                break;
            case EventMessage clientEvent:
                var result = await _events.DispatchUserEventAsync(
                    connection.CreateUserEvent(clientEvent.Event, clientEvent.Data),
                    cancellationToken);
                connection.SetConnectionState(result.ConnectionState);
                if (result.Succeeded)
                {
                    if (result.Response is not null)
                    {
                        connection.SendServerData(result.Response);
                    }
                    SendAck(connection, clientEvent.AckId);
                }
                else if (clientEvent.AckId.HasValue)
                {
                    connection.SendErrorAck(
                        clientEvent.AckId.Value,
                        "InternalServerError",
                        result.Error ?? "Dispatching the event failed.");
                }
                break;
        }

        return null;
    }

    private static UpstreamEvent CreateConnectEvent(
        HttpContext context,
        string hub,
        string connectionId,
        ClaimsPrincipal user)
    {
        var claims = user.Claims
            .GroupBy(claim => claim.Type, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.Select(claim => claim.Value).ToArray(),
                StringComparer.Ordinal);
        var query = context.Request.Query
            .Where(item => !string.Equals(item.Key, AccessTokenQueryName, StringComparison.OrdinalIgnoreCase))
            .ToDictionary(item => item.Key, item => item.Value.ToArray(), StringComparer.OrdinalIgnoreCase);
        var headers = context.Request.Headers
            .Where(item => !string.Equals(item.Key, "Authorization", StringComparison.OrdinalIgnoreCase))
            .ToDictionary(item => item.Key, item => item.Value.ToArray(), StringComparer.OrdinalIgnoreCase);
        var body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            claims,
            query,
            headers,
            subprotocols = context.WebSockets.WebSocketRequestedProtocols,
            clientCertificates = Array.Empty<object>(),
        });

        return new(
            0,
            hub,
            "connect",
            UpstreamEventCategory.System,
            connectionId,
            user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier),
            null,
            null,
            new MessageData(MessageDataType.Json, body),
            context.Request.Host.Value ?? "localhost");
    }

    private static bool TryApplyConnectResponse(
        HttpContext context,
        ClaimsPrincipal user,
        string? selectedSubprotocol,
        ConnectEventResponse? response,
        out ClaimsPrincipal resultUser,
        out string? resultSubprotocol,
        out string error)
    {
        resultUser = user;
        resultSubprotocol = selectedSubprotocol;
        error = string.Empty;
        if (response is null)
        {
            return true;
        }

        if (response.Subprotocol is not null)
        {
            if (!context.WebSockets.WebSocketRequestedProtocols.Contains(response.Subprotocol, StringComparer.Ordinal) ||
                response.Subprotocol is not (WebPubSubJsonProtocol.JsonSubprotocol or WebPubSubJsonProtocol.ReliableJsonSubprotocol))
            {
                error = $"The connect event handler selected unsupported subprotocol '{response.Subprotocol}'.";
                return false;
            }
            resultSubprotocol = response.Subprotocol;
        }

        var claims = user.Claims.ToList();
        if (response.UserId is not null)
        {
            claims.RemoveAll(claim => claim.Type is "sub" || claim.Type == ClaimTypes.NameIdentifier);
            claims.Add(new Claim("sub", response.UserId));
        }
        if (response.Roles is not null)
        {
            claims.RemoveAll(claim => claim.Type is "role" || claim.Type == ClaimTypes.Role);
            claims.AddRange(response.Roles.Select(role => new Claim("role", role)));
        }
        if (response.Groups?.Length > 0)
        {
            claims.RemoveAll(claim => claim.Type == "webpubsub.group");
            claims.AddRange(response.Groups.Select(group => new Claim("webpubsub.group", group)));
        }
        resultUser = new ClaimsPrincipal(new ClaimsIdentity(claims, user.Identity?.AuthenticationType));
        return true;
    }

    private static void SendAck(LogicalConnection connection, ulong? ackId)
    {
        if (ackId.HasValue)
        {
            connection.SendAck(ackId.Value);
        }
    }

    private static void SendForbiddenAck(
        LogicalConnection connection,
        ulong? ackId,
        string action,
        string group)
    {
        if (ackId.HasValue)
        {
            connection.SendErrorAck(
                ackId.Value,
                "Forbidden",
                $"The connection is not authorized to {action} group '{group}'.");
        }
    }

    private static string? SelectSubprotocol(HttpContext context)
    {
        var requested = context.WebSockets.WebSocketRequestedProtocols;
        if (requested.Contains(WebPubSubJsonProtocol.ReliableJsonSubprotocol, StringComparer.Ordinal))
        {
            return WebPubSubJsonProtocol.ReliableJsonSubprotocol;
        }

        if (requested.Contains(WebPubSubJsonProtocol.JsonSubprotocol, StringComparer.Ordinal))
        {
            return WebPubSubJsonProtocol.JsonSubprotocol;
        }

        return null;
    }

    private static string? GetAccessToken(HttpContext context)
    {
        var queryToken = context.Request.Query[AccessTokenQueryName].ToString();
        if (!string.IsNullOrEmpty(queryToken))
        {
            return queryToken;
        }

        var authorization = context.Request.Headers.Authorization.ToString();
        const string bearerPrefix = "Bearer ";
        return authorization.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase)
            ? authorization[bearerPrefix.Length..].Trim()
            : null;
    }
}
