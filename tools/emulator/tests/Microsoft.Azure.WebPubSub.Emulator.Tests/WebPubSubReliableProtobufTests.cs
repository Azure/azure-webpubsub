// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Azure.Messaging.WebPubSub;
using Azure.Messaging.WebPubSub.Client.Protobuf;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using ConnectedMessage = Azure.Messaging.WebPubSub.Client.Protobuf.DownstreamMessage.Types.SystemMessage.Types.ConnectedMessage;
using ProtoData = Azure.Messaging.WebPubSub.Client.Protobuf.MessageData;
using static Azure.Messaging.WebPubSub.Client.Protobuf.UpstreamMessage.Types;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class WebPubSubReliableProtobufTests
{
    private const string Protocol = WebPubSubProtobufV1PayloadProcessor.ReliableSubprotocolName;
    private const string Hub = "chat";
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    [Theory]
    [InlineData(Protocol)]
    [InlineData("PROTOBUF.RELIABLE.WEBPUBSUB.AZURE.V1")]
    public async Task ReliableNegotiationIssuesConnectionScopedToken(string protocol)
    {
        await using var fixture = await Fixture.StartAsync();
        using var socket = await fixture.ConnectAsync(protocol: protocol);
        var connected = await ReceiveConnectedAsync(socket);
        Assert.Equal(protocol, socket.SubProtocol);
        Assert.Equal("alice", connected.UserId);
        Assert.True(connected.HasReconnectionToken);
        Assert.NotEmpty(connected.ReconnectionToken);
        Assert.True(fixture.Tokens.ValidateReconnectionToken(connected.ConnectionId, connected.ReconnectionToken));
        Assert.True(fixture.GetConnection(connected).IsReliable);
        Assert.Equal(protocol, fixture.GetConnection(connected).Subprotocol);
        await PingAsync(socket);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AbortReplaysOrderedDataAndSequenceAckTrimsCumulatively(bool acknowledge)
    {
        await using var fixture = await Fixture.StartAsync();
        using var socket = await fixture.ConnectAsync();
        var connected = await ReceiveConnectedAsync(socket);
        var logical = fixture.GetConnection(connected);
        var native = Any.Pack(new StringValue { Value = "你好" });
        fixture.Manager.SendToConnection(Hub, connected.ConnectionId, new MessageData(MessageDataType.Text, "first"u8.ToArray()));
        fixture.Manager.SendToConnection(Hub, connected.ConnectionId, new MessageData(MessageDataType.Json, "{\"second\":2}"u8.ToArray()));
        await SendAsync(socket, new UpstreamMessage { SendToGroupMessage = new SendToGroupMessage
        {
            Group = "token-room", Data = new ProtoData { ProtobufData = native }, Metadata = { ["trace"] = "before" },
        } });
        var received = new[] { await ReceiveAsync(socket), await ReceiveAsync(socket), await ReceiveAsync(socket) };
        AssertData(received[0], 1, new ProtoData { TextData = "first" });
        AssertData(received[1], 2, new ProtoData { JsonData = "{\"second\":2}" });
        AssertData(received[2], 3, new ProtoData { ProtobufData = native }, "token-room", "before");
        if (acknowledge)
        {
            await SendAsync(socket, new UpstreamMessage { SequenceAckMessage = new SequenceAckMessage { SequenceId = 2 } });
            // A pong is a processing barrier: the cumulative acknowledgement has reached the buffer.
            await PingAsync(socket);
        }

        socket.Abort();
        await fixture.InitialRequestCompleted.WaitAsync(Timeout);
        Assert.Same(logical, fixture.GetConnection(connected));
        fixture.Manager.SendToConnection(Hub, connected.ConnectionId,
            new MessageData(MessageDataType.Binary, new byte[] { 0, 255 }, new Dictionary<string, string> { ["trace"] = "offline" }));
        fixture.Manager.SendToGroup(Hub, "token-room",
            new MessageData(MessageDataType.Protobuf, native.ToByteArray(), new Dictionary<string, string> { ["trace"] = "offline-group" }),
            sender: null, noEcho: false);
        using var recovered = await fixture.ConnectAsync(fixture.RecoveryUri(connected.ConnectionId, connected.ReconnectionToken));
        Assert.Equal(Protocol, recovered.SubProtocol);
        for (var i = acknowledge ? 2 : 0; i < received.Length; i++)
        {
            Assert.Equal(received[i], await ReceiveAsync(recovered));
        }
        AssertData(await ReceiveAsync(recovered), 4, new ProtoData { BinaryData = ByteString.CopyFrom(new byte[] { 0, 255 }) }, trace: "offline");
        AssertData(await ReceiveAsync(recovered), 5, new ProtoData { ProtobufData = native }, "token-room", "offline-group");
        Assert.Same(logical, fixture.GetConnection(connected));
        fixture.Manager.SendToConnection(Hub, connected.ConnectionId, new MessageData(MessageDataType.Text, "live"u8.ToArray()));
        AssertData(await ReceiveAsync(recovered), 6, new ProtoData { TextData = "live" });
        await PingAsync(recovered); // No extra replay, connected frame, or acknowledgement is expected.
    }

    [Theory]
    [InlineData(0UL)]
    [InlineData(ulong.MaxValue)]
    public async Task RecoveryRetainsTokenAndJoinedGroupsAndDeduplicatesAckIds(ulong ackId)
    {
        await using var fixture = await Fixture.StartAsync();
        using var socket = await fixture.ConnectAsync();
        var connected = await ReceiveConnectedAsync(socket);
        var logical = fixture.GetConnection(connected);
        await SendAsync(socket, new UpstreamMessage { JoinGroupMessage = new JoinGroupMessage { Group = "joined-room", AckId = ackId } });
        AssertAck(await ReceiveAsync(socket), ackId);
        socket.Abort();
        await fixture.InitialRequestCompleted.WaitAsync(Timeout);
        using var recovered = await fixture.ConnectAsync(fixture.RecoveryUri(connected.ConnectionId, connected.ReconnectionToken));
        // Reusing the successful join's ID must not execute a leave, even on a new transport.
        await SendAsync(recovered, new UpstreamMessage { LeaveGroupMessage = new LeaveGroupMessage { Group = "joined-room", AckId = ackId } });
        AssertAck(await ReceiveAsync(recovered), ackId, "Duplicate");
        Assert.Same(logical, fixture.GetConnection(connected));
        ulong sequenceId = 0;
        foreach (var group in new[] { "token-room", "joined-room" })
        {
            fixture.Manager.SendToGroup(Hub, group, new MessageData(MessageDataType.Text, "retained"u8.ToArray()), sender: null, noEcho: false);
            AssertData(await ReceiveAsync(recovered), ++sequenceId, new ProtoData { TextData = "retained" }, group);
        }
        await PingAsync(recovered);
    }

    [Theory]
    [InlineData("invalid-token")]
    [InlineData("missing-token")]
    [InlineData("connection-id")]
    [InlineData("hub")]
    public async Task InvalidRecoveryClosesWithoutDestroyingOriginalConnection(string invalid)
    {
        await using var fixture = await Fixture.StartAsync();
        using var socket = await fixture.ConnectAsync();
        var connected = await ReceiveConnectedAsync(socket);
        var logical = fixture.GetConnection(connected);
        socket.Abort();
        await fixture.InitialRequestCompleted.WaitAsync(Timeout);
        var token = invalid switch { "invalid-token" => "invalid", "missing-token" => null, _ => connected.ReconnectionToken };
        using var rejected = await fixture.ConnectAsync(fixture.RecoveryUri(
            invalid == "connection-id" ? "another-connection" : connected.ConnectionId, token, invalid == "hub" ? "other" : Hub));
        await AssertRejectedAsync(rejected);
        using var recovered = await fixture.ConnectAsync(fixture.RecoveryUri(connected.ConnectionId, connected.ReconnectionToken));
        await PingAsync(recovered);
        Assert.Same(logical, fixture.GetConnection(connected));
    }

    [Fact]
    public async Task ExpiredRecoveryWindowRejectsStillValidToken()
    {
        // Match LogicalConnectionTests' short runtime timeout; expiration does not use TimeProvider.
        await using var fixture = await Fixture.StartAsync(reconnectTimeout: TimeSpan.FromMilliseconds(50));
        using var socket = await fixture.ConnectAsync();
        var connected = await ReceiveConnectedAsync(socket);
        Assert.True(fixture.GetConnection(connected).IsReliable);
        socket.Abort();
        await fixture.InitialRequestCompleted.WaitAsync(Timeout);
        using var cancellation = new CancellationTokenSource(Timeout);
        while (fixture.Manager.ConnectionExists(Hub, connected.ConnectionId))
        {
            cancellation.Token.ThrowIfCancellationRequested();
            await Task.Yield();
        }
        Assert.True(fixture.Tokens.ValidateReconnectionToken(connected.ConnectionId, connected.ReconnectionToken));
        using var rejected = await fixture.ConnectAsync(fixture.RecoveryUri(connected.ConnectionId, connected.ReconnectionToken));
        await AssertRejectedAsync(rejected);
        Assert.False(fixture.Manager.ConnectionExists(Hub, connected.ConnectionId));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("protobuf.webpubsub.azure.v1")]
    [InlineData("json.webpubsub.azure.v1")]
    [InlineData("json.reliable.webpubsub.azure.v1")]
    public async Task RecoveryKeepsOriginalProtocolRegardlessOfNewOffer(string? offered)
    {
        // TestServer exposes the response: network clients reject unoffered subprotocols themselves.
        await using var fixture = await Fixture.StartAsync(testServer: true);
        using var socket = await fixture.ConnectAsync();
        var connected = await ReceiveConnectedAsync(socket);
        var logical = fixture.GetConnection(connected);
        using var recovered = await fixture.ConnectAsync(fixture.RecoveryUri(connected.ConnectionId, connected.ReconnectionToken), offered);
        Assert.Equal(Protocol, recovered.SubProtocol);
        await PingAsync(recovered); // Recovery must still parse and emit protobuf, not the new offer.
        Assert.Same(logical, fixture.GetConnection(connected));
    }

    private static async Task<ConnectedMessage> ReceiveConnectedAsync(WebSocket socket)
    {
        var connected = (await ReceiveAsync(socket)).SystemMessage?.ConnectedMessage;
        Assert.NotNull(connected);
        Assert.NotEmpty(connected.ConnectionId);
        return connected;
    }

    private static async Task SendAsync(WebSocket socket, UpstreamMessage message)
    {
        using var cancellation = new CancellationTokenSource(Timeout);
        await socket.SendAsync(message.ToByteArray(), WebSocketMessageType.Binary, true, cancellation.Token);
    }

    private static async Task<DownstreamMessage> ReceiveAsync(WebSocket socket)
    {
        using var cancellation = new CancellationTokenSource(Timeout);
        using var body = new MemoryStream();
        var buffer = new byte[4096];
        WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(buffer, cancellation.Token);
            Assert.Equal(WebSocketMessageType.Binary, result.MessageType);
            body.Write(buffer, 0, result.Count);
        } while (!result.EndOfMessage);
        return DownstreamMessage.Parser.ParseFrom(body.ToArray());
    }

    private static async Task PingAsync(WebSocket socket)
    {
        await SendAsync(socket, new UpstreamMessage { PingMessage = new PingMessage() });
        Assert.NotNull((await ReceiveAsync(socket)).PongMessage);
    }

    private static void AssertData(DownstreamMessage message, ulong sequenceId, ProtoData data, string? group = null, string? trace = null)
    {
        Assert.NotNull(message.DataMessage);
        Assert.True(message.DataMessage.HasSequenceId);
        Assert.Equal(sequenceId, message.DataMessage.SequenceId);
        Assert.Equal(group is null ? "server" : "group", message.DataMessage.From);
        Assert.Equal(group is not null, message.DataMessage.HasGroup);
        if (group is not null) Assert.Equal(group, message.DataMessage.Group);
        Assert.Equal(data, message.DataMessage.Data);
        Assert.Equal(trace is null ? 0 : 1, message.DataMessage.Metadata.Count);
        if (trace is not null) Assert.Equal(trace, message.DataMessage.Metadata["trace"]);
    }

    private static void AssertAck(DownstreamMessage message, ulong ackId, string? error = null)
    {
        Assert.NotNull(message.AckMessage);
        Assert.Equal(ackId, message.AckMessage.AckId);
        Assert.Equal(error is null, message.AckMessage.Success);
        Assert.Equal(error, message.AckMessage.Error?.Name);
    }

    private static async Task AssertRejectedAsync(WebSocket socket)
    {
        using var cancellation = new CancellationTokenSource(Timeout);
        var result = await socket.ReceiveAsync(new byte[256], cancellation.Token);
        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.PolicyViolation, result.CloseStatus);
    }

    private sealed class Fixture(WebApplication app, bool testServer, Task initialRequestCompleted) : IAsyncDisposable
    {
        public ConnectionManager Manager => app.Services.GetRequiredService<ConnectionManager>();
        public WebPubSubTokenService Tokens => app.Services.GetRequiredService<WebPubSubTokenService>();
        public Task InitialRequestCompleted => initialRequestCompleted;
        private string Endpoint => testServer ? "http://localhost" : app.Urls.Single();

        public static async Task<Fixture> StartAsync(bool testServer = false, TimeSpan? reconnectTimeout = null)
        {
            var builder = EmulatorApplication.CreateBuilder(["--urls=http://127.0.0.1:0"],
                new EmulatorRuntimeOptions { ReconnectTimeout = reconnectTimeout ?? TimeSpan.FromSeconds(30) });
            builder.Logging.ClearProviders();
            if (testServer) builder.WebHost.UseTestServer();
            var app = EmulatorApplication.Build(builder);
            var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            app.Use(async (context, next) =>
            {
                try { await next(context); }
                finally
                {
                    // Observe the real endpoint's finally/Detach, without inspecting private transport state.
                    if (!context.Request.Query.ContainsKey("awps_connection_id")) completed.TrySetResult();
                }
            });
            try { await app.StartAsync().WaitAsync(Timeout); }
            catch { await app.DisposeAsync(); throw; }
            return new Fixture(app, testServer, completed.Task);
        }

        public async Task<WebSocket> ConnectAsync(Uri? uri = null, string? protocol = Protocol)
        {
            uri ??= new WebPubSubServiceClient($"Endpoint={Endpoint};AccessKey={EmulatorOptions.DefaultAccessKey};Version=1.0;", Hub)
                .GetClientAccessUri(userId: "alice", roles: ["webpubsub.joinLeaveGroup", "webpubsub.sendToGroup"], groups: ["token-room"]);
            using var cancellation = new CancellationTokenSource(Timeout);
            if (testServer)
            {
                var client = app.GetTestServer().CreateWebSocketClient();
                if (protocol is not null) client.SubProtocols.Add(protocol);
                return await client.ConnectAsync(uri, cancellation.Token);
            }
            var socket = new ClientWebSocket();
            try
            {
                if (protocol is not null) socket.Options.AddSubProtocol(protocol);
                await socket.ConnectAsync(uri, cancellation.Token);
                return socket;
            }
            catch { socket.Dispose(); throw; }
        }

        public Uri RecoveryUri(string connectionId, string? token, string hub = Hub) => new(
            $"{Endpoint.Replace("http:", "ws:")}/client/hubs/{hub}?awps_connection_id={Uri.EscapeDataString(connectionId)}" +
            (token is null ? "" : $"&awps_reconnection_token={Uri.EscapeDataString(token)}"));

        public LogicalConnection GetConnection(ConnectedMessage connected)
        {
            Assert.True(Manager.TryGet(Hub, connected.ConnectionId, out var connection));
            return connection!;
        }

        public ValueTask DisposeAsync() => app.DisposeAsync();
    }
}