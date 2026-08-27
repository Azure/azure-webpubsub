// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Net;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class EmulatorApplicationTests
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(30);

    [Fact]
    public async Task HealthEndpoint_ReturnsHealthyStatus()
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var application = EmulatorApplication.Build(builder);
        await application.StartAsync().WaitAsync(TestTimeout);

        using var response = await application.GetTestClient().GetAsync("/health").WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.NotNull(payload);
        Assert.Equal("Healthy", payload.Status);
    }

    private sealed record HealthResponse(string Status);
}