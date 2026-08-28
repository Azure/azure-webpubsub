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
    }
}