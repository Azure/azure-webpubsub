// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class EmulatorOptionsValidationTests
{
    [Theory]
    [InlineData("not-a-connection-string")]
    [InlineData("Endpoint=relative;AccessKey=key;")]
    [InlineData("Endpoint=http://localhost;")]
    [InlineData("AccessKey=key;")]
    public async Task ConnectionString_MustBeValid(string connectionString)
    {
        await AssertInvalidAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:ConnectionString"] = connectionString,
        });
    }

    [Theory]
    [InlineData("00:00:00")]
    [InlineData("-00:00:01")]
    public async Task EventHandlerTimeout_MustBePositive(string timeout)
    {
        await AssertInvalidAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:EventHandlerTimeout"] = timeout,
        });
    }

    [Theory]
    [InlineData("")]
    [InlineData("relative/events/{event}")]
    [InlineData("ftp://localhost/events/{event}")]
    public async Task EventHandlerUrl_MustBeAbsoluteHttpOrHttps(string urlTemplate)
    {
        await AssertInvalidAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventHandlers:0:UrlTemplate"] = urlTemplate,
        });
    }

    [Fact]
    public async Task EventHandlerAuth_MustBeSupportedAndComplete()
    {
        await AssertInvalidAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventHandlers:0:UrlTemplate"] = "https://localhost/events/{event}",
            ["WebPubSub:Hubs:chat:EventHandlers:0:Auth:Type"] = "ApiKey",
        });
        await AssertInvalidAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventHandlers:0:UrlTemplate"] = "https://localhost/events/{event}",
            ["WebPubSub:Hubs:chat:EventHandlers:0:Auth:Type"] = "ManagedIdentity",
        });
    }

    [Fact]
    public async Task EventHubListener_RequiresNamespaceAndEventHubName()
    {
        await AssertInvalidAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:EventHubName"] = "events",
        });
        await AssertInvalidAsync(new Dictionary<string, string?>
        {
            ["WebPubSub:Hubs:chat:EventListeners:0:EventHubEndpoint:FullyQualifiedNamespace"] =
                "example.servicebus.windows.net",
        });
    }

    private static async Task AssertInvalidAsync(IReadOnlyDictionary<string, string?> configuration)
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(configuration);
        await using var application = EmulatorApplication.Build(builder);

        await Assert.ThrowsAsync<OptionsValidationException>(() => application.StartAsync());
    }
}
