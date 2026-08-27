// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class ClientWebSocketEndpoint
{
    private const string AccessTokenQueryName = "access_token";

    private readonly ConnectionManager _connections;
    private readonly WebPubSubTokenService _tokenService;
    private readonly EmulatorRuntimeOptions _runtimeOptions;
    private readonly ILogger<ClientWebSocketEndpoint> _logger;

    public ClientWebSocketEndpoint(
        ConnectionManager connections,
        WebPubSubTokenService tokenService,
        EmulatorRuntimeOptions runtimeOptions,
        ILogger<ClientWebSocketEndpoint> logger)
    {
        _connections = connections;
        _tokenService = tokenService;
        _runtimeOptions = runtimeOptions;
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

        if (context.WebSockets.WebSocketRequestedProtocols.Count > 0)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("Raw WebSocket connections do not use a subprotocol.");
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

        if (user.FindAll("webpubsub.group")
            .Any(claim => !WebPubSubNameValidator.IsValidGroupName(claim.Value)))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("The token contains an invalid group name.");
            return;
        }

        var rawGroup = GetRawSendGroup(context);
        if (context.Request.Query.ContainsKey("webpubsub_mode") && rawGroup is null)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("Only raw sendToGroup mode is supported.");
            return;
        }
        if (rawGroup is not null && !WebPubSubNameValidator.IsValidGroupName(rawGroup))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("The raw sendToGroup group name is invalid.");
            return;
        }

        using var webSocket = await context.WebSockets.AcceptWebSocketAsync();
        var connection = _connections.Create(
            Guid.NewGuid().ToString("N"),
            hub,
            user);
        using var transport = connection.TryAttach(webSocket);
        if (transport is null || !_connections.TryActivate(connection))
        {
            await CloseAsync(webSocket, "The connection could not be activated.");
            return;
        }

        var canSend = rawGroup is not null && connection.CanSendToGroup(rawGroup);
        await RunReceiveLoopAsync(connection, transport, rawGroup, canSend, context.RequestAborted);
    }

    private async Task RunReceiveLoopAsync(
        LogicalConnection connection,
        SocketTransport transport,
        string? rawGroup,
        bool canSend,
        CancellationToken requestAborted)
    {
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
                if (rawGroup is null || !canSend)
                {
                    await transport.CloseAsync(
                        WebSocketCloseStatus.PolicyViolation,
                        "The connection is not authorized for raw sendToGroup mode.");
                    break;
                }

                _connections.SendToGroup(
                    connection.Hub,
                    rawGroup,
                    new RawMessage(message.MessageType, message.Payload));
            }
        }
        catch (OperationCanceledException) when (linkedCancellation.IsCancellationRequested)
        {
        }
        catch (WebSocketMessageTooLargeException exception)
        {
            _logger.LogDebug(
                exception,
                "WebSocket connection {ConnectionId} exceeded the message size limit.",
                connection.ConnectionId);
            await transport.CloseAsync(
                WebSocketCloseStatus.MessageTooBig,
                "The client message is too large.");
        }
        catch (InvalidDataException exception)
        {
            _logger.LogDebug(
                exception,
                "WebSocket connection {ConnectionId} received an invalid frame.",
                connection.ConnectionId);
            await transport.CloseAsync(
                WebSocketCloseStatus.ProtocolError,
                "The client frame is invalid.");
        }
        catch (Exception exception) when (
            exception is WebSocketException or ObjectDisposedException)
        {
            _logger.LogDebug(
                exception,
                "WebSocket connection {ConnectionId} ended.",
                connection.ConnectionId);
            transport.Abort();
        }
        finally
        {
            connection.Detach(transport);
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

    private static string? GetRawSendGroup(HttpContext context)
    {
        if (!string.Equals(
            context.Request.Query["webpubsub_mode"],
            "sendToGroup",
            StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var group = context.Request.Query["group"].ToString();
        return string.IsNullOrWhiteSpace(group) ? null : group;
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