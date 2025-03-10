// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Buffers;
using Azure.Core;
using Azure.Messaging.WebPubSub.Clients;
using Xunit;

namespace Azure.Messaging.WebPubSub.Client.Protobuf.Tests
{
    public class WebPubSubProtobufProtocolTests
    {
        [Fact]
        public void VerifyProtocolProperties()
        {
            // Arrange
            var protocol = new WebPubSubProtobufProtocol();

            // Assert
            Assert.Equal("protobuf.webpubsub.azure.v1", protocol.Name);
            Assert.Equal(WebPubSubProtocolMessageType.Binary, protocol.WebSocketMessageType);
            Assert.False(protocol.IsReliable);
        }

        [Fact]
        public void WriteMessageToBufferWriter()
        {
            // Arrange
            var protocol = new WebPubSubProtobufProtocol();
            var message = new JoinGroupMessage("testGroup", 123);
            var writer = new ArrayBufferWriter<byte>();

            // Act
            protocol.WriteMessage(message, writer);

            // Assert
            Assert.True(writer.WrittenCount > 0);
        }
    }
}