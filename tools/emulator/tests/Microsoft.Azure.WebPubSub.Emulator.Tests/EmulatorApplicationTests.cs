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

    [Fact]
    public async Task ServiceHealthEndpoint_HeadReturnsOk()
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var application = EmulatorApplication.Build(builder);
        await application.StartAsync().WaitAsync(TestTimeout);

        using var request = new HttpRequestMessage(
            HttpMethod.Head,
            "/api/health?api-version=2024-12-01");
        using var response = await application.GetTestClient().SendAsync(request).WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}