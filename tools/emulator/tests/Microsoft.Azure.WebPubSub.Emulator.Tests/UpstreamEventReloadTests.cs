// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Azure.Messaging.EventHubs.Producer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using RecordingProducer = Microsoft.Azure.WebPubSub.Emulator.Tests.EventHubNotifierTests.RecordingProducer;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class UpstreamEventReloadTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    [Theory]
    [InlineData("message", false)]
    [InlineData("message", true)]
    [InlineData("connected", false)]
    [InlineData("connected", true)]
    [InlineData("disconnected", false)]
    [InlineData("disconnected", true)]
    public async Task InflightEventKeepsItsRoutesAndNextEventUsesReloadedSettings(string eventName, bool changeFilter)
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = new RecordingProducer { OnSend = _ => release.Task };
        var second = new RecordingProducer();
        var http = new RecordingHttpHandler();
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventHandlers:0:UrlTemplate"] = "http://localhost/original",
            ["WebPubSub:Hubs:chat:EventHandlers:0:EventPattern"] = "message",
            ["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:0"] = "connected",
            ["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:1"] = "disconnected",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:FullyQualifiedNamespace"] = "local.test",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:EventHubName"] = "first",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventNameFilter:UserEventPattern"] = "message",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventNameFilter:SystemEvents:0"] = "connected",
            ["WebPubSub:Hubs:chat:EventListeners:0:EventNameFilter:SystemEvents:1"] = "disconnected",
        });
        builder.Services.AddSingleton<Func<EventHubEndpointOptions, EventHubProducerClient>>(_ =>
            endpoint => endpoint.EventHubName == "first" ? first : second);
        builder.Services.AddHttpClient(HttpUpstreamTrigger.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => http);
        await using var app = EmulatorApplication.Build(builder);
        await app.StartAsync().WaitAsync(Timeout);
        var dispatcher = app.Services.GetRequiredService<UpstreamEventDispatcher>();
        var connection = new UpstreamConnectionContext("connection", "chat", null, null, "localhost");

        var sending = DispatchAsync();
        try
        {
            var delivered = await first.ReadAsync();
            Assert.Equal("1", delivered.Event.Properties["cloudEvents:id"]);
            Assert.False(http.Requests.Reader.TryPeek(out _));

            builder.Configuration["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:EventHubName"] = "second";
            builder.Configuration["WebPubSub:Hubs:chat:EventHandlers:0:UrlTemplate"] = "http://localhost/updated";
            if (changeFilter)
            {
                builder.Configuration["WebPubSub:Hubs:chat:EventHandlers:0:EventPattern"] = "other";
                builder.Configuration["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:0"] = "connect";
                builder.Configuration["WebPubSub:Hubs:chat:EventHandlers:0:SystemEvents:1"] = "connect";
            }
            // Reload synchronously while delivery is blocked, without relying on watcher timing.
            ((IConfigurationRoot)builder.Configuration).Reload();
            Assert.False(sending.IsCompleted);
            Assert.False(http.Requests.Reader.TryPeek(out _));
        }
        finally { release.TrySetResult(); }

        await sending.WaitAsync(Timeout);
        Assert.True(http.Requests.Reader.TryRead(out var original));
        Assert.Equal(("/original", "1"), original);
        Assert.False(second.Events.Reader.TryPeek(out _));

        await DispatchAsync().WaitAsync(Timeout);
        var next = await second.ReadAsync();
        Assert.Equal("2", next.Event.Properties["cloudEvents:id"]);
        Assert.False(first.Events.Reader.TryPeek(out _));
        if (!changeFilter)
        {
            Assert.True(http.Requests.Reader.TryRead(out var updated));
            Assert.Equal(("/updated", "2"), updated);
        }
        Assert.False(http.Requests.Reader.TryPeek(out _));

        Task DispatchAsync() => eventName == "message"
            ? dispatcher.DispatchUserEventAsync(connection,
                new(eventName, new(MessageDataType.Text, "hello"u8.ToArray())), CancellationToken.None)
            : dispatcher.DispatchNotificationAsync(connection, eventName, "{}"u8.ToArray());
    }

    private sealed class RecordingHttpHandler : HttpMessageHandler
    {
        public Channel<(string Path, string EventId)> Requests { get; } = Channel.CreateUnbounded<(string, string)>();

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("") };
            if (request.Method == HttpMethod.Options)
                response.Headers.Add("WebHook-Allowed-Origin", "*");
            else
                Requests.Writer.TryWrite((request.RequestUri!.AbsolutePath, request.Headers.GetValues("ce-id").Single()));
            return Task.FromResult(response);
        }
    }
}
