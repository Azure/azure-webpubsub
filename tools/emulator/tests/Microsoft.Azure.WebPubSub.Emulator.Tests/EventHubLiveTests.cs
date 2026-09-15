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
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class EventHubLiveTests
{
    [EventHubFact]
    public async Task RawClientEventsReachRealBrokerAndConsumer()
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
        var received = ReadAsync();
        await socket.ConnectAsync(new Uri(endpoint.Replace("http:", "ws:") + "?access_token=" + token), timeout.Token);
        await socket.SendAsync("real-event"u8.ToArray(), WebSocketMessageType.Text, true, timeout.Token);
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", timeout.Token);
        var events = await received;
        Assert.Equal(new[] { "1", "2", "3" }, events.Select(item => (string)item.Data.Properties["cloudEvents:id"]).OrderBy(id => id));
        Assert.Single(events.Select(item => item.Partition.PartitionId).Distinct());
        var message = Assert.Single(events, item => (string)item.Data.Properties["cloudEvents:type"] == "azure.webpubsub.user.message").Data;
        Assert.Equal("real-event", message.EventBody.ToString());
        Assert.Equal("text/plain", message.ContentType);
        Assert.Equal($"{message.Properties["cloudEvents:connectionid"]}/2", message.MessageId);

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