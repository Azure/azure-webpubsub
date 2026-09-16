// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Azure.Identity;
using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Consumer;
using Azure.Messaging.WebPubSub.Client.Protobuf;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Xunit;
using ProtoData = Azure.Messaging.WebPubSub.Client.Protobuf.MessageData;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class EventHubLiveTests
{
    [EventHubFact]
    public Task RawClientEventsReachRealBrokerAndConsumer() => RunAsync(protobuf: false);

    [EventHubFact]
    public Task ProtobufMetadataReachesRealBrokerAndConsumer() => RunAsync(protobuf: true);

    private static async Task RunAsync(bool protobuf)
    {
        var local = Environment.GetEnvironmentVariable("AWPS_TEST_EVENTHUB_CONNECTION_STRING");
        var ns = Environment.GetEnvironmentVariable("AWPS_TEST_EVENTHUB_NAMESPACE");
        var hub = Environment.GetEnvironmentVariable("AWPS_TEST_EVENTHUB_NAME")!;
        var marker = Guid.NewGuid().ToString("N");
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        await using var consumer = local is not null
            ? new EventHubConsumerClient("$Default", local, hub)
            : new EventHubConsumerClient("$Default", ns, hub, new DefaultAzureCredential(),
                new EventHubConsumerClientOptions { ConnectionOptions = new() { TransportType = EventHubsTransportType.AmqpWebSockets } });
        var builder = EmulatorApplication.CreateBuilder(["--urls=http://127.0.0.1:0"]);
        builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:ConnectionString"] = local,
            ["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:FullyQualifiedNamespace"] = local is null ? ns : "",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:EventHubName"] = hub,
            ["WebPubSub:Hubs:chat:EventListeners:0:EventNameFilter:SystemEvents:0"] = "connected",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventNameFilter:SystemEvents:1"] = "disconnected",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventNameFilter:UserEventPattern"] = "message",
        });
        await using var app = EmulatorApplication.Build(builder);
        await app.StartAsync(timeout.Token);
        var endpoint = app.Urls.Single() + "/client/hubs/chat";
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(audience: endpoint,
            claims: [new Claim("sub", marker)], expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)), SecurityAlgorithms.HmacSha256)));
        using var socket = new ClientWebSocket();
        if (protobuf) socket.Options.AddSubProtocol(WebPubSubProtobufV1Protocol.SubprotocolName);
        var received = ReadAsync();
        await socket.ConnectAsync(new Uri(endpoint.Replace("http:", "ws:") + "?access_token=" + token), timeout.Token);
        var body = protobuf ? Any.Pack(new StringValue { Value = "real-event" }).ToByteArray() : "real-event"u8.ToArray();
        if (protobuf)
        {
            Assert.NotNull((await ReadClientAsync()).SystemMessage?.ConnectedMessage);
            await socket.SendAsync(new UpstreamMessage { EventMessage = new UpstreamMessage.Types.EventMessage
            {
                Event = "message", AckId = 1,
                Data = new ProtoData { ProtobufData = Any.Parser.ParseFrom(body) },
                Metadata = { ["TraceId"] = "first", ["traceid"] = "last", ["Tag"] = "", ["Values"] = " alpha, beta " },
            } }.ToByteArray(), WebSocketMessageType.Binary, true, timeout.Token);
            var ack = (await ReadClientAsync()).AckMessage;
            Assert.NotNull(ack);
            Assert.True(ack.Success);
            Assert.Equal(1UL, ack.AckId);
        }
        else await socket.SendAsync(body, WebSocketMessageType.Text, true, timeout.Token);
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", timeout.Token);
        var events = await received;
        Assert.Equal(new[] { "1", "2", "3" }, events.Select(item => (string)item.Data.Properties["cloudEvents:id"]).OrderBy(id => id));
        Assert.Single(events.Select(item => item.Partition.PartitionId).Distinct());
        var message = Assert.Single(events, item => (string)item.Data.Properties["cloudEvents:type"] == "azure.webpubsub.user.message").Data;
        Assert.Equal(body, message.EventBody.ToArray());
        Assert.Equal(protobuf ? "application/x-protobuf" : "text/plain", message.ContentType);
        Assert.Equal($"{message.Properties["cloudEvents:connectionid"]}/2", message.MessageId);
        if (protobuf)
        {
            Assert.Equal("last", message.Properties["x-webpubsub-metadata-traceid"]);
            Assert.Equal("", message.Properties["x-webpubsub-metadata-tag"]);
            Assert.Equal(" alpha, beta ", message.Properties["x-webpubsub-metadata-values"]);
            foreach (var item in events.Where(item => !ReferenceEquals(item.Data, message)))
                Assert.DoesNotContain(item.Data.Properties.Keys, key => key.StartsWith("x-webpubsub-metadata-", StringComparison.OrdinalIgnoreCase));
        }

        async Task<DownstreamMessage> ReadClientAsync()
        {
            var buffer = new byte[4096];
            var result = await socket.ReceiveAsync(buffer, timeout.Token);
            Assert.Equal(WebSocketMessageType.Binary, result.MessageType);
            Assert.True(result.EndOfMessage);
            return DownstreamMessage.Parser.ParseFrom(buffer, 0, result.Count);
        }

        async Task<List<PartitionEvent>> ReadAsync()
        {
            var results = new List<PartitionEvent>();
            await foreach (var item in consumer.ReadEventsAsync(startReadingAtEarliestEvent: true, cancellationToken: timeout.Token))
            {
                if (item.Data.Properties.TryGetValue("cloudEvents:userid", out var user) && (string)user == marker) results.Add(item);
                if (results.Count == 3) break;
            }
            return results;
        }
    }

    private sealed class EventHubFactAttribute : FactAttribute
    {
        public EventHubFactAttribute()
        {
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AWPS_TEST_EVENTHUB_NAME")) ||
                (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AWPS_TEST_EVENTHUB_NAMESPACE")) &&
                 string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AWPS_TEST_EVENTHUB_CONNECTION_STRING"))))
                Skip = "Requires an explicitly configured real Event Hub or running Event Hubs emulator; no broker is simulated.";
        }
    }
}