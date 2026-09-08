// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class SimpleWebSocketPayloadProcessor : IClientPayloadProcessor
{
    private readonly ConnectionManager _connections;
    private readonly IWebPubSubConnectionLifetimeHandler? _lifetimeHandler;

    public SimpleWebSocketPayloadProcessor(
        ConnectionManager connections,
        IWebPubSubConnectionLifetimeHandler? lifetimeHandler = null)
    {
        _connections = connections;
        _lifetimeHandler = lifetimeHandler;
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
        var sendToGroup = connection.RawSendToGroup;
        if (sendToGroup is not null)
        {
            if (!connection.CanSendToGroup(sendToGroup))
            {
                return PayloadProcessingResult.Close(
                    WebSocketCloseStatus.PolicyViolation,
                    "The connection is not authorized for raw sendToGroup mode.");
            }

            var groupDataType = messageType == WebSocketMessageType.Binary
                ? MessageDataType.Binary
                : MessageDataType.Text;
            _connections.SendToGroup(
                connection.Hub,
                sendToGroup,
                new MessageData(groupDataType, payload),
                connection,
                noEcho: false);
            return PayloadProcessingResult.Continue;
        }

        var dataType = messageType == WebSocketMessageType.Binary
            ? MessageDataType.Binary
            : MessageDataType.Text;
        if (_lifetimeHandler is null)
        {
            return PayloadProcessingResult.Close(
                WebSocketCloseStatus.InternalServerError,
                "No event handler is configured.");
        }

        try
        {
            var result = await _lifetimeHandler.SendMessageAsync(
                connection,
                new ClientMessagePayload("message", new MessageData(dataType, payload)),
                cancellationToken);
            if (result.Response is not null)
            {
                connection.SendServerData(result.Response);
            }
            return PayloadProcessingResult.Continue;
        }
        catch (InvalidOperationException exception)
        {
            return PayloadProcessingResult.Close(
                WebSocketCloseStatus.InternalServerError,
                exception.Message);
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