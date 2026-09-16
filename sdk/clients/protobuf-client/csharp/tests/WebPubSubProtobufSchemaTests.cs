// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Linq;
using Google.Protobuf;
using Google.Protobuf.Collections;
using Google.Protobuf.Reflection;
using Google.Protobuf.WellKnownTypes;
using Xunit;

namespace Azure.Messaging.WebPubSub.Client.Protobuf.Tests;

public class WebPubSubProtobufSchemaTests
{
    [Fact]
    public void Descriptor_UsesCanonicalFileNamespaceAndAnyImport()
    {
        var descriptor = WebpubsubV1Reflection.Descriptor;
        Assert.Equal("webpubsub.v1.proto", descriptor.Name);
        Assert.Equal("azure.webpubsub", descriptor.Package);
        Assert.Equal("Azure.Messaging.WebPubSub.Client.Protobuf", descriptor.GetOptions().CsharpNamespace);
        Assert.Same(Any.Descriptor.File, Assert.Single(descriptor.Dependencies));
        Assert.All(descriptor.MessageTypes.SelectMany(GetMessages), message =>
            Assert.Equal("Azure.Messaging.WebPubSub.Client.Protobuf", message.ClrType.Namespace));

        var data = new MessageData { ProtobufData = Any.Pack(new StringValue { Value = "payload" }) };
        Assert.Equal("payload", MessageData.Parser.ParseFrom(data.ToByteArray()).ProtobufData.Unpack<StringValue>().Value);
    }

    [Theory]
    [InlineData("UpstreamMessage", "send_to_group_message", 1, "UpstreamMessage.SendToGroupMessage")]
    [InlineData("UpstreamMessage", "event_message", 5, "UpstreamMessage.EventMessage")]
    [InlineData("UpstreamMessage", "join_group_message", 6, "UpstreamMessage.JoinGroupMessage")]
    [InlineData("UpstreamMessage", "leave_group_message", 7, "UpstreamMessage.LeaveGroupMessage")]
    [InlineData("UpstreamMessage", "sequence_ack_message", 8, "UpstreamMessage.SequenceAckMessage")]
    [InlineData("UpstreamMessage", "ping_message", 9, "UpstreamMessage.PingMessage")]
    [InlineData("UpstreamMessage", "invoke_event_message", 10, "UpstreamMessage.InvokeEventMessage")]
    [InlineData("UpstreamMessage", "cancel_invocation_message", 11, "UpstreamMessage.CancelInvocationMessage")]
    [InlineData("UpstreamMessage", "stream_data_message", 13, "UpstreamMessage.StreamDataMessage")]
    [InlineData("UpstreamMessage", "stream_end_message", 14, "UpstreamMessage.StreamEndMessage")]
    [InlineData("UpstreamMessage", "set_group_state_message", 15, "UpstreamMessage.SetGroupStateMessage")]
    [InlineData("UpstreamMessage", "subscribe_group_state_message", 16, "UpstreamMessage.SubscribeGroupStateMessage")]
    [InlineData("UpstreamMessage", "unsubscribe_group_state_message", 17, "UpstreamMessage.UnsubscribeGroupStateMessage")]
    [InlineData("DownstreamMessage", "ack_message", 1, "DownstreamMessage.AckMessage")]
    [InlineData("DownstreamMessage", "data_message", 2, "DownstreamMessage.DataMessage")]
    [InlineData("DownstreamMessage", "system_message", 3, "DownstreamMessage.SystemMessage")]
    [InlineData("DownstreamMessage", "pong_message", 4, "DownstreamMessage.PongMessage")]
    [InlineData("DownstreamMessage", "invoke_response_message", 5, "DownstreamMessage.InvokeResponseMessage")]
    [InlineData("DownstreamMessage", "stream_ack_message", 6, "DownstreamMessage.StreamAckMessage")]
    [InlineData("DownstreamMessage", "stream_nack_message", 7, "DownstreamMessage.StreamNackMessage")]
    [InlineData("DownstreamMessage", "stream_closed_message", 8, "DownstreamMessage.StreamClosedMessage")]
    [InlineData("DownstreamMessage", "group_state_update_message", 9, "DownstreamMessage.GroupStateUpdateMessage")]
    [InlineData("DownstreamMessage", "group_state_snapshot_message", 10, "DownstreamMessage.GroupStateSnapshotMessage")]
    public void EnvelopeFields_HaveExpectedTagsAndMessageTypes(string owner, string name, int tag, string messageType)
    {
        var field = AssertField(owner, name, tag, FieldType.Message);
        Assert.Equal("message", field.RealContainingOneof.Name);
        Assert.Equal("azure.webpubsub." + messageType, field.MessageType.FullName);
        Assert.Equal(field.MessageType.ClrType, field.ContainingType.ClrType.GetProperty(field.PropertyName)!.PropertyType);
        AssertRoundTrip(field, field.MessageType.Parser.ParseFrom(Array.Empty<byte>()));
    }

    [Theory]
    [InlineData("UpstreamMessage.SendToGroupMessage", "ack_id", 2, FieldType.UInt64, true)]
    [InlineData("UpstreamMessage.SendToGroupMessage", "no_echo", 4, FieldType.Bool, true)]
    [InlineData("UpstreamMessage.SendToGroupMessage", "ttl_seconds", 5, FieldType.UInt32, true)]
    [InlineData("UpstreamMessage.EventMessage", "ack_id", 3, FieldType.UInt64, true)]
    [InlineData("UpstreamMessage.JoinGroupMessage", "ack_id", 2, FieldType.UInt64, true)]
    [InlineData("UpstreamMessage.LeaveGroupMessage", "ack_id", 2, FieldType.UInt64, true)]
    [InlineData("UpstreamMessage.SequenceAckMessage", "sequence_id", 1, FieldType.UInt64, false)]
    [InlineData("UpstreamMessage.InvokeEventMessage", "event", 1, FieldType.String, false)]
    [InlineData("UpstreamMessage.InvokeEventMessage", "invocation_id", 2, FieldType.String, false)]
    [InlineData("UpstreamMessage.CancelInvocationMessage", "invocation_id", 1, FieldType.String, false)]
    [InlineData("UpstreamMessage.StreamStartInfo", "stream_id", 1, FieldType.String, false)]
    [InlineData("UpstreamMessage.StreamStartInfo", "idle_timeout_ms", 2, FieldType.UInt32, true)]
    [InlineData("UpstreamMessage.StreamDataMessage", "stream_id", 1, FieldType.String, false)]
    [InlineData("UpstreamMessage.StreamDataMessage", "stream_sequence_id", 2, FieldType.UInt64, true)]
    [InlineData("UpstreamMessage.StreamEndMessage", "stream_id", 1, FieldType.String, false)]
    [InlineData("UpstreamMessage.StreamEndMessage.StreamEndError", "message", 1, FieldType.String, true)]
    [InlineData("UpstreamMessage.StreamEndMessage.StreamEndError", "user_error_code", 2, FieldType.String, true)]
    [InlineData("UpstreamMessage.SetGroupStateMessage", "group", 1, FieldType.String, false)]
    [InlineData("UpstreamMessage.SetGroupStateMessage", "ack_id", 2, FieldType.UInt64, true)]
    [InlineData("UpstreamMessage.SubscribeGroupStateMessage", "group", 1, FieldType.String, false)]
    [InlineData("UpstreamMessage.SubscribeGroupStateMessage", "ack_id", 2, FieldType.UInt64, true)]
    [InlineData("UpstreamMessage.UnsubscribeGroupStateMessage", "group", 1, FieldType.String, false)]
    [InlineData("UpstreamMessage.UnsubscribeGroupStateMessage", "ack_id", 2, FieldType.UInt64, true)]
    [InlineData("DownstreamMessage.AckMessage", "ack_id", 1, FieldType.UInt64, false)]
    [InlineData("DownstreamMessage.DataMessage", "sequence_id", 4, FieldType.UInt64, true)]
    [InlineData("DownstreamMessage.SystemMessage.ConnectedMessage", "reconnection_token", 3, FieldType.String, true)]
    [InlineData("DownstreamMessage.InvokeResponseMessage", "invocation_id", 1, FieldType.String, false)]
    [InlineData("DownstreamMessage.InvokeResponseMessage", "success", 2, FieldType.Bool, false)]
    [InlineData("DownstreamMessage.InvokeResponseMessage.ErrorMessage", "name", 1, FieldType.String, false)]
    [InlineData("DownstreamMessage.InvokeResponseMessage.ErrorMessage", "message", 2, FieldType.String, false)]
    [InlineData("DownstreamMessage.StreamAckMessage", "stream_id", 1, FieldType.String, false)]
    [InlineData("DownstreamMessage.StreamAckMessage", "expected_sequence_id", 2, FieldType.UInt64, false)]
    [InlineData("DownstreamMessage.StreamNackMessage", "stream_id", 1, FieldType.String, false)]
    [InlineData("DownstreamMessage.StreamNackMessage", "name", 2, FieldType.String, false)]
    [InlineData("DownstreamMessage.StreamNackMessage", "message", 3, FieldType.String, false)]
    [InlineData("DownstreamMessage.StreamNackMessage", "expected_sequence_id", 4, FieldType.UInt64, false)]
    [InlineData("DownstreamMessage.StreamClosedMessage", "stream_id", 1, FieldType.String, false)]
    [InlineData("DownstreamMessage.StreamClosedMessage.StreamClosedError", "name", 1, FieldType.String, false)]
    [InlineData("DownstreamMessage.StreamClosedMessage.StreamClosedError", "message", 2, FieldType.String, false)]
    [InlineData("DownstreamMessage.GroupStateSnapshotMessage", "group", 1, FieldType.String, false)]
    [InlineData("DownstreamMessage.GroupStateSnapshotMessage", "sequence_id", 3, FieldType.UInt64, true)]
    [InlineData("DownstreamMessage.GroupStateUpdateMessage", "group", 1, FieldType.String, false)]
    [InlineData("DownstreamMessage.GroupStateUpdateMessage", "sequence_id", 3, FieldType.UInt64, true)]
    [InlineData("GroupStateItem", "connection_id", 1, FieldType.String, false)]
    [InlineData("GroupStateItem", "user_id", 2, FieldType.String, true)]
    [InlineData("GroupStateItem", "updated_at", 4, FieldType.Int64, false)]
    [InlineData("StreamInfo", "stream_id", 1, FieldType.String, false)]
    [InlineData("StreamInfo", "stream_sequence_id", 2, FieldType.UInt64, false)]
    [InlineData("StreamInfo", "end_of_stream", 3, FieldType.Bool, true)]
    [InlineData("StreamInfo.StreamError", "name", 1, FieldType.String, false)]
    [InlineData("StreamInfo.StreamError", "message", 2, FieldType.String, false)]
    [InlineData("StreamInfo.StreamError", "user_error_code", 3, FieldType.String, false)]
    public void ScalarFields_HaveExpectedTagsTypesPresenceAndRange(string owner, string name, int tag, FieldType type, bool optional)
    {
        var field = AssertField(owner, name, tag, type);
        Assert.Equal(optional, field.ToProto().Proto3Optional);
        Assert.Equal(optional, field.HasPresence);
        object[] values = type switch
        {
            FieldType.UInt64 => new object[] { 0UL, ulong.MaxValue },
            FieldType.UInt32 => new object[] { 0U, uint.MaxValue },
            FieldType.Int64 => new object[] { long.MinValue, long.MaxValue },
            FieldType.Bool => new object[] { false, true },
            FieldType.String => new object[] { "", "value" },
            _ => throw new InvalidOperationException(),
        };
        foreach (var value in values)
        {
            Assert.Equal(value.GetType(), field.ContainingType.ClrType.GetProperty(field.PropertyName)!.PropertyType);
            AssertRoundTrip(field, value);
        }
    }

    [Theory]
    [InlineData("UpstreamMessage.SendToGroupMessage", "stream", 7, "UpstreamMessage.StreamStartInfo", false)]
    [InlineData("UpstreamMessage.EventMessage", "stream", 5, "UpstreamMessage.StreamStartInfo", false)]
    [InlineData("UpstreamMessage.InvokeEventMessage", "data", 3, "MessageData", false)]
    [InlineData("UpstreamMessage.InvokeEventMessage", "stream", 5, "UpstreamMessage.StreamStartInfo", false)]
    [InlineData("UpstreamMessage.StreamDataMessage", "data", 3, "MessageData", true)]
    [InlineData("UpstreamMessage.StreamEndMessage", "error", 2, "UpstreamMessage.StreamEndMessage.StreamEndError", true)]
    [InlineData("UpstreamMessage.SetGroupStateMessage", "state", 3, "GroupStateItem.GroupState", true)]
    [InlineData("DownstreamMessage.DataMessage", "stream", 6, "StreamInfo", true)]
    [InlineData("DownstreamMessage.InvokeResponseMessage", "data", 3, "MessageData", true)]
    [InlineData("DownstreamMessage.InvokeResponseMessage", "error", 4, "DownstreamMessage.InvokeResponseMessage.ErrorMessage", true)]
    [InlineData("DownstreamMessage.StreamClosedMessage", "error", 2, "DownstreamMessage.StreamClosedMessage.StreamClosedError", true)]
    [InlineData("GroupStateItem", "state", 3, "GroupStateItem.GroupState", true)]
    [InlineData("StreamInfo", "error", 4, "StreamInfo.StreamError", true)]
    public void MessageFields_HaveExpectedTagsTypesAndPresence(string owner, string name, int tag, string messageType, bool optional)
    {
        var field = AssertField(owner, name, tag, FieldType.Message);
        Assert.Equal("azure.webpubsub." + messageType, field.MessageType.FullName);
        Assert.Equal(optional, field.ToProto().Proto3Optional);
        Assert.True(field.HasPresence);
        Assert.Equal(field.MessageType.ClrType, field.ContainingType.ClrType.GetProperty(field.PropertyName)!.PropertyType);
        AssertRoundTrip(field, field.MessageType.Parser.ParseFrom(Array.Empty<byte>()));
    }

    [Theory]
    [InlineData("UpstreamMessage.SendToGroupMessage", "metadata", 6)]
    [InlineData("UpstreamMessage.EventMessage", "metadata", 4)]
    [InlineData("UpstreamMessage.InvokeEventMessage", "metadata", 4)]
    [InlineData("DownstreamMessage.DataMessage", "metadata", 5)]
    [InlineData("DownstreamMessage.InvokeResponseMessage", "metadata", 5)]
    [InlineData("GroupStateItem.GroupState", "entries", 1)]
    public void MapFields_HaveExpectedTagsAndStringEntries(string owner, string name, int tag)
    {
        var field = AssertField(owner, name, tag, FieldType.Message);
        Assert.True(field.IsMap);
        Assert.Equal(FieldType.String, field.MessageType.FindFieldByNumber(1).FieldType);
        Assert.Equal(FieldType.String, field.MessageType.FindFieldByNumber(2).FieldType);
        Assert.Equal(typeof(MapField<string, string>), field.ContainingType.ClrType.GetProperty(field.PropertyName)!.PropertyType);

        var message = field.ContainingType.Parser.ParseFrom(Array.Empty<byte>());
        var entries = Assert.IsType<MapField<string, string>>(field.Accessor.GetValue(message));
        entries.Add("key", "value");
        entries.Add("empty", "");
        Assert.Equal(message, field.ContainingType.Parser.ParseFrom(message.ToByteArray()));
    }

    [Theory]
    [InlineData("DownstreamMessage.GroupStateSnapshotMessage")]
    [InlineData("DownstreamMessage.GroupStateUpdateMessage")]
    public void GroupStateItems_HaveExpectedRepeatedTypeAndRoundTrip(string owner)
    {
        var field = AssertField(owner, "items", 2, FieldType.Message);
        Assert.True(field.IsRepeated);
        Assert.False(field.IsMap);
        Assert.Same(GroupStateItem.Descriptor, field.MessageType);
        Assert.Equal(typeof(RepeatedField<GroupStateItem>), field.ContainingType.ClrType.GetProperty(field.PropertyName)!.PropertyType);

        var message = field.ContainingType.Parser.ParseFrom(Array.Empty<byte>());
        var items = Assert.IsType<RepeatedField<GroupStateItem>>(field.Accessor.GetValue(message));
        items.Add(new GroupStateItem
        {
            ConnectionId = "connection",
            UserId = "user",
            UpdatedAt = long.MaxValue,
            State = new GroupStateItem.Types.GroupState { Entries = { { "key", "value" } } },
        });
        items.Add(new GroupStateItem { ConnectionId = "other" });
        Assert.Equal(message, field.ContainingType.Parser.ParseFrom(message.ToByteArray()));
    }

    private static FieldDescriptor AssertField(string owner, string name, int tag, FieldType type)
    {
        var message = WebpubsubV1Reflection.Descriptor.MessageTypes.SelectMany(GetMessages)
            .Single(descriptor => descriptor.FullName == "azure.webpubsub." + owner);
        var field = message.FindFieldByName(name);
        Assert.NotNull(field);
        Assert.Equal(tag, field.FieldNumber);
        Assert.Equal(type, field.FieldType);
        return field;
    }

    private static void AssertRoundTrip(FieldDescriptor field, object value)
    {
        var message = field.ContainingType.Parser.ParseFrom(Array.Empty<byte>());
        if (field.HasPresence)
        {
            Assert.False(field.Accessor.HasValue(message));
        }
        field.Accessor.SetValue(message, value);

        var parsed = field.ContainingType.Parser.ParseFrom(message.ToByteArray());
        Assert.Equal(message, parsed);
        Assert.Equal(value, field.Accessor.GetValue(parsed));
        if (field.HasPresence)
        {
            Assert.True(field.Accessor.HasValue(parsed));
            field.Accessor.Clear(parsed);
            Assert.False(field.Accessor.HasValue(parsed));
        }
    }

    private static IEnumerable<MessageDescriptor> GetMessages(MessageDescriptor descriptor)
    {
        // Synthetic map-entry descriptors do not have generated CLR message types.
        if (descriptor.ClrType != null)
        {
            yield return descriptor;
        }
        foreach (var nested in descriptor.NestedTypes.SelectMany(GetMessages))
        {
            yield return nested;
        }
    }
}