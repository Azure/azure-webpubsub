// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.TestHost;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public partial class RestApiTests
{
    [Theory]
    [InlineData("chat", "room%2Fpart", "room%2Fpart", true)]
    [InlineData("chat", "room%252Fpart", "room%2Fpart", true)]
    [InlineData("chat", "literal%2520value", "literal%20value", true)]
    [InlineData("chat", "room%20name", "room name", true)]
    [InlineData("chat", "room+part", "room+part", true)]
    [InlineData("chat%5B1%5D", "room%252Fpart", "room%2Fpart", true)]
    [InlineData("chat%5B1%5D", "room%2Fpart", "room%2Fpart", false)]
    [InlineData("chat%5B1%5D", "room+part", "room+part", false)]
    [InlineData("chat%5B1%5D", "room%3Fpart", "room?part", true)]
    [InlineData("chat%5B1%5D", "room%3Fpart", "room?part", false, true)]
    public async Task RestAudienceUsesPartiallyDecodedPathWithoutRawTargetFallback(
        string hubSegment, string groupSegment, string group, bool rawAudienceMatches, bool includeQuery = false)
    {
        await using var app = EmulatorApplication.Build(["--urls=http://127.0.0.1:0"]);
        await app.StartAsync().WaitAsync(TestTimeout);
        using var http = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
        var hub = Uri.UnescapeDataString(hubSegment);
        AddGroupMember(app, "member", hub: hub, group: group);
        var path = $"/api/hubs/{hubSegment}/groups/{groupSegment}/connections";
        var uri = new Uri(http.BaseAddress, path + (includeQuery ? "?maxpagesize=1" : ""));
        var expectedAudience = http.BaseAddress.GetLeftPart(UriPartial.Authority) +
            $"/api/hubs/{hub}/groups/{group}/connections";

        // With mixed escaping, neither the original nor a single URL decode necessarily
        // matches Request.Path. Supplying that path as the audience must still work.
        foreach (var audience in new[] { uri.AbsoluteUri, expectedAudience })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken(audience));
            using var response = await http.SendAsync(request).WaitAsync(TestTimeout);
            var expected = audience == uri.AbsoluteUri && !rawAudienceMatches
                ? HttpStatusCode.Unauthorized : HttpStatusCode.OK;
            Assert.Equal(expected, response.StatusCode);
        }
    }

    [Theory]
    [InlineData("http://", "", true)]
    [InlineData("https://", "?maxpagesize=99", true)]
    [InlineData("ws://", "/", true)]
    [InlineData("wss://", "/child", true)]
    [InlineData("ftp://", "", false)]
    [InlineData("http://", "Suffix", false)]
    [InlineData("http://", "%253Fquery", false)]
    public async Task RestAudienceMatchesSchemesAndResourceBoundaries(string scheme, string suffix, bool accepted)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, GroupMembersPath + "/?maxpagesize=1");
        var audience = scheme + "localhost" + GroupMembersPath + suffix;
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken(audience));
        using var response = await http.SendAsync(request).WaitAsync(TestTimeout);
        Assert.Equal(accepted ? HttpStatusCode.OK : HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RestAudienceMatchDoesNotBypassSignatureOrLifetime(bool expired)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        var key = expired ? EmulatorOptions.DefaultAccessKey : new string('x', 64);
        var token = new JwtSecurityToken(
            audience: "http://localhost" + GroupMembersPath,
            notBefore: DateTime.UtcNow.AddHours(-2),
            expires: expired ? DateTime.UtcNow.AddHours(-1) : DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256));
        using var request = new HttpRequestMessage(HttpMethod.Get, GroupMembersPath);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(token));
        using var response = await http.SendAsync(request).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}