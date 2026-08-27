// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class EmulatorApplicationTests
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(30);

    [Theory]
    [InlineData("Endpoint=http://localhost:8080/base;AccessKey=key;Version=1.0;")]
    [InlineData("Endpoint=http://localhost:8080?query=value;AccessKey=key;Version=1.0;")]
    [InlineData("Endpoint=ftp://localhost:8080;AccessKey=key;Version=1.0;")]
    public void ConnectionStringEndpointMustBeAnOrigin(string connectionString)
    {
        Assert.False(WebPubSubTokenService.IsValidConnectionString(connectionString));
    }

    [Fact]
    public async Task ServiceHealthEndpoint_WithoutApiVersionFallsBackToLatest()
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var application = EmulatorApplication.Build(builder);
        await application.StartAsync().WaitAsync(TestTimeout);

        using var request = new HttpRequestMessage(
            HttpMethod.Head,
            "/api/health");
        using var response = await application.GetTestClient().SendAsync(request).WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            "2021-10-01, 2022-11-01, 2023-07-01, 2024-01-01, 2024-12-01",
            Assert.Single(response.Headers.GetValues("api-supported-versions")));
    }

    [Fact]
    public async Task OtherServiceApiEndpoint_HeadReturnsNotFound()
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var application = EmulatorApplication.Build(builder);
        await application.StartAsync().WaitAsync(TestTimeout);

        using var request = new HttpRequestMessage(
            HttpMethod.Head,
            "/api/hubs/chat/connections/connection?api-version=2024-12-01");
        using var response = await application.GetTestClient().SendAsync(request).WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}