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
    private readonly ClientPayloadProcessorFactory _payloadProcessorFactory;
    private readonly ClientConnectionHandler _connectionHandler;
    private readonly WebPubSubTokenService _tokenService;
    private readonly ILogger<ClientWebSocketEndpoint> _logger;

    public ClientWebSocketEndpoint(
        ConnectionManager connections,
        ClientPayloadProcessorFactory payloadProcessorFactory,
        ClientConnectionHandler connectionHandler,
        WebPubSubTokenService tokenService,
        ILogger<ClientWebSocketEndpoint> logger)
    {
        _connections = connections;
        _payloadProcessorFactory = payloadProcessorFactory;
        _connectionHandler = connectionHandler;
        _tokenService = tokenService;
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

        if (!TryGetRawSendToGroup(context, out var rawSendToGroup, out var error))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync(error);
            return;
        }

        string? selectedSubprotocol = null;
        var connection = _connections.Create(
            Guid.NewGuid().ToString("N"),
            hub,
            user,
            rawSendToGroup);
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
                context.RequestAborted);
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
}