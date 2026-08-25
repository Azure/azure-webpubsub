// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
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
    [InlineData("""{"type":"sendToGroup","group":"room","data":"hi","ttlSeconds":-1}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","data":"hi","ttlSeconds":301}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","data":"hi","ttlSeconds":"30"}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","dataType":"binary","data":"not base64!"}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","dataType":42,"data":"hi"}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","dataType":"text"}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","data":"hi","metadata":[]}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","data":"hi","metadata":{"key":1}}""")]
    [InlineData("""{"type":"sendToGroup","group":"room","data":"hi","metadata":{"bad key":"value"}}""")]
    [InlineData("""{"type":"event","event":"message","metadata":{"key":"非 ASCII"}}""")]
    [InlineData("""{"type":"setGroupState","group":"room","state":[]}""")]
    [InlineData("""{"type":"setGroupState","group":"room","state":{"activity":1}}""")]
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
        Assert.Equal(0U, message.TtlSeconds);
        Assert.Equal(MessageDataType.Text, message.Data.Type);
    }

    [Fact]
    public void Parse_ClientMessageTtl_IsRetained()
    {
        var message = Assert.IsType<SendToGroupMessage>(
            Parse("""{"type":"sendToGroup","group":"room","data":"hi","ttlSeconds":300}"""));

        Assert.Equal(300U, message.TtlSeconds);
    }

    [Theory]
    [InlineData("sendToGroup")]
    [InlineData("event")]
    public void Parse_MetadataOnlyMessage_IsRetained(string type)
    {
        var target = type == "sendToGroup" ? "\"group\":\"room\"," : "\"event\":\"message\",";
        var message = Parse($"{{\"type\":\"{type}\",{target}\"metadata\":{{\"Trace-Id\":\"123\"}}}}");
        var data = message switch
        {
            SendToGroupMessage send => send.Data,
            EventMessage clientEvent => clientEvent.Data,
            _ => throw new InvalidOperationException(),
        };

        Assert.Equal(MessageDataType.Text, data.Type);
        Assert.Empty(data.Bytes);
        Assert.Equal("123", data.Metadata!["Trace-Id"]);

        using var downstream = JsonDocument.Parse(WebPubSubJsonProtocol.WriteServerData(data, null));
        Assert.Equal(
            "123",
            downstream.RootElement.GetProperty("metadata").GetProperty("Trace-Id").GetString());
    }

    [Fact]
    public void Parse_TruncatedJson_ThrowsJsonException()
    {
        Assert.ThrowsAny<JsonException>(() => { _ = Parse("""{"type":"ping" """); });
    }

    [Fact]
    public void WriteDisconnected_IncludesReason()
    {
        using var message = JsonDocument.Parse(WebPubSubJsonProtocol.WriteDisconnected("test-close"));

        Assert.Equal("system", message.RootElement.GetProperty("type").GetString());
        Assert.Equal("disconnected", message.RootElement.GetProperty("event").GetString());
        Assert.Equal("test-close", message.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public void Parse_GroupStateRequests_RetainStateAndAckIds()
    {
        var set = Assert.IsType<SetGroupStateMessage>(Parse(
            """{"type":"setGroupState","group":"room","state":{"activity":"typing"},"ackId":1}"""));
        var subscribe = Assert.IsType<SubscribeGroupStateMessage>(Parse(
            """{"type":"subscribeGroupState","group":"room","ackId":2}"""));
        var unsubscribe = Assert.IsType<UnsubscribeGroupStateMessage>(Parse(
            """{"type":"unsubscribeGroupState","group":"room","ackId":3}"""));
        var clear = Assert.IsType<SetGroupStateMessage>(Parse(
            """{"type":"setGroupState","group":"room","state":null}"""));

        Assert.Equal("typing", set.State!["activity"]);
        Assert.Equal(1UL, set.AckId);
        Assert.Equal(2UL, subscribe.AckId);
        Assert.Equal(3UL, unsubscribe.AckId);
        Assert.Null(clear.State);
    }

    [Fact]
    public void WriteGroupStateMessages_MatchRuntimeShape()
    {
        var items = new GroupStateItem[]
        {
            new("connection-1", "alice", new Dictionary<string, string>
            {
                ["activity"] = "typing",
            }, 123),
            new("connection-2", null, null, 124),
        };

        using var update = JsonDocument.Parse(
            WebPubSubJsonProtocol.WriteGroupStateUpdate("room", items, 5));
        using var snapshot = JsonDocument.Parse(
            WebPubSubJsonProtocol.WriteGroupStateSnapshot("room", items, null));

        Assert.Equal("groupStateUpdate", update.RootElement.GetProperty("type").GetString());
        Assert.Equal(5UL, update.RootElement.GetProperty("sequenceId").GetUInt64());
        Assert.Equal("typing", update.RootElement.GetProperty("items")[0]
            .GetProperty("state").GetProperty("activity").GetString());
        Assert.False(update.RootElement.GetProperty("items")[1].TryGetProperty("userId", out _));
        Assert.False(update.RootElement.GetProperty("items")[1].TryGetProperty("state", out _));
        Assert.Equal("groupStateSnapshot", snapshot.RootElement.GetProperty("type").GetString());
    }

    private static ClientMessage Parse(string json)
    {
        return WebPubSubJsonProtocol.Parse(Encoding.UTF8.GetBytes(json).AsMemory());
    }
}
