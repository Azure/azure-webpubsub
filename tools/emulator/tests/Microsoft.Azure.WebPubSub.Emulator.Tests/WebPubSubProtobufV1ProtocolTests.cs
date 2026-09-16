// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IO;
using Azure.Messaging.WebPubSub.Client.Protobuf;
using Google.Protobuf;
using Xunit;
using ProtoData = Azure.Messaging.WebPubSub.Client.Protobuf.MessageData;
using static Azure.Messaging.WebPubSub.Client.Protobuf.UpstreamMessage.Types;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class WebPubSubProtobufV1ProtocolTests
{
    private readonly WebPubSubProtobufV1Protocol _protocol = new();

    [Fact]
    public void CanonicalSchemaTypesRemainInternalAndDeferredOperationsAreRejected()
    {
        Assert.Equal("webpubsub.v1.proto", UpstreamMessage.Descriptor.File.Name);
        Assert.False(typeof(UpstreamMessage).IsPublic);
        Assert.False(typeof(DownstreamMessage).IsPublic);
        foreach (var field in UpstreamMessage.Descriptor.Fields.InFieldNumberOrder())
        {
            if (field.FieldNumber < 10)
            {
                continue;
            }

            var message = new UpstreamMessage();
            field.Accessor.SetValue(message, field.MessageType.Parser.ParseFrom(Array.Empty<byte>()));
            Assert.Throws<InvalidDataException>(() => _protocol.ParseMessage(message.ToByteArray()));
        }
    }

    [Fact]
    public void MetadataOnlyRequiresNonemptyMetadataAndPreservesCasing()
    {
        var message = new UpstreamMessage { EventMessage = new EventMessage { Event = "message" } };
        Assert.Throws<InvalidDataException>(() => _protocol.ParseMessage(message.ToByteArray()));
        message.EventMessage.Metadata.Add("Trace", "first");
        message.EventMessage.Metadata.Add("trace", "");
        var parsed = Assert.IsType<WebPubSubClientSendEventRequest>(_protocol.ParseMessage(message.ToByteArray()));
        Assert.Null(parsed.AckId);
        Assert.Equal(MessageDataType.Text, parsed.Data.Type);
        Assert.True(parsed.Data.Bytes.IsEmpty);
        Assert.Equal(2, parsed.Data.Metadata!.Count);
        Assert.Equal("", parsed.Data.Metadata["trace"]);
        message.EventMessage.Data = new ProtoData();
        Assert.Throws<InvalidDataException>(() => _protocol.ParseMessage(message.ToByteArray()));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void SelectedEmptyDataIsNotMissingData(bool binary)
    {
        var message = new UpstreamMessage { EventMessage = new EventMessage
        {
            Event = "message", Data = binary ? new ProtoData { BinaryData = ByteString.Empty } : new ProtoData { TextData = "" },
        } };
        var parsed = Assert.IsType<WebPubSubClientSendEventRequest>(_protocol.ParseMessage(message.ToByteArray()));
        Assert.True(parsed.Data.Bytes.IsEmpty);
        Assert.Equal(binary ? MessageDataType.Binary : MessageDataType.Text, parsed.Data.Type);
    }

    [Theory]
    [MemberData(nameof(InvalidRequests))]
    public void InvalidOrDeferredRequestsAreRejected(byte[] bytes) =>
        Assert.Throws<InvalidDataException>(() => _protocol.ParseMessage(bytes));

    public static IEnumerable<object[]> InvalidRequests()
    {
        yield return [new UpstreamMessage { EventMessage = new EventMessage { Event = "bad event", Data = new ProtoData { TextData = "a" } } }.ToByteArray()];
        foreach (var pair in new[] { ("bad:key", "value"), ("tag", "非ASCII"), (new string('k', 257), "value"), ("tag", new string('v', 1025)) })
            yield return [new UpstreamMessage { EventMessage = new EventMessage { Event = "message", Metadata = { [pair.Item1] = pair.Item2 } } }.ToByteArray()];
        yield return [new UpstreamMessage { SendToGroupMessage = new SendToGroupMessage { Group = "room", TtlSeconds = 301, Data = new ProtoData { TextData = "a" } } }.ToByteArray()];
        yield return [new UpstreamMessage { EventMessage = new EventMessage { Event = "message", Data = new ProtoData { TextData = "a" }, Stream = new StreamStartInfo { StreamId = "stream" } } }.ToByteArray()];
        yield return [new UpstreamMessage { SendToGroupMessage = new SendToGroupMessage { Group = "room", Data = new ProtoData { TextData = "a" }, Stream = new StreamStartInfo { StreamId = "stream" } } }.ToByteArray()];
        yield return [Convert.FromHexString("5200")]; // Unsupported invocation field 10, not an ordinary event.
    }
}
