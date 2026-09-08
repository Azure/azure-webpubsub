// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class ClientWebSocketEndpoint
{
    private const string AccessTokenQueryName = "access_token";
    private const string ConnectionIdQueryName = "awps_connection_id";
    private const string ReconnectionTokenQueryName = "awps_reconnection_token";

    private readonly ConnectionManager _connections;
    private readonly ClientPayloadProcessorFactory _payloadProcessorFactory;
    private readonly ClientConnectionHandler _connectionHandler;
    private readonly WebPubSubTokenService _tokenService;
    private readonly UpstreamEventDispatcher _events;
    private readonly ILogger<ClientWebSocketEndpoint> _logger;

    public ClientWebSocketEndpoint(
        ConnectionManager connections,
        ClientPayloadProcessorFactory payloadProcessorFactory,
        ClientConnectionHandler connectionHandler,
        WebPubSubTokenService tokenService,
        UpstreamEventDispatcher events,
        ILogger<ClientWebSocketEndpoint> logger)
    {
        _connections = connections;
        _payloadProcessorFactory = payloadProcessorFactory;
        _connectionHandler = connectionHandler;
        _tokenService = tokenService;
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

        var rawHub = context.Request.RouteValues["hub"]?.ToString();
        if (string.IsNullOrWhiteSpace(rawHub))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        var selectedSubprotocol = SelectSubprotocol(context);
        var reconnectConnectionId = context.Request.Query[ConnectionIdQueryName].ToString();
        if (!string.IsNullOrEmpty(reconnectConnectionId))
        {
            await HandleReconnectAsync(
                context,
                rawHub.ToLowerInvariant(),
                selectedSubprotocol,
                reconnectConnectionId,
                context.Request.Query[ReconnectionTokenQueryName].ToString());
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
            var endpoint = new Uri($"{context.Request.Scheme}://{context.Request.Host}");
            user = _tokenService.ValidateClientToken(endpoint, rawHub, accessToken);
        }
        catch (Exception exception) when (
            exception is SecurityTokenException or ArgumentException)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        if (user.FindAll("webpubsub.group")
            .Any(claim => !WebPubSubNameValidator.IsValidGroupName(claim.Value)))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("The token contains an invalid group name.");
            return;
        }

        string? rawSendToGroup = null;
        if (selectedSubprotocol is null &&
            !TryGetRawSendToGroup(context, out rawSendToGroup, out var error))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync(error);
            return;
        }

        var hub = rawHub.ToLowerInvariant();
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
            selectedSubprotocol,
            connectResult.Response,
            out user,
            out selectedSubprotocol,
            out var connectError))
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsync(connectError);
            return;
        }

        var connection = _connections.Create(
            connectionId,
            hub,
            user,
            rawSendToGroup,
            WebPubSubJsonV1PayloadProcessor.IsReliableSubprotocol(selectedSubprotocol),
            selectedSubprotocol,
            host: context.Request.Host.ToString());
        connection.ConnectionState = connectResult.ConnectionState;
        var processor = _payloadProcessorFactory.Get(selectedSubprotocol);

        using var webSocket = await context.WebSockets.AcceptWebSocketAsync(selectedSubprotocol);
        using var transport = connection.TryAttach(webSocket, processor);
        if (transport is null || !_connections.TryActivate(connection))
        {
            await CloseAsync(webSocket, "The connection could not be activated.");
            return;
        }

        try
        {
            await _connectionHandler.RunAsync(
                connection.ConnectionId,
                connection,
                transport,
                processor,
                context.RequestAborted,
                isInitialConnection: true);
        }
        finally
        {
            connection.Detach(transport);
        }
    }

    private async Task HandleReconnectAsync(
        HttpContext context,
        string hub,
        string? selectedSubprotocol,
        string connectionId,
        string reconnectionToken)
    {
        if (!_tokenService.ValidateReconnectionToken(connectionId, reconnectionToken) ||
            !_connections.TryGet(hub, connectionId, out var connection) ||
            !connection.IsReliable)
        {
            using var rejectedSocket = await context.WebSockets.AcceptWebSocketAsync(
                selectedSubprotocol);
            await CloseAsync(rejectedSocket, "The connection could not be recovered.");
            return;
        }

        var processor = _payloadProcessorFactory.Get(connection.Subprotocol);
        using var webSocket = await context.WebSockets.AcceptWebSocketAsync(connection.Subprotocol);
        SocketTransport? transport;
        try
        {
            transport = await connection.TryReconnectAsync(
                webSocket,
                processor,
                context.RequestAborted);
        }
        catch (TimeoutException exception)
        {
            _logger.LogDebug(
                exception,
                "Recovering connection {ConnectionId} timed out.",
                connectionId);
            webSocket.Abort();
            return;
        }

        using (transport)
        {
            if (transport is null)
            {
                await CloseAsync(webSocket, "The connection could not be recovered.");
                return;
            }

            try
            {
                await _connectionHandler.RunAsync(
                    connection.ConnectionId,
                    connection,
                    transport,
                    processor,
                    context.RequestAborted,
                    isInitialConnection: false);
            }
            finally
            {
                connection.Detach(transport);
            }
        }
    }

    private async Task CloseAsync(WebSocket webSocket, string reason)
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
            _logger.LogDebug(exception, "Closing a WebSocket request failed.");
        }
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

        return new UpstreamEvent(
            0,
            hub,
            "connect",
            UpstreamEventCategory.System,
            connectionId,
            user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier),
            null,
            null,
            new MessageData(MessageDataType.Json, body),
            context.Request.Host.ToString());
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
            if (!context.WebSockets.WebSocketRequestedProtocols.Contains(
                response.Subprotocol,
                StringComparer.Ordinal))
            {
                error = $"The connect event handler selected unrequested subprotocol '{response.Subprotocol}'.";
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

    private static bool TryGetRawSendToGroup(
        HttpContext context,
        out string? sendToGroup,
        out string error)
    {
        sendToGroup = null;
        error = string.Empty;
        if (!context.Request.Query.ContainsKey("webpubsub_mode"))
        {
            return true;
        }

        if (!string.Equals(
            context.Request.Query["webpubsub_mode"],
            "sendToGroup",
            StringComparison.OrdinalIgnoreCase))
        {
            error = "Only raw sendToGroup mode is supported.";
            return false;
        }

        var group = context.Request.Query["group"].ToString();
        if (!WebPubSubNameValidator.IsValidGroupName(group))
        {
            error = "The raw sendToGroup group name is invalid.";
            return false;
        }

        sendToGroup = group;
        return true;
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

    private static string? SelectSubprotocol(HttpContext context)
    {
        return context.WebSockets.WebSocketRequestedProtocols.FirstOrDefault(
            WebPubSubJsonV1PayloadProcessor.IsSupportedSubprotocol);
    }
}