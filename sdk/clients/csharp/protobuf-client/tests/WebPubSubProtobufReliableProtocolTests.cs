// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Buffers;
using Azure.Core;
using Azure.Messaging.WebPubSub.Clients;
using Xunit;

namespace Azure.Messaging.WebPubSub.Client.Protobuf.Tests
{
    public class WebPubSubProtobufReliableProtocolTests
    {
        [Fact]
        public void VerifyReliableProtocolProperties()
        {
            // Arrange
            var reliableProtocol = new WebPubSubProtobufReliableProtocol();

            // Assert
            Assert.Equal("protobuf.reliable.webpubsub.azure.v1", reliableProtocol.Name);
            Assert.Equal(WebPubSubProtocolMessageType.Binary, reliableProtocol.WebSocketMessageType);
            Assert.True(reliableProtocol.IsReliable);
        }

        [Fact]
        public void WriteMessageToBufferWriter()
        {
            // Arrange
            var reliableProtocol = new WebPubSubProtobufReliableProtocol();
            var message = new SequenceAckMessage(42);
            var writer = new ArrayBufferWriter<byte>();

            // Act
            reliableProtocol.WriteMessage(message, writer);

            // Assert
            Assert.True(writer.WrittenCount > 0);
        }
    }
}