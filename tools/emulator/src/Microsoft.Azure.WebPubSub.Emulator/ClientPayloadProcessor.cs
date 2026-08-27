// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal interface IClientPayloadProcessor
{
    ValueTask<PayloadProcessingResult> ProcessAsync(
        LogicalConnection connection,
        WebSocketMessageType messageType,
        byte[] payload,
        CancellationToken cancellationToken);

    WebSocketPayload EncodeGroupData(
        LogicalConnection connection,
        string group,
        string? fromUserId,
        MessageData data);
}

internal readonly record struct WebSocketPayload(
    ReadOnlyMemory<byte> Bytes,
    WebSocketMessageType MessageType);

internal readonly record struct PayloadProcessingResult(
    WebSocketCloseStatus? CloseStatus,
    string? CloseDescription)
{
    public static PayloadProcessingResult Continue => default;

    public static PayloadProcessingResult Close(
        WebSocketCloseStatus closeStatus,
        string closeDescription)
    {
        return new PayloadProcessingResult(closeStatus, closeDescription);
    }
}

internal sealed class ClientPayloadProcessorFactory
{
    private readonly SimpleWebSocketPayloadProcessor _defaultProcessor;

    public ClientPayloadProcessorFactory(SimpleWebSocketPayloadProcessor defaultProcessor)
    {
        _defaultProcessor = defaultProcessor;
    }

    public IClientPayloadProcessor Get(string? subprotocol)
    {
        return _defaultProcessor;
    }
}