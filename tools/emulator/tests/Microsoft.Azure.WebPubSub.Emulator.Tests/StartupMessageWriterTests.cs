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
            new Uri("https://localhost:8443"),
            showConnectionString: false);

        var message = writer.ToString();
        Assert.Contains(
            "Connection string:" + Environment.NewLine + "  Configured (AccessKey hidden).",
            message);
        Assert.DoesNotContain("local-key", message);
        Assert.Contains(
            "Client endpoint:" + Environment.NewLine +
                "  wss://localhost:8443/client/hubs/{hub}?access_token={token}",
            message);
        Assert.Contains("http://127.0.0.1:8090/api/health", message);
    }

    [Fact]
    public void WriteIncludesBuiltInConnectionString()
    {
        using var writer = new StringWriter();

        StartupMessageWriter.Write(
            writer,
            ["http://localhost:8080"],
            EmulatorOptions.DefaultConnectionString,
            new Uri("http://localhost:8080"),
            showConnectionString: true);

        Assert.Contains(EmulatorOptions.DefaultConnectionString, writer.ToString());
    }
}