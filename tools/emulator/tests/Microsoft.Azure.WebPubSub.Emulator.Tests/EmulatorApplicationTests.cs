// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class EmulatorApplicationTests
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(30);

    [Fact]
    public async Task EffectiveEndpointComesFromBoundAddress()
    {
        const string accessKey = "custom-emulator-access-key-1234567890";
        await using var application = EmulatorApplication.Build(
            [
                "--urls=http://127.0.0.1:0",
                $"--WebPubSub:AccessKey={accessKey}",
            ]);
        await application.StartAsync().WaitAsync(TestTimeout);

        var server = application.Services.GetRequiredService<IServer>();
        var address = Assert.Single(
            server.Features.Get<IServerAddressesFeature>()!.Addresses);
        var options = application.Services
            .GetRequiredService<IOptions<EmulatorOptions>>()
            .Value;

        Assert.NotEqual(0, new Uri(address).Port);
        Assert.Equal(
            $"Endpoint={new Uri(address).GetLeftPart(UriPartial.Authority)};" +
                $"AccessKey={accessKey};Version=1.0;",
            options.GetConnectionString(new Uri(address)));
    }

    [Theory]
    [InlineData(false, 60, false)]
    [InlineData(true, 60, true)]
    [InlineData(true, -10, false)]
    public async Task WebPubSubAudienceTokenRequiresExplicitCompatibilityMode(
        bool allowUnvalidatedEntraTokens,
        int expiresInMinutes,
        bool expected)
    {
        var builder = EmulatorApplication.CreateBuilder(
            [$"--WebPubSub:AllowUnvalidatedEntraTokens={allowUnvalidatedEntraTokens}"]);
        builder.WebHost.UseTestServer();
        await using var application = EmulatorApplication.Build(builder);
        await application.StartAsync().WaitAsync(TestTimeout);
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            audience: "https://webpubsub.azure.com",
            notBefore: now.AddMinutes(Math.Min(-1, expiresInMinutes - 1)),
            expires: now.AddMinutes(expiresInMinutes));
        var encodedToken = new JwtSecurityTokenHandler().WriteToken(token);
        var tokenService =
            application.Services.GetRequiredService<WebPubSubTokenService>();

        var actual = tokenService.ValidateRestToken(
            new Uri("http://localhost/api/hubs/chat/:send"),
            encodedToken);

        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData("too-short")]
    [InlineData("custom-emulator-access-key-12345;67890")]
    [InlineData(" custom-emulator-access-key-1234567890")]
    public async Task InvalidAccessKeyConfigurationIsRejected(string accessKey)
    {
        var builder = EmulatorApplication.CreateBuilder(
            [$"--WebPubSub:AccessKey={accessKey}"]);
        builder.WebHost.UseTestServer();
        await using var application = EmulatorApplication.Build(builder);

        var exception = await Assert.ThrowsAsync<OptionsValidationException>(
            () => application.StartAsync());

        Assert.Contains(
            "WebPubSub:AccessKey must be at least 32 UTF-8 bytes",
            exception.Message,
            StringComparison.Ordinal);
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
            "/api/hubs/chat/groups/group?api-version=2024-12-01");
        using var response = await application.GetTestClient().SendAsync(request).WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}