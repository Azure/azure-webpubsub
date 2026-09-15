// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Azure.Core;
using Azure.Messaging.WebPubSub;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.WebPubSub.Emulator.Protobuf;
using Xunit;
using Fixture = Microsoft.Azure.WebPubSub.Emulator.Tests.UpstreamUserEventTests.Fixture;
using ProtoData = Microsoft.Azure.WebPubSub.Emulator.Protobuf.MessageData;
using static Microsoft.Azure.WebPubSub.Emulator.Protobuf.UpstreamMessage.Types;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class WebPubSubProtobufV1IntegrationTests
{
    private const string Protocol = "protobuf.webpubsub.azure.v1";
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    [Theory]
    [InlineData(Protocol)]
    [InlineData("PROTOBUF.WEBPUBSUB.AZURE.V1")]
    public async Task StandardProtocolReceivesBinaryConnectedMessage(string protocol)
    {
        await using var fixture = await Fixture.StartAsync(_ => Task.CompletedTask).WaitAsync(Timeout);
        using var socket = await ConnectAsync(CreateServiceClient(fixture), protocol: protocol);
        await SendAsync(socket, new UpstreamMessage { PingMessage = new PingMessage() });
        Assert.NotNull((await ReceiveAsync(socket)).PongMessage);
    }

    [Fact]
    public async Task ClientsJoinPublishAndLeaveGroupUsingKnownWireFrame()
    {
        await using var fixture = await Fixture.StartAsync(_ => Task.CompletedTask).WaitAsync(Timeout);
        var service = CreateServiceClient(fixture);
        using var receiver = await ConnectAsync(service, roles: ["webpubsub.joinLeaveGroup.room"]);
        using var sender = await ConnectAsync(service, roles: ["webpubsub.sendToGroup.room"]);
        // Independent wire vector: field 6, length 8; group "room" (field 1), explicit ack_id=0 (field 2).
        await SendFrameAsync(receiver, Convert.FromHexString("32080A04726F6F6D1000"));
        AssertAck(await ReceiveAsync(receiver), 0);
        var send = new UpstreamMessage { SendToGroupMessage = new SendToGroupMessage
        {
            Group = "room", AckId = 1, TtlSeconds = 300, Data = new ProtoData { TextData = "hello" },
        } };
        await SendAsync(sender, send);
        AssertAck(await ReceiveAsync(sender), 1);
        var delivered = (await ReceiveAsync(receiver)).DataMessage;
        Assert.NotNull(delivered);
        Assert.Equal("group", delivered.From);
        Assert.Equal("room", delivered.Group);
        Assert.Equal(new ProtoData { TextData = "hello" }, delivered.Data);
        Assert.False(delivered.HasSequenceId);

        await SendAsync(receiver, new UpstreamMessage { LeaveGroupMessage = new LeaveGroupMessage { Group = "room", AckId = 2 } });
        AssertAck(await ReceiveAsync(receiver), 2);
        send.SendToGroupMessage.AckId = 2;
        await SendAsync(sender, send);
        AssertAck(await ReceiveAsync(sender), 2);
        // The sender ack completes fan-out before the receiver's sentinel is enqueued.
        await SendAsync(receiver, new UpstreamMessage { PingMessage = new PingMessage() });
        Assert.NotNull((await ReceiveAsync(receiver)).PongMessage);
    }

    [Theory]
    [InlineData(0UL)]
    [InlineData(ulong.MaxValue)]
    public async Task AckBoundariesPreservePermissionsAndRejectDuplicateSideEffects(ulong ackId)
    {
        await using var fixture = await Fixture.StartAsync(_ => Task.CompletedTask).WaitAsync(Timeout);
        var service = CreateServiceClient(fixture);
        using var socket = await ConnectAsync(service, roles: ["webpubsub.joinLeaveGroup.room"]);
        var forbidden = new[]
        {
            new UpstreamMessage { JoinGroupMessage = new JoinGroupMessage { Group = "denied", AckId = ackId } },
            new UpstreamMessage { LeaveGroupMessage = new LeaveGroupMessage { Group = "denied", AckId = ackId } },
            new UpstreamMessage { SendToGroupMessage = new SendToGroupMessage
            {
                Group = "room", AckId = ackId, Data = new ProtoData { TextData = "denied" },
            } },
        };
        foreach (var request in forbidden)
        {
            await SendAsync(socket, request);
            AssertAck(await ReceiveAsync(socket), ackId, "Forbidden");
        }
        // Failed requests must not consume the ack ID; a duplicate leave must not undo the join.
        await SendAsync(socket, new UpstreamMessage { JoinGroupMessage = new JoinGroupMessage { Group = "room", AckId = ackId } });
        AssertAck(await ReceiveAsync(socket), ackId);
        await SendAsync(socket, new UpstreamMessage { LeaveGroupMessage = new LeaveGroupMessage { Group = "room", AckId = ackId } });
        AssertAck(await ReceiveAsync(socket), ackId, "Duplicate");
        await service.SendToGroupAsync("room", BinaryData.FromString("still-joined"), ContentType.TextPlain).WaitAsync(Timeout);
        Assert.Equal("still-joined", (await ReceiveAsync(socket)).DataMessage?.Data.TextData);
    }

    [Theory]
    [InlineData("", WebSocketMessageType.Binary, WebSocketCloseStatus.InvalidPayloadData)]
    [InlineData("FF", WebSocketMessageType.Binary, WebSocketCloseStatus.InvalidPayloadData)]
    [InlineData("3200", WebSocketMessageType.Binary, WebSocketCloseStatus.InvalidPayloadData)]
    [InlineData("0A060A04726F6F6D", WebSocketMessageType.Binary, WebSocketCloseStatus.InvalidPayloadData)]
    [InlineData("32080A04726F6F6D1000", WebSocketMessageType.Text, WebSocketCloseStatus.InvalidMessageType)]
    public async Task InvalidPayloadOrTextFrameClosesConnection(string hex, WebSocketMessageType type, WebSocketCloseStatus status)
    {
        await using var fixture = await Fixture.StartAsync(_ => Task.CompletedTask).WaitAsync(Timeout);
        using var socket = await ConnectAsync(CreateServiceClient(fixture));
        await SendFrameAsync(socket, Convert.FromHexString(hex), type);
        using var cancellation = new CancellationTokenSource(Timeout);
        var close = await socket.ReceiveAsync(new byte[512], cancellation.Token);
        Assert.Equal(WebSocketMessageType.Close, close.MessageType);
        Assert.Equal(status, close.CloseStatus);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", cancellation.Token);
    }

    [Fact]
    public async Task NativeAnyReachesMixedGroupRecipientsWithoutEcho()
    {
        await using var fixture = await Fixture.StartAsync(context =>
        {
            context.Response.ContentType = "text/plain";
            return context.Response.WriteAsync("ready");
        }).WaitAsync(Timeout);
        var service = CreateServiceClient(fixture);
        using var receiver = await ConnectAsync(service, groups: ["room"]);
        using var json = await ConnectAsync(service, protocol: "json.webpubsub.azure.v1", groups: ["room"]);
        using var raw = await ConnectAsync(service, protocol: null, groups: ["room"]);
        // Raw clients have no connected frame; a user-event reply establishes readiness.
        await SendFrameAsync(raw, "ready"u8.ToArray(), WebSocketMessageType.Text);
        Assert.Equal("ready"u8.ToArray(), await ReceiveFrameAsync(raw, WebSocketMessageType.Text));
        using var sender = await ConnectAsync(service, roles: ["webpubsub.sendToGroup.room"], groups: ["room"]);
        var payload = Any.Pack(new StringValue { Value = "你好" });
        await SendAsync(sender, new UpstreamMessage { SendToGroupMessage = new SendToGroupMessage
        {
            Group = "room", AckId = 1, NoEcho = true, Data = new ProtoData { ProtobufData = payload },
            Metadata = { ["trace"] = "mixed" },
        } });
        AssertAck(await ReceiveAsync(sender), 1);
        var delivered = (await ReceiveAsync(receiver)).DataMessage;
        Assert.NotNull(delivered);
        Assert.Equal("group", delivered.From);
        Assert.Equal("room", delivered.Group);
        Assert.Equal(new ProtoData { ProtobufData = payload }, delivered.Data);
        Assert.Equal("mixed", delivered.Metadata["trace"]);
        Assert.False(delivered.HasSequenceId);
        Assert.Equal(payload.ToByteArray(), await ReceiveFrameAsync(raw));
        using var envelope = JsonDocument.Parse(await ReceiveFrameAsync(json, WebSocketMessageType.Text));
        Assert.Equal("message", envelope.RootElement.GetProperty("type").GetString());
        Assert.Equal("group", envelope.RootElement.GetProperty("from").GetString());
        Assert.Equal("room", envelope.RootElement.GetProperty("group").GetString());
        Assert.Equal("alice", envelope.RootElement.GetProperty("fromUserId").GetString());
        Assert.Equal("protobuf", envelope.RootElement.GetProperty("dataType").GetString());
        Assert.Equal(payload.ToByteArray(), envelope.RootElement.GetProperty("data").GetBytesFromBase64());
        Assert.Equal("mixed", envelope.RootElement.GetProperty("metadata").GetProperty("trace").GetString());
        await SendAsync(sender, new UpstreamMessage { PingMessage = new PingMessage() });
        Assert.NotNull((await ReceiveAsync(sender)).PongMessage);
    }

    [Fact]
    public async Task NativeAnyHttpEventPreservesRequestReplyMetadataAndAck()
    {
        var input = Any.Pack(new StringValue { Value = "request" });
        var output = Any.Pack(new StringValue { Value = "reply" });
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            context.Response.ContentType = "application/x-protobuf";
            context.Response.Headers["X-WebPubSub-Metadata-Trace"] = "reply";
            await context.Response.Body.WriteAsync(output.ToByteArray(), context.RequestAborted);
        }).WaitAsync(Timeout);
        using var socket = await ConnectAsync(CreateServiceClient(fixture));
        var request = new UpstreamMessage { EventMessage = new EventMessage
        {
            Event = "message", AckId = 42, Data = new ProtoData { ProtobufData = input }, Metadata = { ["Trace"] = "request" },
        } };
        await SendAsync(socket, request);
        var messages = new[] { await ReceiveAsync(socket), await ReceiveAsync(socket) };
        var reply = Assert.Single(messages, message => message.DataMessage is not null).DataMessage;
        Assert.Equal("server", reply.From);
        Assert.Equal(new ProtoData { ProtobufData = output }, reply.Data);
        Assert.Equal("reply", reply.Metadata["trace"]);
        AssertAck(Assert.Single(messages, message => message.AckMessage is not null), 42);
        var received = await fixture.ReadAsync();
        Assert.Equal(input.ToByteArray(), received.Body);
        Assert.Equal("application/x-protobuf", received.Headers["Content-Type"]);
        Assert.Equal("request", received.Headers["x-webpubsub-metadata-trace"]);
        Assert.Equal("azure.webpubsub.user.message", received.Headers["ce-type"]);
        Assert.Equal(Protocol, received.Headers["ce-subprotocol"]);
        Assert.Equal("alice", received.Headers["ce-userId"]);
        await SendAsync(socket, request);
        AssertAck(await ReceiveAsync(socket), 42, "Duplicate");
        Assert.False(fixture.Events.Reader.TryRead(out _));
    }

    [Theory]
    [InlineData("text/plain", "你好", "text")]
    [InlineData("application/json", "{\"answer\":42}", "json")]
    [InlineData("application/octet-stream", "AP8=", "binary")]
    public async Task RestDeliveryPreservesNormalDataTypes(string contentType, string body, string dataType)
    {
        await using var fixture = await Fixture.StartAsync(_ => Task.CompletedTask).WaitAsync(Timeout);
        var service = CreateServiceClient(fixture);
        using var socket = await ConnectAsync(service);
        var bytes = dataType == "binary" ? Convert.FromBase64String(body) : Encoding.UTF8.GetBytes(body);
        var response = await service.SendToAllAsync(BinaryData.FromBytes(bytes), new ContentType(contentType)).WaitAsync(Timeout);
        Assert.Equal(202, response.Status);
        var delivered = (await ReceiveAsync(socket)).DataMessage;
        Assert.NotNull(delivered);
        Assert.Equal("server", delivered.From);
        Assert.False(delivered.HasGroup);
        Assert.False(delivered.HasSequenceId);
        Assert.Equal(dataType switch
        {
            "text" => new ProtoData { TextData = body },
            "json" => new ProtoData { JsonData = body },
            _ => new ProtoData { BinaryData = ByteString.CopyFrom(bytes) },
        }, delivered.Data);
    }

    private static WebPubSubServiceClient CreateServiceClient(Fixture fixture) =>
        new($"Endpoint={fixture.Endpoint};AccessKey={EmulatorOptions.DefaultAccessKey};Version=1.0;", "chat");

    private static async Task<ClientWebSocket> ConnectAsync(WebPubSubServiceClient service, string? protocol = Protocol,
        string[]? roles = null, string[]? groups = null)
    {
        var socket = new ClientWebSocket();
        try
        {
            if (protocol is not null) socket.Options.AddSubProtocol(protocol);
            await socket.ConnectAsync(service.GetClientAccessUri(userId: "alice", roles: roles, groups: groups), CancellationToken.None).WaitAsync(Timeout);
            Assert.Equal(protocol, socket.SubProtocol);
            if (protocol is not null && protocol.Equals(Protocol, StringComparison.OrdinalIgnoreCase))
            {
                var connected = (await ReceiveAsync(socket)).SystemMessage?.ConnectedMessage;
                Assert.NotNull(connected);
                Assert.NotEmpty(connected.ConnectionId);
                Assert.Equal("alice", connected.UserId);
                Assert.False(connected.HasReconnectionToken);
            }
            else if (protocol is not null)
            {
                using var connected = JsonDocument.Parse(await ReceiveFrameAsync(socket, WebSocketMessageType.Text));
                Assert.Equal("connected", connected.RootElement.GetProperty("event").GetString());
            }
            return socket;
        }
        catch { socket.Dispose(); throw; }
    }

    private static Task SendAsync(ClientWebSocket socket, UpstreamMessage message) => SendFrameAsync(socket, message.ToByteArray());

    private static async Task SendFrameAsync(ClientWebSocket socket, byte[] bytes, WebSocketMessageType type = WebSocketMessageType.Binary)
    {
        using var cancellation = new CancellationTokenSource(Timeout);
        await socket.SendAsync(bytes, type, true, cancellation.Token);
    }

    private static async Task<DownstreamMessage> ReceiveAsync(ClientWebSocket socket) =>
        DownstreamMessage.Parser.ParseFrom(await ReceiveFrameAsync(socket));

    private static async Task<byte[]> ReceiveFrameAsync(ClientWebSocket socket, WebSocketMessageType type = WebSocketMessageType.Binary)
    {
        using var cancellation = new CancellationTokenSource(Timeout);
        using var body = new MemoryStream();
        var buffer = new byte[4096];
        WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(buffer, cancellation.Token);
            Assert.Equal(type, result.MessageType);
            body.Write(buffer, 0, result.Count);
        } while (!result.EndOfMessage);
        return body.ToArray();
    }

    private static void AssertAck(DownstreamMessage message, ulong ackId, string? error = null)
    {
        Assert.NotNull(message.AckMessage);
        Assert.Equal(ackId, message.AckMessage.AckId);
        Assert.Equal(error is null, message.AckMessage.Success);
        Assert.Equal(error, message.AckMessage.Error?.Name);
    }
}