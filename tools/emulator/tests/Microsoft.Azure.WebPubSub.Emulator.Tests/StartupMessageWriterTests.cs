// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.IO;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class StartupMessageWriterTests
{
    [Fact]
    public void WriteIncludesConnectionGuidance()
    {
        const string connectionString =
            "Endpoint=https://localhost:8443;AccessKey=local-key;Version=1.0;";
        using var writer = new StringWriter();

        StartupMessageWriter.Write(
            writer,
            ["http://127.0.0.1:8090"],
            connectionString,
            new Uri("https://localhost:8443"));

        var message = writer.ToString();
        Assert.Contains(
            "Connection string:" + Environment.NewLine + $"  {connectionString}",
            message);
        Assert.Contains(
            "Client endpoint:" + Environment.NewLine +
                "  wss://localhost:8443/client/hubs/{hub}?access_token={token}",
            message);
        Assert.Contains("http://127.0.0.1:8090/api/health", message);
    }

    [Theory]
    [InlineData("http://0.0.0.0:8080", "http://localhost:8080/")]
    [InlineData("http://[::]:8090", "http://localhost:8090/")]
    [InlineData("https://0.0.0.0:8443", "https://localhost:8443/")]
    [InlineData("http://127.0.0.1:8090", "http://127.0.0.1:8090/")]
    [InlineData("http://emulator:8080", "http://emulator:8080/")]
    [InlineData("http://[::1]:8080", "http://[::1]:8080/")]
    public void ConnectableEndpointPreservesSpecificHostsAndPorts(string boundAddress, string expected)
    {
        Assert.Equal(new Uri(expected), StartupMessageWriter.GetConnectableEndpoint(new Uri(boundAddress)));
    }

    [Theory]
    [InlineData("http://0.0.0.0:8080")]
    [InlineData("http://[::]:8080")]
    public void WildcardListenersIncludeUsableLocalGuidance(string boundAddress)
    {
        using var writer = new StringWriter();
        var endpoint = StartupMessageWriter.GetConnectableEndpoint(new Uri(boundAddress));
        var options = new EmulatorOptions();

        StartupMessageWriter.Write(writer, [boundAddress], options.GetConnectionString(endpoint), endpoint);

        var message = writer.ToString();
        Assert.Contains($"Listening on:{Environment.NewLine}  {boundAddress}", message);
        Assert.Contains("Endpoint=http://localhost:8080;", message);
        Assert.Contains("ws://localhost:8080/client/hubs/{hub}", message);
        Assert.Contains("http://localhost:8080/api/health", message);
        Assert.Contains("reachable host and published port", message);
    }

    [Fact]
    public void WriteIncludesGeneratedDefaultConnectionString()
    {
        const string connectionString =
            "Endpoint=http://localhost:8080;" +
            $"AccessKey={EmulatorOptions.DefaultAccessKey};Version=1.0;";
        using var writer = new StringWriter();

        StartupMessageWriter.Write(
            writer,
            ["http://localhost:8080"],
            connectionString,
            new Uri("http://localhost:8080"));

        Assert.Contains(connectionString, writer.ToString());
        Assert.DoesNotContain("reachable host and published port", writer.ToString());
    }
}