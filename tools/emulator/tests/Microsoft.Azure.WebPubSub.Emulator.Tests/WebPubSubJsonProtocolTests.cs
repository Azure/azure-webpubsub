// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.IO;
using System.Text;
using System.Text.Json;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

/// <summary>
/// Malformed client frames must surface as protocol errors the receive loop already
/// handles, never as an unexpected runtime exception escaping the request.
/// </summary>
public class WebPubSubJsonProtocolTests
{
    [Theory]
    [InlineData("""{"type":"joinGroup","group":"room","ackId":"1"}""")]
    [InlineData("""{"type":"joinGroup","group":"room","ackId":true}""")]
    [InlineData("""{"type":"joinGroup","group":"room","ackId":-1}""")]
    [InlineData("""{"type":"joinGroup","group":"room","ackId":{}}""")]
    [InlineData("""{"type":"sequenceAck","sequenceId":"1"}""")]
    [InlineData("""{"type":"sequenceAck","sequenceId":[]}""")]
    [InlineData("""{"type":"sequenceAck"}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","dataType":"text","data":"hi","noEcho":"true"}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","dataType":"text","data":"hi","noEcho":1}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","dataType":"binary","data":"not base64!"}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","dataType":42,"data":"hi"}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","dataType":"text"}""")]
    [InlineData("""{"type":42}""")]
    [InlineData("""["joinGroup"]""")]
    [InlineData("""{"type":"unknown"}""")]
    public void Parse_MalformedMessage_ThrowsInvalidData(string json)
    {
        Assert.Throws<InvalidDataException>(() => { _ = Parse(json); });
    }

    [Theory]
    [InlineData("""{"type":"joinGroup","group":"room","ackId":null}""")]
    [InlineData("""{"type":"joinGroup","group":"room"}""")]
    public void Parse_MissingOptionalAckId_IsAccepted(string json)
    {
        var message = Assert.IsType<JoinGroupMessage>(Parse(json));
        Assert.Null(message.AckId);
    }

    [Fact]
    public void Parse_MissingNoEcho_DefaultsFalse()
    {
        var message = Assert.IsType<SendToGroupMessage>(
            Parse("""{"type":"sendToGroup","group":"room","dataType":"text","data":"hi"}"""));
        Assert.False(message.NoEcho);
        Assert.Equal(MessageDataType.Text, message.Data.Type);
    }

    [Fact]
    public void Parse_TruncatedJson_ThrowsJsonException()
    {
        Assert.ThrowsAny<JsonException>(() => { _ = Parse("""{"type":"ping" """); });
    }

    private static ClientMessage Parse(string json)
    {
        return WebPubSubJsonProtocol.Parse(Encoding.UTF8.GetBytes(json).AsMemory());
    }
}
