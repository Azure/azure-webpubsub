// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal interface IWebPubSubClientDataProtocol
{
    string Name { get; }

    WebSocketMessageType MessageType { get; }

    WebPubSubClientRequest ParseMessage(byte[] payload);

    WebSocketPayload WriteConnected(
        LogicalConnection connection,
        string? reconnectionToken = null);

    WebSocketPayload WriteDisconnected(string message);

    WebSocketPayload WritePong();

    WebSocketPayload WriteAck(ulong ackId);

    WebSocketPayload WriteErrorAck(
        ulong ackId,
        WebPubSubAckErrorName errorName,
        string message);

    WebSocketPayload WriteGroupData(
        string group,
        string? fromUserId,
        MessageData data,
        ulong? sequenceId = null);

    WebSocketPayload WriteServerData(
        MessageData data,
        ulong? sequenceId = null);
}