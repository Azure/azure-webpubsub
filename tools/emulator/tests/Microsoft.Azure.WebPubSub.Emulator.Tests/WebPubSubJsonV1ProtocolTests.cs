// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text.Json;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class WebPubSubJsonV1ProtocolTests
{
    private readonly WebPubSubJsonV1Protocol _protocol = new();

    [Fact]
    public void GroupDataIncludesSequenceId()
    {
        var payload = _protocol.WriteGroupData(
            "room",
            "user",
            new MessageData(MessageDataType.Text, "hello"u8.ToArray()),
            sequenceId: 42);

        using var document = JsonDocument.Parse(payload.Bytes);

        Assert.Equal(42UL, document.RootElement.GetProperty("sequenceId").GetUInt64());
    }

    [Fact]
    public void ServerDataOmitsSequenceIdWhenNotReliable()
    {
        var payload = _protocol.WriteServerData(
            new MessageData(MessageDataType.Text, "hello"u8.ToArray()));

        using var document = JsonDocument.Parse(payload.Bytes);

        Assert.False(document.RootElement.TryGetProperty("sequenceId", out _));
    }

    [Fact]
    public void ServerDataIncludesSequenceId()
    {
        var payload = _protocol.WriteServerData(
            new MessageData(MessageDataType.Text, "hello"u8.ToArray()),
            sequenceId: 42);

        using var document = JsonDocument.Parse(payload.Bytes);

        Assert.Equal(42UL, document.RootElement.GetProperty("sequenceId").GetUInt64());
    }
}