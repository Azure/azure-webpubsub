// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Producer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class EventHubNotifierTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    [Theory]
    [InlineData("*", "room.message", true, true)]
    [InlineData("room.*, join", "room.message", true, false)]
    [InlineData(" JOIN, message", "join", true, true)]
    [InlineData(null, "message", true, false)]
    [InlineData("*", "connect", false, false)]
    [InlineData(null, "connected", false, true)]
    [InlineData(null, "CONNECTED", false, true)]
    [InlineData(null, "disconnected", false, true)]
    public void FilterUsesRuntimeLiteralListNotHandlerWildcards(string? pattern, string name, bool user, bool expected)
    {
        var filter = new EventNameFilterOptions { UserEventPattern = pattern, SystemEvents = ["connect", "CONNECTED", "disconnected"] };
        Assert.Equal(expected, filter.Matches(name, user));
    }

    [Theory]
    [InlineData("Text", "text/plain")]
    [InlineData("Json", "application/json")]
    [InlineData("Binary", "application/octet-stream")]
    public void MessageUsesAmqpCloudEventsWithUserMetadata(string type, string contentType)
    {
        var connection = new UpstreamConnectionContext("connection", "chat", "用户", "custom", "localhost") { ConnectionState = "state" };
        var metadata = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["TraceId"] = "first", ["traceid"] = "last", ["Empty"] = "",
            ["File-Name"] = "report.txt", ["Values"] = " alpha, beta ", ["Type"] = "user-value",
        };
        WebPubSubMetadataValidator.Validate(metadata);
        var data = new MessageData(Enum.Parse<MessageDataType>(type), new byte[] { 0, 1, 255 }, metadata);
        var message = EventHubNotifier.CreateMessage(connection, "message", 7, data, true);
        Assert.Equal(data.Bytes.ToArray(), message.EventBody.ToArray());
        Assert.Equal(contentType, message.ContentType);
        Assert.Equal("connection/7", message.MessageId);
        Assert.Equal("azure.webpubsub.user.message", message.Properties["cloudEvents:type"]);
        Assert.Equal("/hubs/chat/client/connection", message.Properties["cloudEvents:source"]);
        Assert.Equal("7", message.Properties["cloudEvents:id"]);
        Assert.Equal("用户", message.Properties["cloudEvents:userid"]);
        Assert.Equal("custom", message.Properties["cloudEvents:subprotocol"]);
        Assert.Equal("state", message.Properties["cloudEvents:connectionstate"]);
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$", (string)message.Properties["cloudEvents:time"]);
        Assert.Equal("last", message.Properties["x-webpubsub-metadata-traceid"]);
        Assert.Equal("", message.Properties["x-webpubsub-metadata-empty"]);
        Assert.Equal("report.txt", message.Properties["x-webpubsub-metadata-file-name"]);
        Assert.Equal(" alpha, beta ", message.Properties["x-webpubsub-metadata-values"]);
        Assert.Equal("user-value", message.Properties["x-webpubsub-metadata-type"]);
        Assert.Equal(17, message.Properties.Count);
        Assert.Equal("first", metadata["TraceId"]);
        Assert.Equal(6, metadata.Count);
        connection.ConnectionState = "";
        Assert.False(EventHubNotifier.CreateMessage(connection, "message", 8, data, true).Properties.ContainsKey("cloudEvents:connectionstate"));
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(true, true)]
    [InlineData(false, false)]
    public void AbsentMetadataAndSystemEventsHaveNoUserProperties(bool userEvent, bool emptyMetadata)
    {
        var data = new MessageData(MessageDataType.Json, "{}"u8.ToArray(),
            emptyMetadata ? new Dictionary<string, string>() : userEvent ? null : new Dictionary<string, string> { ["Tag"] = "ignored" });
        var message = EventHubNotifier.CreateMessage(new("connection", "chat", null, null, "localhost"),
            userEvent ? "message" : "connected", 1, data, userEvent);
        Assert.DoesNotContain(message.Properties.Keys, key => key.StartsWith("x-webpubsub-metadata-", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("json.webpubsub.azure.v1", false)]
    [InlineData("json.webpubsub.azure.v1", true)]
    [InlineData("json.reliable.webpubsub.azure.v1", false)]
    [InlineData("json.reliable.webpubsub.azure.v1", true)]
    public async Task ListenerReceivesPerMessageMetadata(string protocol, bool metadataOnly)
    {
        var producer = new RecordingProducer();
        await using var app = await StartAsync(producer);
        var client = app.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(protocol);
        using var socket = await client.ConnectAsync(ClientUri(), CancellationToken.None).WaitAsync(Timeout);
        await ReceiveAsync(socket);
        var connected = await producer.ReadAsync();
        Assert.DoesNotContain(connected.Event.Properties.Keys, key => key.StartsWith("x-webpubsub-metadata-", StringComparison.OrdinalIgnoreCase));
        var data = metadataOnly ? "" : "\"dataType\":\"text\",\"data\":\"hello\",";
        var payload = "{\"type\":\"event\",\"event\":\"message\",\"ackId\":1," + data + "\"metadata\":{\"TraceId\":\"first\",\"traceid\":\"last\",\"Tag\":\"\"}}";
        await socket.SendAsync(Encoding.UTF8.GetBytes(payload), WebSocketMessageType.Text, true, CancellationToken.None);
        using var ack = JsonDocument.Parse(await ReceiveAsync(socket));
        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        var received = await producer.ReadAsync();
        Assert.Equal(metadataOnly ? "" : "hello", received.Event.EventBody.ToString());
        Assert.Equal("text/plain", received.Event.ContentType);
        Assert.Equal("last", received.Event.Properties["x-webpubsub-metadata-traceid"]);
        Assert.Equal("", received.Event.Properties["x-webpubsub-metadata-tag"]);
        Assert.Equal(connected.Partition, received.Partition);
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None).WaitAsync(Timeout);
        var disconnected = await producer.ReadAsync();
        Assert.DoesNotContain(disconnected.Event.Properties.Keys, key => key.StartsWith("x-webpubsub-metadata-", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData(null, "events.servicebus.windows.net", true)]
    [InlineData(null, "https://events.servicebus.windows.net", false)]
    [InlineData("bad-connection-string", "", false)]
    [InlineData("Endpoint=sb://localhost;SharedAccessKeyName=test;SharedAccessKey=test;UseDevelopmentEmulator=true", "", true)]
    [InlineData("Endpoint=sb://localhost;SharedAccessKeyName=test;SharedAccessKey=test", "", false)]
    public void EndpointConfigurationIsExplicit(string? connectionString, string ns, bool valid)
    {
        Assert.Equal(valid, new EventHubEndpointOptions { EventHubName = "events", FullyQualifiedNamespace = ns, ConnectionString = connectionString }.IsValid());
    }

    [Fact]
    public async Task FanOutReusesProducerAndDrainWaitsForInflightSends()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var producer = new RecordingProducer { OnSend = _ => release.Task };
        var listener = new EventListenerOptions
        {
            EventHubEndpoint = new() { FullyQualifiedNamespace = "local.test", EventHubName = "events" },
            EventNameFilter = new() { UserEventPattern = "*" },
        };
        var other = new RecordingProducer();
        var second = new EventListenerOptions { EventHubEndpoint = listener.EventHubEndpoint with { EventHubName = "other" }, EventNameFilter = listener.EventNameFilter };
        var options = Options.Create(new EmulatorOptions { Hubs = new() { ["chat"] = new() { EventListeners = [listener, listener, second] } } });
        var creations = 0;
        using var configuration = new HubSettingsConfiguration(new ConfigurationBuilder().Build(), options,
            new OptionsFactory<EmulatorOptions>([], []), NullLogger<HubSettingsConfiguration>.Instance);
        await using var notifier = new EventHubNotifier(configuration, endpoint => { creations++; return endpoint.EventHubName == "other" ? other : producer; }, NullLogger<EventHubNotifier>.Instance);
        var sending = notifier.TryNotifyAsync(new("connection", "chat", null, null, "localhost"), "message", 2,
            new(MessageDataType.Text, "hi"u8.ToArray()), true);
        await producer.ReadAsync();
        await producer.ReadAsync();
        await other.ReadAsync();
        Assert.Equal(2, creations);
        var disposing = notifier.DisposeAsync().AsTask();
        Assert.False(disposing.IsCompleted);
        Assert.False(producer.Disposed);
        release.SetResult();
        Assert.True(await sending);
        await disposing.WaitAsync(Timeout);
        Assert.True(producer.Disposed);
        Assert.True(other.Disposed);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task ListenerOnlySupportsLifecycleAndUserEvents(bool failSend, bool raw)
    {
        var producer = new RecordingProducer { OnSend = _ => failSend ? Task.FromException(new InvalidOperationException("test failure")) : Task.CompletedTask };
        await using var app = await StartAsync(producer);
        var client = app.GetTestServer().CreateWebSocketClient();
        if (!raw) client.SubProtocols.Add("json.reliable.webpubsub.azure.v1");
        using var socket = await client.ConnectAsync(ClientUri(), CancellationToken.None).WaitAsync(Timeout);
        if (!raw) await ReceiveAsync(socket);
        var connected = await producer.ReadAsync();
        Assert.Equal("azure.webpubsub.sys.connected", connected.Event.Properties["cloudEvents:type"]);
        Assert.Equal("{}", connected.Event.EventBody.ToString());
        Assert.Equal("1", connected.Event.Properties["cloudEvents:id"]);
        var payload = raw ? "hello" : "{\"type\":\"event\",\"event\":\"message\",\"ackId\":1,\"dataType\":\"text\",\"data\":\"hello\"}";
        await socket.SendAsync(Encoding.UTF8.GetBytes(payload), WebSocketMessageType.Text, true, CancellationToken.None);
        var user = await producer.ReadAsync();
        Assert.Equal("hello", user.Event.EventBody.ToString());
        Assert.Equal("2", user.Event.Properties["cloudEvents:id"]);
        Assert.Equal(connected.Partition, user.Partition);
        Assert.Equal(user.Event.Properties["cloudEvents:connectionid"], user.Partition);
        if (!raw)
        {
            using var ack = JsonDocument.Parse(await ReceiveAsync(socket));
            Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
            await socket.SendAsync(Encoding.UTF8.GetBytes(payload), WebSocketMessageType.Text, true, CancellationToken.None);
            using var duplicate = JsonDocument.Parse(await ReceiveAsync(socket));
            Assert.Equal("Duplicate", duplicate.RootElement.GetProperty("error").GetProperty("name").GetString());
        }
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None).WaitAsync(Timeout);
        var disconnected = await producer.ReadAsync();
        Assert.Equal("azure.webpubsub.sys.disconnected", disconnected.Event.Properties["cloudEvents:type"]);
        Assert.Equal("3", disconnected.Event.Properties["cloudEvents:id"]);
        using var body = JsonDocument.Parse(disconnected.Event.EventBody);
        Assert.Equal("done", body.RootElement.GetProperty("reason").GetString());
        Assert.False(producer.Events.Reader.TryRead(out _));
    }

    [Fact]
    public async Task NoMatchingListenerStillFailsUserEvent()
    {
        var producer = new RecordingProducer();
        await using var app = await StartAsync(producer, "room.*");
        var dispatcher = app.Services.GetRequiredService<UpstreamEventDispatcher>();
        await Assert.ThrowsAsync<InvalidOperationException>(() => dispatcher.DispatchUserEventAsync(
            new("connection", "chat", null, null, "localhost"), new("room.message", new(MessageDataType.Text, "hello"u8.ToArray())), CancellationToken.None));
        Assert.False(producer.Events.Reader.TryRead(out _));
    }

    private static async Task<WebApplication> StartAsync(RecordingProducer producer, string pattern = "*")
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:FullyQualifiedNamespace"] = "local.test",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:EventHubName"] = "events",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventNameFilter:SystemEvents:0"] = "connected",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventNameFilter:SystemEvents:1"] = "disconnected",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventNameFilter:UserEventPattern"] = pattern,
        });
        builder.Services.AddSingleton<Func<EventHubEndpointOptions, EventHubProducerClient>>(_ => _ => producer);
        var app = EmulatorApplication.Build(builder);
        await app.StartAsync();
        return app;
    }

    private static Uri ClientUri()
    {
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            audience: "http://localhost/client/hubs/chat", expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)), SecurityAlgorithms.HmacSha256)));
        return new Uri("ws://localhost/client/hubs/chat?access_token=" + token);
    }

    private static async Task<byte[]> ReceiveAsync(WebSocket socket)
    {
        var buffer = new byte[4096];
        var result = await socket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(Timeout);
        Assert.Equal(WebSocketMessageType.Text, result.MessageType);
        return buffer[..result.Count];
    }

    internal sealed class RecordingProducer : EventHubProducerClient
    {
        public Channel<(EventData Event, string? Partition)> Events { get; } = Channel.CreateUnbounded<(EventData, string?)>();
        public Func<CancellationToken, Task> OnSend { get; init; } = _ => Task.CompletedTask;
        public Func<Task> OnDispose { get; init; } = () => Task.CompletedTask;
        public TaskCompletionSource DisposalStarted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public int DisposeCount { get; private set; }
        public bool Disposed { get; private set; }
        public Task<(EventData Event, string? Partition)> ReadAsync() => Events.Reader.ReadAsync().AsTask().WaitAsync(Timeout);
        public override Task SendAsync(IEnumerable<EventData> events, SendEventOptions options, CancellationToken cancellationToken = default)
        {
            Events.Writer.TryWrite((Assert.Single(events), options.PartitionKey));
            return OnSend(cancellationToken);
        }
        public override async ValueTask DisposeAsync()
        {
            Disposed = true;
            DisposeCount++;
            DisposalStarted.TrySetResult();
            await OnDispose();
        }
    }
}