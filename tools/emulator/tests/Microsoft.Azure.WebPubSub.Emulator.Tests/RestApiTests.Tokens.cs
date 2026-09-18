// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using Azure;
using Azure.Core;
using Azure.Core.Pipeline;
using Azure.Messaging.WebPubSub;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public partial class RestApiTests
{
    [Fact]
    public async Task TokenCredentialSdkGeneratesUsableClientToken()
    {
        var builder = EmulatorApplication.CreateBuilder(["--WebPubSub:AllowUnvalidatedEntraTokens=true"]);
        builder.WebHost.UseTestServer();
        await using var app = EmulatorApplication.Build(builder);
        await app.StartAsync().WaitAsync(TestTimeout);
        var options = new WebPubSubServiceClientOptions { Transport = new HttpClientTransport(app.GetTestClient()) };
        var service = new WebPubSubServiceClient(new Uri("https://localhost"), "CHAT", new LocalTestCredential(), options);
        var before = DateTime.UtcNow;
        var uri = await service.GetClientAccessUriAsync(
            expiresAfter: TimeSpan.FromMinutes(7), userId: "用户/a+b", roles: ["webpubsub.sendToGroup", "webpubsub.joinLeaveGroup"],
            groups: ["room", "a/b"]).WaitAsync(TestTimeout);
        var client = app.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
        using var socket = await client.ConnectAsync(uri, CancellationToken.None).WaitAsync(TestTimeout);
        using var connected = await ReceiveJsonAsync(socket);
        Assert.Equal("用户/a+b", connected.RootElement.GetProperty("userId").GetString());
        var id = connected.RootElement.GetProperty("connectionId").GetString()!;
        Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(Hub, id, out var connection));
        Assert.Contains("room", connection.Groups.Keys);
        Assert.Contains("a/b", connection.Groups.Keys);
        Assert.True(connection.GetPermissions(ConnectionRoleAction.SendToGroup).Check("any"));
        Assert.True(connection.GetPermissions(ConnectionRoleAction.JoinLeaveGroup).Check("any"));
        var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(query["access_token"].ToString());
        Assert.Equal("https://localhost/client/hubs/chat", Assert.Single(jwt.Audiences));
        // The SDK truncates the remaining lifetime to whole minutes before calling REST.
        Assert.InRange(jwt.ValidTo, before.AddMinutes(6).AddSeconds(-1), DateTime.UtcNow.AddMinutes(7));
    }

    [Theory]
    [InlineData("", HttpStatusCode.OK)]
    [InlineData("?minutesToExpire=1", HttpStatusCode.OK)]
    [InlineData("?minutesToExpire=2147483647", HttpStatusCode.OK)]
    [InlineData("?clientType=default", HttpStatusCode.OK)]
    [InlineData("?minutesToExpire=0", HttpStatusCode.BadRequest)]
    [InlineData("?minutesToExpire=-1", HttpStatusCode.BadRequest)]
    [InlineData("?minutesToExpire=no", HttpStatusCode.BadRequest)]
    [InlineData("?minutesToExpire=2147483648", HttpStatusCode.BadRequest)]
    [InlineData("?group=room&group=%20", HttpStatusCode.BadRequest)]
    [InlineData("?clientType=unknown", HttpStatusCode.BadRequest)]
    [InlineData("?clientType=mqtt", HttpStatusCode.NotImplemented)]
    [InlineData("?api-version=2099-01-01", HttpStatusCode.BadRequest)]
    public async Task GenerateTokenValidatesQuery(string query, HttpStatusCode status)
    {
        var builder = EmulatorApplication.CreateBuilder(["--WebPubSub:AllowUnvalidatedEntraTokens=true"]);
        builder.WebHost.UseTestServer();
        await using var app = EmulatorApplication.Build(builder);
        await app.StartAsync().WaitAsync(TestTimeout);
        using var request = CreateTokenGenerationRequest(query);
        using var response = await app.GetTestClient().SendAsync(request).WaitAsync(TestTimeout);
        Assert.Equal(status, response.StatusCode);
        if (status == HttpStatusCode.OK)
        {
            using var body = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var jwt = new JwtSecurityTokenHandler().ReadJwtToken(body.RootElement.GetProperty("token").GetString());
            var minutes = query.StartsWith("?minutesToExpire=", StringComparison.Ordinal)
                ? int.Parse(query["?minutesToExpire=".Length..]) : 60;
            Assert.Equal(TimeSpan.FromMinutes(minutes), jwt.ValidTo - jwt.ValidFrom);
            Assert.DoesNotContain(jwt.Claims, claim => claim.Type is "sub" or "role" or "webpubsub.group");
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task GenerateTokenRequiresExplicitEntraCompatibility(bool enabled)
    {
        var builder = EmulatorApplication.CreateBuilder([$"--WebPubSub:AllowUnvalidatedEntraTokens={enabled}"]);
        builder.WebHost.UseTestServer();
        await using var app = EmulatorApplication.Build(builder);
        await app.StartAsync().WaitAsync(TestTimeout);
        using var entra = CreateTokenGenerationRequest("");
        using var response = await app.GetTestClient().SendAsync(entra).WaitAsync(TestTimeout);
        Assert.Equal(enabled ? HttpStatusCode.OK : HttpStatusCode.Unauthorized, response.StatusCode);
        using var key = CreateAuthorizedRequest(HttpMethod.Post, "/api/hubs/chat/:generateToken");
        using var denied = await app.GetTestClient().SendAsync(key).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        using var anonymous = await app.GetTestClient().PostAsync("/api/hubs/chat/:generateToken", null).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        using var expired = CreateTokenGenerationRequest("");
        expired.Headers.Authorization = new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(
            new JwtSecurityToken(audience: "https://webpubsub.azure.com", notBefore: DateTime.UtcNow.AddHours(-2), expires: DateTime.UtcNow.AddHours(-1))));
        using var expiredResponse = await app.GetTestClient().SendAsync(expired).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, expiredResponse.StatusCode);
    }

    private static HttpRequestMessage CreateTokenGenerationRequest(string query)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/hubs/CHAT/:generateToken" + query);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", LocalTestCredential.Token);
        return request;
    }

    private sealed class LocalTestCredential : TokenCredential
    {
        // Test input for the explicitly unvalidated compatibility mode, not a real Entra identity.
        internal static string Token => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            audience: "https://webpubsub.azure.com", notBefore: DateTime.UtcNow.AddMinutes(-1), expires: DateTime.UtcNow.AddHours(1)));
        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            new(Token, DateTimeOffset.UtcNow.AddHours(1));
        public override ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            ValueTask.FromResult(GetToken(requestContext, cancellationToken));
    }
}