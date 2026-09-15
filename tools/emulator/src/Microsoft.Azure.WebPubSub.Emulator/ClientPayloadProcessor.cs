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

    WebSocketPayload EncodeServerData(
        LogicalConnection connection,
        MessageData data,
        ulong? sequenceId);

    WebSocketPayload? EncodeDisconnected(string message)
    {
        return null;
    }
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
    private readonly WebPubSubProtobufV1PayloadProcessor _protobufV1Processor;

    public ClientPayloadProcessorFactory(
        SimpleWebSocketPayloadProcessor defaultProcessor,
        WebPubSubJsonV1PayloadProcessor jsonV1Processor,
        WebPubSubProtobufV1PayloadProcessor protobufV1Processor)
    {
        _defaultProcessor = defaultProcessor;
        _jsonV1Processor = jsonV1Processor;
        _protobufV1Processor = protobufV1Processor;
    }

    public IClientPayloadProcessor Get(string? subprotocol)
    {
        if (WebPubSubProtobufV1PayloadProcessor.IsSupportedSubprotocol(subprotocol))
        {
            return _protobufV1Processor;
        }

        return WebPubSubJsonV1PayloadProcessor.IsSupportedSubprotocol(subprotocol)
            ? _jsonV1Processor
            : _defaultProcessor;
    }

    public static bool IsSupportedSubprotocol(string? subprotocol)
    {
        return WebPubSubJsonV1PayloadProcessor.IsSupportedSubprotocol(subprotocol) ||
            WebPubSubProtobufV1PayloadProcessor.IsSupportedSubprotocol(subprotocol);
    }
}