// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class SimpleWebSocketPayloadProcessor : IClientPayloadProcessor
{
    private readonly ConnectionManager _connections;
    private readonly IWebPubSubConnectionLifetimeHandler _lifetimeHandler;
    private readonly ILogger<SimpleWebSocketPayloadProcessor> _logger;

    public SimpleWebSocketPayloadProcessor(
        ConnectionManager connections,
        IWebPubSubConnectionLifetimeHandler lifetimeHandler,
        ILogger<SimpleWebSocketPayloadProcessor> logger)
    {
        _connections = connections;
        _lifetimeHandler = lifetimeHandler;
        _logger = logger;
    }

    public void OnConnected(LogicalConnection connection)
    {
    }

    public async ValueTask<PayloadProcessingResult> ProcessAsync(
        LogicalConnection connection,
        WebSocketMessageType messageType,
        byte[] payload,
        CancellationToken cancellationToken)
    {
        var dataType = messageType == WebSocketMessageType.Binary
            ? MessageDataType.Binary
            : MessageDataType.Text;
        var data = new MessageData(dataType, payload);
        if (connection.SimpleWebSocketMode is { Mode: SimpleWebSocketMode.SendToGroup } mode)
        {
            if (mode.Group is null || !connection.CanSendToGroup(mode.Group))
            {
                return PayloadProcessingResult.Close(
                    WebSocketCloseStatus.PolicyViolation,
                    "The connection is not authorized for raw sendToGroup mode.");
            }
            _connections.SendToGroup(connection.Hub, mode.Group, data, connection, mode.NoEcho ?? false);
            return PayloadProcessingResult.Continue;
        }

        try
        {
            var result = await _lifetimeHandler.SendMessageAsync(
                connection, new ClientMessagePayload("message", data), cancellationToken);
            if (result.Response is not null)
            {
                connection.SendServerData(result.Response);
            }
            return PayloadProcessingResult.Continue;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Raw user event failed for connection {ConnectionId}.", connection.ConnectionId);
            return PayloadProcessingResult.Close(WebSocketCloseStatus.InternalServerError, "Internal server error");
        }
    }

    public WebSocketPayload EncodeGroupData(
        LogicalConnection connection,
        string group,
        string? fromUserId,
        MessageData data,
        ulong? sequenceId)
    {
        var messageType = data.Type == MessageDataType.Binary
            ? WebSocketMessageType.Binary
            : WebSocketMessageType.Text;
        return new WebSocketPayload(data.Bytes, messageType);
    }

    public WebSocketPayload EncodeServerData(
        LogicalConnection connection,
        MessageData data,
        ulong? sequenceId)
    {
        var messageType = data.Type == MessageDataType.Binary
            ? WebSocketMessageType.Binary
            : WebSocketMessageType.Text;
        return new WebSocketPayload(data.Bytes, messageType);
    }

    public WebSocketPayload? EncodeDisconnected(string message)
    {
        return null;
    }
}