// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Buffers;
using System.Linq;
using Azure.Messaging.WebPubSub.Clients;
using Xunit;

namespace Azure.Messaging.WebPubSub.Client.Protobuf.Tests
{
    public class WebPubSubProtobufProtocolMessageTests
    {
        private readonly WebPubSubProtobufProtocol _protocol = new WebPubSubProtobufProtocol();

        [Fact]
        public void WriteUpstreamMessages_JoinGroup_ReturnsCorrectPayload()
        {
            // Arrange
            var message1 = new JoinGroupMessage("group", null);
            var message2 = new JoinGroupMessage("group", 44133);

            // Act
            var bytes1 = _protocol.GetMessageBytes(message1);
            var bytes2 = _protocol.GetMessageBytes(message2);

            // Assert
            Assert.Equal("MgcKBWdyb3Vw", Convert.ToBase64String(bytes1.ToArray()));
            Assert.Equal("MgsKBWdyb3VwEOXYAg==", Convert.ToBase64String(bytes2.ToArray()));
        }

        [Fact]
        public void WriteUpstreamMessages_LeaveGroup_ReturnsCorrectPayload()
        {
            // Arrange
            var message1 = new LeaveGroupMessage("group", null);
            var message2 = new LeaveGroupMessage("group", 12345);

            // Act
            var bytes1 = _protocol.GetMessageBytes(message1);
            var bytes2 = _protocol.GetMessageBytes(message2);

            // Assert
            Assert.Equal("OgcKBWdyb3Vw", Convert.ToBase64String(bytes1.ToArray()));
            Assert.Equal("OgoKBWdyb3VwELlg", Convert.ToBase64String(bytes2.ToArray()));
        }

        [Fact]
        public void WriteUpstreamMessages_SendToGroup_ReturnsCorrectPayload()
        {
            // Arrange
            var message1 = new SendToGroupMessage(
                "group",
                BinaryData.FromString("xzy"),
                WebPubSubDataType.Text,
                noEcho: false,
                ackId: null);

            var message2 = new SendToGroupMessage(
                "group",
                BinaryData.FromString("{\"value\":\"xzy\"}"),
                WebPubSubDataType.Json,
                noEcho: false,
                ackId: 12345);

            // Act
            var bytes1 = _protocol.GetMessageBytes(message1);
            var bytes2 = _protocol.GetMessageBytes(message2);

            // Assert
            Assert.Equal("ChAKBWdyb3VwGgUKA3h6eSAA", Convert.ToBase64String(bytes1.ToArray()));
            Assert.Equal("Ch8KBWdyb3VwELlgGhEKD3sidmFsdWUiOiJ4enkifSAA", Convert.ToBase64String(bytes2.ToArray()));
        }

        [Fact]
        public void WriteUpstreamMessages_SequenceAck_ReturnsCorrectPayload()
        {
            // Arrange
            var message = new SequenceAckMessage(123456);

            // Act
            var bytes = _protocol.GetMessageBytes(message);

            // Assert
            Assert.Equal("QgQIwMQH", Convert.ToBase64String(bytes.ToArray()));
        }

        [Fact]
        public void WriteUpstreamMessages_SendEvent_ReturnsCorrectPayload()
        {
            // Arrange
            var message = new SendEventMessage(
                "event",
                BinaryData.FromString("xzy"),
                WebPubSubDataType.Text,
                null);

            // Act
            var bytes = _protocol.GetMessageBytes(message);

            // Assert
            Assert.Equal("Kg4KBWV2ZW50EgUKA3h6eQ==", Convert.ToBase64String(bytes.ToArray()));
        }

        [Fact]
        public void ParseDownstreamMessages_AckMessages_ReturnsCorrectObject()
        {
            // Arrange
            var bytes1 = Convert.FromBase64String("CgQIexAB");
            var bytes2 = Convert.FromBase64String("ChoIexAAGhQKCUZvcmJpZGRlbhIHbWVzc2FnZQ==");

            // Act
            var messages1 = _protocol.ParseMessage(new ReadOnlySequence<byte>(bytes1));
            var messages2 = _protocol.ParseMessage(new ReadOnlySequence<byte>(bytes2));

            // Assert
            Assert.NotNull(messages1);
            Assert.True(messages1.Count > 0);
            var ackMessage1 = messages1.First() as AckMessage;
            Assert.NotNull(ackMessage1);
            Assert.Equal(123, ackMessage1.AckId);
            Assert.True(ackMessage1.Success);
            Assert.Null(ackMessage1.Error);

            Assert.NotNull(messages2);
            Assert.True(messages2.Count > 0);
            var ackMessage2 = messages2[0] as AckMessage;
            Assert.NotNull(ackMessage2);
            Assert.Equal(123, ackMessage2.AckId);
            Assert.False(ackMessage2.Success);
            Assert.NotNull(ackMessage2.Error);
            Assert.Equal("Forbidden", ackMessage2.Error.Name);
            Assert.Equal("message", ackMessage2.Error.Message);
        }

        [Fact]
        public void ParseDownstreamMessages_GroupDataMessages_ReturnsCorrectObject()
        {
            // Arrange
            var bytes1 = Convert.FromBase64String("EhwKBWdyb3VwEglncm91cE5hbWUaBQoDeHl6ILlg");

            // Act
            var messages = _protocol.ParseMessage(new ReadOnlySequence<byte>(bytes1));

            // Assert
            Assert.NotNull(messages);
            Assert.True(messages.Count > 0);
            var groupDataMessage = messages.First() as GroupDataMessage;
            Assert.NotNull(groupDataMessage);
            Assert.Equal("groupName", groupDataMessage.Group);
            Assert.Equal(12345, groupDataMessage.SequenceId);
            Assert.Equal(WebPubSubDataType.Text, groupDataMessage.DataType);
            Assert.Equal("xyz", groupDataMessage.Data.ToString());
        }

        [Fact]
        public void ParseDownstreamMessages_ServerDataMessages_ReturnsCorrectObject()
        {
            // Arrange
            var bytes1 = Convert.FromBase64String("EhIKBnNlcnZlchoFCgN4eXoguWA=");

            // Act
            var messages = _protocol.ParseMessage(new ReadOnlySequence<byte>(bytes1));

            // Assert
            Assert.NotNull(messages);
            Assert.True(messages.Count > 0);
            var serverDataMessage = messages.First() as ServerDataMessage;
            Assert.NotNull(serverDataMessage);
            Assert.Equal(12345, serverDataMessage.SequenceId);
            Assert.Equal(WebPubSubDataType.Text, serverDataMessage.DataType);
            Assert.Equal("xyz", serverDataMessage.Data.ToString());
        }

        [Fact]
        public void ParseDownstreamMessages_SystemMessages_ReturnsCorrectObject()
        {
            // Arrange
            var bytes1 = Convert.FromBase64String("GhQKEgoKY29ubmVjdGlvbhIEdXNlcg==");
            var bytes2 = Convert.FromBase64String("GhkKFwoKY29ubmVjdGlvbhIEdXNlchoDcmVj");
            var bytes3 = Convert.FromBase64String("GgcSBRIDbXNn");

            // Act
            var messages1 = _protocol.ParseMessage(new ReadOnlySequence<byte>(bytes1));
            var messages2 = _protocol.ParseMessage(new ReadOnlySequence<byte>(bytes2));
            var messages3 = _protocol.ParseMessage(new ReadOnlySequence<byte>(bytes3));

            // Assert
            Assert.NotNull(messages1);
            Assert.True(messages1.Count > 0);
            var connectedMessage1 = messages1.First() as ConnectedMessage;
            Assert.NotNull(connectedMessage1);
            Assert.Equal("user", connectedMessage1.UserId);
            Assert.Equal("connection", connectedMessage1.ConnectionId);
            Assert.Empty(connectedMessage1.ReconnectionToken);

            Assert.NotNull(messages2);
            Assert.True(messages2.Count > 0);
            var connectedMessage2 = messages2.First() as ConnectedMessage;
            Assert.NotNull(connectedMessage2);
            Assert.Equal("user", connectedMessage2.UserId);
            Assert.Equal("connection", connectedMessage2.ConnectionId);
            Assert.Equal("rec", connectedMessage2.ReconnectionToken);

            Assert.NotNull(messages3);
            Assert.True(messages3.Count > 0);
            var disconnectedMessage = messages3.First() as DisconnectedMessage;
            Assert.NotNull(disconnectedMessage);
            Assert.Equal("msg", disconnectedMessage.Reason);
        }
    }
}
