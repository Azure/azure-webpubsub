// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal interface IClientPayloadProcessor
{
    void OnConnected(LogicalConnection connection);

    ValueTask<PayloadProcessingResult> ProcessAsync(
        LogicalConnection connection,
        WebSocketMessageType messageType,
        byte[] payload,
        CancellationToken cancellationToken);

    WebSocketPayload EncodeGroupData(
        LogicalConnection connection,
        string group,
        string? fromUserId,
        MessageData data,
        ulong? sequenceId);
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
    private readonly WebPubSubJsonV1PayloadProcessor _jsonV1Processor;

    public ClientPayloadProcessorFactory(
        SimpleWebSocketPayloadProcessor defaultProcessor,
        WebPubSubJsonV1PayloadProcessor jsonV1Processor)
    {
        _defaultProcessor = defaultProcessor;
        _jsonV1Processor = jsonV1Processor;
    }

    public IClientPayloadProcessor Get(string? subprotocol)
    {
        return WebPubSubJsonV1PayloadProcessor.IsSupportedSubprotocol(subprotocol)
            ? _jsonV1Processor
            : _defaultProcessor;
    }
}