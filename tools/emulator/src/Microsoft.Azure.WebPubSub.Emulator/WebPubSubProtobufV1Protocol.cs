// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;
using System.Text;
using Azure.Messaging.WebPubSub.Client.Protobuf;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using ProtoMessageData = Azure.Messaging.WebPubSub.Client.Protobuf.MessageData;
using static Azure.Messaging.WebPubSub.Client.Protobuf.DownstreamMessage.Types;
using static Azure.Messaging.WebPubSub.Client.Protobuf.DownstreamMessage.Types.SystemMessage.Types;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class WebPubSubProtobufV1Protocol : IWebPubSubClientDataProtocol
{
    public const string SubprotocolName = "protobuf.webpubsub.azure.v1";

    public string Name => SubprotocolName;

    public WebSocketMessageType MessageType => WebSocketMessageType.Binary;

    public WebPubSubClientRequest ParseMessage(byte[] payload)
    {
        try
        {
            var message = UpstreamMessage.Parser.ParseFrom(payload);
            if (message.SendToGroupMessage?.Stream is not null || message.EventMessage?.Stream is not null)
            {
                throw new InvalidDataException("Streaming requests are not supported.");
            }

            switch (message.MessageCase)
            {
                case UpstreamMessage.MessageOneofCase.JoinGroupMessage:
                    var join = message.JoinGroupMessage;
                    return new WebPubSubClientJoinGroupRequest(ValidateGroup(join.Group), join.HasAckId ? join.AckId : null);
                case UpstreamMessage.MessageOneofCase.LeaveGroupMessage:
                    var leave = message.LeaveGroupMessage;
                    return new WebPubSubClientLeaveGroupRequest(ValidateGroup(leave.Group), leave.HasAckId ? leave.AckId : null);
                case UpstreamMessage.MessageOneofCase.SendToGroupMessage:
                    var send = message.SendToGroupMessage!;
                    if (send.TtlSeconds > Constants.Message.MaxTtlSeconds)
                    {
                        throw new InvalidDataException($"'ttl_seconds' is out of range. Allowed range is [0,{Constants.Message.MaxTtlSeconds}].");
                    }
                    return new WebPubSubClientSendToGroupRequest(
                        ValidateGroup(send.Group), ReadData(send.Data, send.Metadata), send.NoEcho,
                        send.TtlSeconds, send.HasAckId ? send.AckId : null);
                case UpstreamMessage.MessageOneofCase.EventMessage:
                    var eventMessage = message.EventMessage!;
                    if (!WebPubSubNameValidator.IsValidEventName(eventMessage.Event))
                    {
                        throw new InvalidDataException("The event name is invalid.");
                    }
                    return new WebPubSubClientSendEventRequest(
                        eventMessage.Event, ReadData(eventMessage.Data, eventMessage.Metadata),
                        eventMessage.HasAckId ? eventMessage.AckId : null);
                case UpstreamMessage.MessageOneofCase.SequenceAckMessage:
                    return new WebPubSubClientSequenceAckRequest(message.SequenceAckMessage.SequenceId);
                case UpstreamMessage.MessageOneofCase.PingMessage:
                    return new WebPubSubClientPingRequest();
                default:
                    throw new InvalidDataException("Unsupported request message type.");
            }
        }
        catch (InvalidProtocolBufferException exception)
        {
            throw new InvalidDataException("Error reading protobuf.", exception);
        }
    }

    public WebSocketPayload WriteConnected(LogicalConnection connection, string? reconnectionToken = null)
    {
        var connected = new ConnectedMessage
        {
            ConnectionId = connection.ConnectionId ?? string.Empty,
            UserId = connection.UserId ?? string.Empty,
        };
        if (!string.IsNullOrEmpty(reconnectionToken))
        {
            connected.ReconnectionToken = reconnectionToken;
        }
        return WriteProtobuf(new DownstreamMessage { SystemMessage = new SystemMessage { ConnectedMessage = connected } });
    }

    public WebSocketPayload WriteDisconnected(string message) => WriteProtobuf(new DownstreamMessage
    {
        SystemMessage = new SystemMessage { DisconnectedMessage = new DisconnectedMessage { Reason = message ?? string.Empty } },
    });

    public WebSocketPayload WritePong() => WriteProtobuf(new DownstreamMessage { PongMessage = new PongMessage() });

    public WebSocketPayload WriteAck(ulong ackId) => WriteProtobuf(new DownstreamMessage
    {
        AckMessage = new AckMessage { AckId = ackId, Success = true },
    });

    public WebSocketPayload WriteErrorAck(ulong ackId, WebPubSubAckErrorName errorName, string message) =>
        WriteProtobuf(new DownstreamMessage
        {
            AckMessage = new AckMessage
            {
                AckId = ackId,
                Success = false,
                Error = new AckMessage.Types.ErrorMessage { Name = errorName.ToString(), Message = message ?? string.Empty },
            },
        });

    // Protobuf has no fromUserId field.
    public WebSocketPayload WriteGroupData(string group, string? fromUserId, MessageData data, ulong? sequenceId = null) =>
        WriteData("group", group, data, sequenceId);

    public WebSocketPayload WriteServerData(MessageData data, ulong? sequenceId = null) =>
        WriteData("server", null, data, sequenceId);

    private static MessageData ReadData(ProtoMessageData? data, IReadOnlyDictionary<string, string> metadata)
    {
        WebPubSubMetadataValidator.Validate(metadata);
        var copy = metadata.Count == 0 ? null : new Dictionary<string, string>(metadata, StringComparer.Ordinal);
        return data?.DataCase switch
        {
            null when metadata.Count > 0 => new(MessageDataType.Text, ReadOnlyMemory<byte>.Empty, copy),
            ProtoMessageData.DataOneofCase.TextData => new(MessageDataType.Text, Encoding.UTF8.GetBytes(data.TextData), copy),
            ProtoMessageData.DataOneofCase.BinaryData => new(MessageDataType.Binary, data.BinaryData.Memory, copy),
            ProtoMessageData.DataOneofCase.ProtobufData => new(MessageDataType.Protobuf, data.ProtobufData.ToByteArray(), copy),
            ProtoMessageData.DataOneofCase.JsonData => new(MessageDataType.Json, Encoding.UTF8.GetBytes(data.JsonData), copy),
            _ => throw new InvalidDataException("Missing MessageData: text_data, binary_data, protobuf_data or json_data is required."),
        };
    }

    private static WebSocketPayload WriteData(string from, string? group, MessageData data, ulong? sequenceId)
    {
        var message = new DataMessage
        {
            From = from,
            Data = data.Type switch
            {
                MessageDataType.Text => new ProtoMessageData { TextData = Encoding.UTF8.GetString(data.Bytes.Span) },
                MessageDataType.Binary => new ProtoMessageData { BinaryData = ByteString.CopyFrom(data.Bytes.Span) },
                MessageDataType.Protobuf => new ProtoMessageData { ProtobufData = Any.Parser.ParseFrom(data.Bytes.Span) },
                MessageDataType.Json => new ProtoMessageData { JsonData = Encoding.UTF8.GetString(data.Bytes.Span) },
                _ => throw new InvalidOperationException($"Unknown message data type '{data.Type}'."),
            },
        };
        if (group is not null)
        {
            message.Group = group;
        }
        if (sequenceId is not null)
        {
            message.SequenceId = sequenceId.Value;
        }
        if (data.Metadata is not null)
        {
            foreach (var item in data.Metadata)
            {
                message.Metadata[item.Key] = item.Value;
            }
        }
        return WriteProtobuf(new DownstreamMessage { DataMessage = message });
    }

    private static string ValidateGroup(string group)
    {
        if (!WebPubSubNameValidator.IsValidGroupName(group))
        {
            throw new InvalidDataException("The group name is invalid.");
        }
        return group;
    }

    private static WebSocketPayload WriteProtobuf(DownstreamMessage message) =>
        new(message.ToByteArray(), WebSocketMessageType.Binary);
}