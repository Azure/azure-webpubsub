// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Buffers;
using System.Collections.Generic;
using System.IO;
using Azure.Messaging.WebPubSub.Clients;
using Google.Protobuf;
using Xunit;

namespace Azure.Messaging.WebPubSub.Client.Protobuf.Tests;

public class WebPubSubProtobufNumericRangeTests
{
    [Theory]
    [InlineData(false, null)]
    [InlineData(false, 0L)]
    [InlineData(false, long.MaxValue)]
    [InlineData(true, null)]
    [InlineData(true, 0L)]
    [InlineData(true, long.MaxValue)]
    public void WriteUpstreamMessages_AckIds_PreserveRangeAndPresence(bool reliable, long? ackId)
    {
        var protocol = CreateProtocol(reliable);
        foreach (var message in CreateAckMessages(ackId))
        {
            var bytes = protocol.GetMessageBytes(message);
            var writer = new ArrayBufferWriter<byte>();
            protocol.WriteMessage(message, writer);
            Assert.Equal(bytes.ToArray(), writer.WrittenMemory.ToArray());

            var upstream = UpstreamMessage.Parser.ParseFrom(new ReadOnlySequence<byte>(bytes));
            var operation = (IMessage)UpstreamMessage.Descriptor.FindFieldByNumber((int)upstream.MessageCase).Accessor.GetValue(upstream);
            var field = operation.Descriptor.FindFieldByName("ack_id");
            Assert.Equal(ackId.HasValue, field.Accessor.HasValue(operation));
            Assert.Equal((ulong)ackId.GetValueOrDefault(), Assert.IsType<ulong>(field.Accessor.GetValue(operation)));
        }
    }

    [Theory]
    [InlineData(false, 0L)]
    [InlineData(false, long.MaxValue)]
    [InlineData(true, 0L)]
    [InlineData(true, long.MaxValue)]
    public void WriteUpstreamMessages_SequenceAck_PreservesRange(bool reliable, long sequenceId)
    {
        var protocol = CreateProtocol(reliable);
        var message = new SequenceAckMessage(sequenceId);
        var bytes = protocol.GetMessageBytes(message);
        var writer = new ArrayBufferWriter<byte>();
        protocol.WriteMessage(message, writer);
        Assert.Equal(bytes.ToArray(), writer.WrittenMemory.ToArray());

        var upstream = UpstreamMessage.Parser.ParseFrom(new ReadOnlySequence<byte>(bytes));
        Assert.Equal(UpstreamMessage.MessageOneofCase.SequenceAckMessage, upstream.MessageCase);
        Assert.Equal((ulong)sequenceId, upstream.SequenceAckMessage.SequenceId);
    }

    [Theory]
    [InlineData(false, -1L)]
    [InlineData(false, long.MinValue)]
    [InlineData(true, -1L)]
    [InlineData(true, long.MinValue)]
    public void WriteUpstreamMessages_NegativeIds_ThrowBeforeWriting(bool reliable, long id)
    {
        var protocol = CreateProtocol(reliable);
        var messages = new List<WebPubSubMessage>(CreateAckMessages(id)) { new SequenceAckMessage(id) };
        foreach (var message in messages)
        {
            var paramName = message is SequenceAckMessage ? "SequenceId" : "AckId";
            var exception = Assert.Throws<ArgumentOutOfRangeException>(paramName, () => protocol.GetMessageBytes(message));
            Assert.Equal(id, Assert.IsType<long>(exception.ActualValue));

            var writer = new ArrayBufferWriter<byte>();
            Assert.Throws<ArgumentOutOfRangeException>(paramName, () => protocol.WriteMessage(message, writer));
            Assert.Equal(0, writer.WrittenCount);
        }
    }

    [Theory]
    [InlineData(false, 0L)]
    [InlineData(false, long.MaxValue)]
    [InlineData(true, 0L)]
    [InlineData(true, long.MaxValue)]
    public void ParseDownstreamMessages_AckId_PreservesRange(bool reliable, long ackId)
    {
        var downstream = new DownstreamMessage
        {
            AckMessage = new DownstreamMessage.Types.AckMessage { AckId = (ulong)ackId, Success = true },
        };

        var messages = CreateProtocol(reliable).ParseMessage(new ReadOnlySequence<byte>(downstream.ToByteArray()));

        var ack = Assert.IsType<AckMessage>(Assert.Single(messages));
        Assert.Equal(ackId, ack.AckId);
        Assert.True(ack.Success);
    }

    [Theory]
    [InlineData(false, null)]
    [InlineData(false, 0L)]
    [InlineData(false, long.MaxValue)]
    [InlineData(true, null)]
    [InlineData(true, 0L)]
    [InlineData(true, long.MaxValue)]
    public void ParseDownstreamMessages_SequenceId_PreservesRangeAndPresence(bool reliable, long? sequenceId)
    {
        foreach (var from in new[] { "group", "server" })
        {
            var downstream = CreateDataMessage(from, sequenceId.HasValue ? (ulong)sequenceId.Value : null);
            var messages = CreateProtocol(reliable).ParseMessage(new ReadOnlySequence<byte>(downstream.ToByteArray()));

            if (from == "group")
            {
                Assert.Equal(sequenceId, Assert.IsType<GroupDataMessage>(Assert.Single(messages)).SequenceId);
            }
            else
            {
                Assert.Equal(sequenceId, Assert.IsType<ServerDataMessage>(Assert.Single(messages)).SequenceId);
            }
        }
    }

    [Theory]
    [InlineData(false, 0x8000000000000000UL)]
    [InlineData(false, ulong.MaxValue)]
    [InlineData(true, 0x8000000000000000UL)]
    [InlineData(true, ulong.MaxValue)]
    public void ParseDownstreamMessages_IdsAboveLongMaxValue_ThrowInvalidData(bool reliable, ulong id)
    {
        var protocol = CreateProtocol(reliable);
        var ack = new DownstreamMessage
        {
            AckMessage = new DownstreamMessage.Types.AckMessage { AckId = id, Success = true },
        };
        var exception = Assert.Throws<InvalidDataException>(() => protocol.ParseMessage(new ReadOnlySequence<byte>(ack.ToByteArray())));
        Assert.Contains("ack_id", exception.Message);

        foreach (var from in new[] { "group", "server" })
        {
            var data = CreateDataMessage(from, id);
            exception = Assert.Throws<InvalidDataException>(() => protocol.ParseMessage(new ReadOnlySequence<byte>(data.ToByteArray())));
            Assert.Contains("sequence_id", exception.Message);
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void WriteUpstreamMessages_JsonData_KeepsLegacyTextEncoding(bool reliable)
    {
        var protocol = CreateProtocol(reliable);
        var data = BinaryData.FromString("{\"value\":\"text\"}");
        var group = UpstreamMessage.Parser.ParseFrom(new ReadOnlySequence<byte>(protocol.GetMessageBytes(
            new SendToGroupMessage("group", data, WebPubSubDataType.Json, noEcho: true, ackId: null))));
        var eventMessage = UpstreamMessage.Parser.ParseFrom(new ReadOnlySequence<byte>(protocol.GetMessageBytes(
            new SendEventMessage("event", data, WebPubSubDataType.Json, null))));

        Assert.True(group.SendToGroupMessage.NoEcho);
        foreach (var payload in new[] { group.SendToGroupMessage.Data, eventMessage.EventMessage.Data })
        {
            Assert.Equal(MessageData.DataOneofCase.TextData, payload.DataCase);
            Assert.Equal(data.ToString(), payload.TextData);
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ParseDownstreamMessages_NewSchemaCases_RemainUnsupported(bool reliable)
    {
        foreach (var field in DownstreamMessage.Descriptor.Fields.InFieldNumberOrder())
        {
            if (field.FieldNumber <= 3)
            {
                continue;
            }

            var downstream = new DownstreamMessage();
            field.Accessor.SetValue(downstream, field.MessageType.Parser.ParseFrom(Array.Empty<byte>()));
            Assert.Throws<InvalidDataException>(() => CreateProtocol(reliable).ParseMessage(new ReadOnlySequence<byte>(downstream.ToByteArray())));
        }
    }

    private static WebPubSubProtocol CreateProtocol(bool reliable)
    {
        return reliable ? new WebPubSubProtobufReliableProtocol() : new WebPubSubProtobufProtocol();
    }

    private static IEnumerable<WebPubSubMessage> CreateAckMessages(long? ackId)
    {
        yield return new JoinGroupMessage("group", ackId);
        yield return new LeaveGroupMessage("group", ackId);
        yield return new SendToGroupMessage("group", BinaryData.FromString("text"), WebPubSubDataType.Text, noEcho: false, ackId: ackId);
        yield return new SendEventMessage("event", BinaryData.FromString("text"), WebPubSubDataType.Text, ackId);
    }

    private static DownstreamMessage CreateDataMessage(string from, ulong? sequenceId)
    {
        var data = new DownstreamMessage.Types.DataMessage
        {
            From = from,
            Group = "group",
            Data = new MessageData { TextData = "text" },
        };
        if (sequenceId.HasValue)
        {
            data.SequenceId = sequenceId.Value;
        }

        return new DownstreamMessage { DataMessage = data };
    }
}