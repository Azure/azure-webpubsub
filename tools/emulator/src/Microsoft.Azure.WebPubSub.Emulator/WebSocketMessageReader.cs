// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Buffers;
using System.Net.WebSockets;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class WebSocketMessageReader
{
    private const int FragmentBufferSize = 16 * 1024;

    public static async ValueTask<ReceivedWebSocketMessage> ReadAsync(
        WebSocket webSocket,
        int maxMessageSize,
        CancellationToken cancellationToken)
    {
        var fragment = ArrayPool<byte>.Shared.Rent(FragmentBufferSize);
        try
        {
            using var message = new MemoryStream();
            WebSocketMessageType? messageType = null;

            while (true)
            {
                var result = await webSocket.ReceiveAsync(
                    fragment.AsMemory(0, FragmentBufferSize),
                    cancellationToken);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return ReceivedWebSocketMessage.Close(
                        webSocket.CloseStatus,
                        webSocket.CloseStatusDescription);
                }

                messageType ??= result.MessageType;
                if (messageType != result.MessageType)
                {
                    throw new InvalidDataException("A fragmented WebSocket message changed its message type.");
                }

                if (message.Length + result.Count > maxMessageSize)
                {
                    throw new WebSocketException(
                        WebSocketError.HeaderError,
                        $"The WebSocket message exceeds the {maxMessageSize}-byte limit.");
                }

                message.Write(fragment, 0, result.Count);
                if (result.EndOfMessage)
                {
                    return ReceivedWebSocketMessage.Data(messageType.Value, message.ToArray());
                }
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(fragment);
        }
    }
}

internal sealed record ReceivedWebSocketMessage(
    WebSocketMessageType MessageType,
    byte[] Payload,
    WebSocketCloseStatus? CloseStatus,
    string? CloseStatusDescription)
{
    public bool IsClose => MessageType == WebSocketMessageType.Close;

    public static ReceivedWebSocketMessage Data(WebSocketMessageType messageType, byte[] payload)
    {
        return new ReceivedWebSocketMessage(messageType, payload, null, null);
    }

    public static ReceivedWebSocketMessage Close(
        WebSocketCloseStatus? closeStatus,
        string? closeStatusDescription)
    {
        return new ReceivedWebSocketMessage(
            WebSocketMessageType.Close,
            [],
            closeStatus,
            closeStatusDescription);
    }
}
