// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class SimpleWebSocketPayloadProcessor : IClientPayloadProcessor
{
    private readonly ConnectionManager _connections;
    public SimpleWebSocketPayloadProcessor(ConnectionManager connections)
    {
        _connections = connections;
    }

    public ValueTask<PayloadProcessingResult> ProcessAsync(
        LogicalConnection connection,
        WebSocketMessageType messageType,
        byte[] payload,
        CancellationToken cancellationToken)
    {
        var sendToGroup = connection.RawSendToGroup;
        if (sendToGroup is null || !connection.CanSendToGroup(sendToGroup))
        {
            return ValueTask.FromResult(PayloadProcessingResult.Close(
                WebSocketCloseStatus.PolicyViolation,
                "The connection is not authorized for raw sendToGroup mode."));
        }

        var dataType = messageType == WebSocketMessageType.Binary
            ? MessageDataType.Binary
            : MessageDataType.Text;
        _connections.SendToGroup(
            connection.Hub,
            sendToGroup,
            new MessageData(dataType, payload),
            connection,
            noEcho: false);
        return ValueTask.FromResult(PayloadProcessingResult.Continue);
    }

    public WebSocketPayload EncodeGroupData(
        LogicalConnection connection,
        string group,
        string? fromUserId,
        MessageData data)
    {
        var messageType = data.Type == MessageDataType.Binary
            ? WebSocketMessageType.Binary
            : WebSocketMessageType.Text;
        return new WebSocketPayload(data.Bytes, messageType);
    }
}