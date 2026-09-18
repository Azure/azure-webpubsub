// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Azure.Messaging.WebPubSub;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public partial class RestApiTests
{
    private const string GroupMembersPath = "/api/hubs/CHAT/groups/room/connections";

    [Fact]
    public async Task GroupMembersOfficialSdkEnumeratesRealConnectionsAndHonorsTotalLimit()
    {
        await using var app = EmulatorApplication.Build(["--urls=http://127.0.0.1:0"]);
        await app.StartAsync().WaitAsync(TestTimeout);
        var connectionString = $"Endpoint={app.Urls.Single()};AccessKey={EmulatorOptions.DefaultAccessKey}";
        var service = new WebPubSubServiceClient(connectionString, "CHAT");
        var sockets = new List<ClientWebSocket>();
        var expected = new SortedDictionary<string, string?>(StringComparer.InvariantCulture);
        try
        {
            foreach (var user in new string?[] { null, "alice", "alice", "ALICE" })
                expected.Add(await OpenAsync(service, "room", user), user);
            await OpenAsync(service, "ROOM", "excluded");
            await OpenAsync(new WebPubSubServiceClient(connectionString, "other"), "room", "excluded");
            foreach (var top in new int?[] { null, 1, 2, 3, 4, 5, int.MaxValue })
            {
                using var timeout = new CancellationTokenSource(TestTimeout);
                var actual = new List<WebPubSubGroupMember>();
                var pageCount = 0;
                await foreach (var page in service.ListConnectionsInGroupAsync("room", maxpagesize: 2, maxCount: top)
                    .AsPages().WithCancellation(timeout.Token))
                {
                    Assert.InRange(page.Values.Count, 1, 2);
                    actual.AddRange(page.Values);
                    Assert.True(++pageCount <= 2, "SDK enumeration must terminate at the total limit.");
                }
                var selected = expected.Take(top ?? expected.Count).ToArray();
                Assert.Equal(selected.Select(member => member.Key), actual.Select(member => member.ConnectionId));
                Assert.Equal(selected.Select(member => member.Value), actual.Select(member => member.UserId));
            }
            Assert.Equal(expected.Keys.Take(2), service.ListConnectionsInGroup("room", maxpagesize: 1, maxCount: 2)
                .Select(member => member.ConnectionId));
        }
        finally
        {
            foreach (var socket in sockets) socket.Dispose();
        }

        async Task<string> OpenAsync(WebPubSubServiceClient sdk, string group, string? user)
        {
            var socket = new ClientWebSocket();
            sockets.Add(socket);
            socket.Options.AddSubProtocol(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
            await socket.ConnectAsync(sdk.GetClientAccessUri(userId: user, groups: [group]), CancellationToken.None).WaitAsync(TestTimeout);
            using var connected = await ReceiveJsonAsync(socket);
            return connected.RootElement.GetProperty("connectionId").GetString()!;
        }
    }

    [Theory]
    [InlineData("", 200, 201)]
    [InlineData("&maxpagesize=1", 1, 201)]
    [InlineData("&top=1", 200, 1)]
    [InlineData("&maxpagesize=2&top=3", 2, 3)]
    [InlineData("&maxpagesize=200&top=200", 200, 200)]
    [InlineData("&maxpagesize=200&top=201", 200, 201)]
    [InlineData("&maxpagesize=200&top=2147483647", 200, 201)]
    public async Task GroupMembersHttpTraversalPreservesLimitsAndNullableUserIds(string query, int pageSize, int total)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        // Real logical connections with deterministic IDs exercise ordering and the 200-member boundary.
        var expected = Enumerable.Range(0, 201).Select(i => AddGroupMember(app, $"{i:D3}", i % 2 == 0 ? null : "alice")).ToArray();
        string? next = GroupMembersPath + "?api-version=2024-12-01" + query;
        var originalTop = QueryHelpers.ParseQuery("?" + query.TrimStart('&')).GetValueOrDefault("top").FirstOrDefault();
        var actual = new List<string>();
        do
        {
            var page = await ReadGroupMembersAsync(http, next!);
            var members = page.GetProperty("value").EnumerateArray().ToArray();
            Assert.Equal(Math.Min(pageSize, total - actual.Count), members.Length);
            foreach (var member in members)
            {
                var id = member.GetProperty("connectionId").GetString()!;
                Assert.Equal(expected.Single(connection => connection.ConnectionId == id).UserId, member.GetProperty("userId").GetString());
                actual.Add(id);
            }
            next = page.GetProperty("nextLink").GetString();
            if (next is not null)
            {
                var uri = new Uri(next, UriKind.Absolute);
                Assert.Equal("http://localhost", uri.GetLeftPart(UriPartial.Authority));
                Assert.Equal(GroupMembersPath, uri.AbsolutePath);
                var parameters = QueryHelpers.ParseQuery(uri.Query);
                Assert.Equal("2024-12-01", parameters["api-version"]);
                Assert.Equal(pageSize.ToString(), parameters["maxpagesize"]);
                Assert.Equal(originalTop is null ? null : (int.Parse(originalTop) - actual.Count).ToString(), parameters.GetValueOrDefault("top").FirstOrDefault());
                Assert.False(string.IsNullOrEmpty(parameters["continuationToken"]));
                Assert.NotEqual(actual[^1], parameters["continuationToken"].ToString());
                Assert.True(actual.Count < total, "No continuation after top is exhausted or membership ends.");
            }
        } while (next is not null);
        Assert.Equal(expected.Take(total).Select(connection => connection.ConnectionId), actual);
    }

    [Fact]
    public async Task GroupMembersKeysetSurvivesDeletedCursorAndInsertionsWithoutOffsetShifts()
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        var manager = app.Services.GetRequiredService<ConnectionManager>();
        var original = new[] { "h", "f", "d", "b", "D" }.Select(id => AddGroupMember(app, id)).ToArray();
        var snapshot = manager.GetGroupMembers(Hub, "room", null, 3);
        var first = await ReadGroupMembersAsync(http, GroupMembersPath + "?maxpagesize=2");
        Assert.Equal(new[] { "b", "d" }, GroupMemberIds(first));
        foreach (var connection in original.Where(connection => connection.ConnectionId is "b" or "d" or "f"))
            manager.Remove(connection);
        foreach (var id in new[] { "a", "c", "z" }) AddGroupMember(app, id);
        Assert.Equal(new[] { "b", "d", "D" }, snapshot.Select(member => member.ConnectionId));
        var second = await ReadGroupMembersAsync(http, first.GetProperty("nextLink").GetString()!);
        Assert.Equal(new[] { "D", "h" }, GroupMemberIds(second));
        var third = await ReadGroupMembersAsync(http, second.GetProperty("nextLink").GetString()!);
        Assert.Equal(new[] { "z" }, GroupMemberIds(third));
        Assert.Null(third.GetProperty("nextLink").GetString());
        manager.RemoveConnectionsFromGroups(Hub, ["room"], null);
        var emptied = await ReadGroupMembersAsync(http, first.GetProperty("nextLink").GetString()!);
        Assert.Empty(GroupMemberIds(emptied));
        Assert.Null(emptied.GetProperty("nextLink").GetString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("2021-10-01")]
    [InlineData("2022-11-01")]
    [InlineData("2023-07-01")]
    [InlineData("2024-01-01")]
    [InlineData("2024-12-01")]
    public async Task GroupMembersSupportVersionsAndReturnEmptyForMissingScopes(string? version)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        AddGroupMember(app, "a");
        AddGroupMember(app, "b");
        var suffix = "?maxpagesize=1" + (version is null ? "" : $"&api-version={version}");
        var first = await ReadGroupMembersAsync(http, GroupMembersPath + suffix);
        var next = first.GetProperty("nextLink").GetString()!;
        Assert.Equal("2024-12-01", QueryHelpers.ParseQuery(new Uri(next).Query)["api-version"]);
        var second = await ReadGroupMembersAsync(http, next.Replace("/CHAT/", "/chat/"));
        Assert.Equal(new[] { "b" }, GroupMemberIds(second));
        foreach (var path in new[] { GroupMembersPath.Replace("/CHAT/", "/empty/"), GroupMembersPath.Replace("/room/", "/ROOM/") })
        {
            var empty = await ReadGroupMembersAsync(http, path + suffix);
            Assert.Empty(GroupMemberIds(empty));
            Assert.Null(empty.GetProperty("nextLink").GetString());
        }
    }

    [Theory]
    [InlineData("maxpagesize=0")]
    [InlineData("maxpagesize=-1")]
    [InlineData("maxpagesize=201")]
    [InlineData("maxpagesize=2147483648")]
    [InlineData("maxpagesize=1.5")]
    [InlineData("maxpagesize=invalid")]
    [InlineData("maxpagesize=")]
    [InlineData("maxpagesize=1&maxpagesize=2")]
    [InlineData("top=0")]
    [InlineData("top=-1")]
    [InlineData("top=2147483648")]
    [InlineData("top=1.5")]
    [InlineData("top=invalid")]
    [InlineData("top=")]
    [InlineData("top=1&top=2")]
    [InlineData("continuationToken=a&continuationToken=b")]
    [InlineData("api-version=2099-01-01")]
    [InlineData("api-version=2024-12-01&api-version=2024-12-01")]
    public async Task GroupMembersRejectInvalidQuery(string query)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        await ReadGroupMembersAsync(http, GroupMembersPath + "?" + query, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GroupMembersValidatePathsAndRequireAuthorizationForEveryPage()
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        AddGroupMember(app, "a");
        AddGroupMember(app, "b");
        var first = await ReadGroupMembersAsync(http, GroupMembersPath + "?maxpagesize=1");
        var next = first.GetProperty("nextLink").GetString()!;
        foreach (var invalid in new[]
        {
            GroupMembersPath.Replace("/CHAT/", "/1invalid/"), GroupMembersPath.Replace("/room/", "/%20/"),
            GroupMembersPath.Replace("/room/", $"/{new string('g', 1025)}/"),
        })
            await ReadGroupMembersAsync(http, invalid, HttpStatusCode.BadRequest);
        using var anonymous = await http.GetAsync(GroupMembersPath).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        using var wrongAudience = CreateAuthorizedRequest(HttpMethod.Get, GroupMembersPath.Replace("/CHAT/", "/other/") + "?maxpagesize=1");
        wrongAudience.RequestUri = new Uri(next);
        using var denied = await http.SendAsync(wrongAudience).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        using var samePathAudience = CreateAuthorizedRequest(HttpMethod.Get, GroupMembersPath + "?maxpagesize=1");
        samePathAudience.RequestUri = new Uri(next);
        using var allowed = await http.SendAsync(samePathAudience).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        Assert.Equal(new[] { "b" }, GroupMemberIds(await ReadGroupMembersAsync(http, next)));
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("garbage")]
    [InlineData("e30")]
    [InlineData("%/+?#&=")]
    [InlineData("b")]
    public async Task GroupMembersRejectUnprotectedContinuationTokens(string cursor)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        AddGroupMember(app, "b");
        await ReadGroupMembersAsync(http, GroupMembersPath + "?continuationToken=" + Uri.EscapeDataString(cursor), HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GroupMembersRejectOversizedContinuationTokens()
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        AddGroupMember(app, "a");
        await ReadGroupMembersAsync(http, GroupMembersPath + "?continuationToken=" + new string('z', 2049), HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GroupMembersRejectTokensFromDifferentProtectionKeys()
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        AddGroupMember(app, "a");
        AddGroupMember(app, "b");
        var otherProtector = new EphemeralDataProtectionProvider().CreateProtector("WebPubSub.GroupMembers.v1", Hub, "room");
        var cursor = otherProtector.Protect("a");
        await ReadGroupMembersAsync(http, GroupMembersPath + "?continuationToken=" + Uri.EscapeDataString(cursor), HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GroupMembersRejectModifiedAndWrongScopeTokens()
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        AddGroupMember(app, "a");
        AddGroupMember(app, "b");
        AddGroupMember(app, "c", group: "ROOM");
        AddGroupMember(app, "d", hub: "other");
        var first = await ReadGroupMembersAsync(http, GroupMembersPath + "?maxpagesize=1");
        var next = first.GetProperty("nextLink").GetString()!;
        var token = QueryHelpers.ParseQuery(new Uri(next).Query)["continuationToken"].ToString();
        var modified = token[..(token.Length / 2)] + (token[token.Length / 2] == 'A' ? 'B' : 'A') + token[(token.Length / 2 + 1)..];
        foreach (var invalid in new[]
        {
            next.Replace(token, modified), next.Replace("/room/", "/ROOM/"),
            next.Replace("/CHAT/", "/other/"), next.Replace("/room/", "/missing/"),
        })
            await ReadGroupMembersAsync(http, invalid, HttpStatusCode.BadRequest);
        Assert.Equal(new[] { "b" }, GroupMemberIds(await ReadGroupMembersAsync(http, next.Replace("/CHAT/", "/chat/"))));
    }

    [Theory]
    [InlineData("room%2Fpart", "room%2Fpart", "room%2Fpart")]
    [InlineData("room%2fpart", "room%2fpart", "room%2fpart")]
    [InlineData("room%252Fpart", "room%2Fpart", "room%2Fpart")]
    [InlineData("room%20%2B%20%E4%BD%A0%E5%A5%BD%3F%23%25", "room + 你好?#%", "room%20+%20%E4%BD%A0%E5%A5%BD%3F%23%25", false)]
    [InlineData("room+part", "room+part", "room+part")]
    public async Task GroupMembersKestrelUsesLegacyPathsAcrossPages(string segment, string group, string nextSegment, bool rawNextAudienceMatches = true)
    {
        await using var app = EmulatorApplication.Build(["--urls=http://127.0.0.1:0"]);
        await app.StartAsync().WaitAsync(TestTimeout);
        using var http = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
        var ids = new[] { "a%/+?#&=你好", "b", "c" };
        foreach (var id in ids) AddGroupMember(app, id, group: group);
        AddGroupMember(app, "excluded", group: "room/part");
        var path = $"/api/hubs/CHAT/groups/{segment}/connections";
        var nextPath = $"/api/hubs/CHAT/groups/{nextSegment}/connections";
        var pathAudience = http.BaseAddress.GetLeftPart(UriPartial.Authority) + $"/api/hubs/CHAT/groups/{group}/connections";
        string? next = path + "?maxpagesize=1&api-version=2024-12-01";
        foreach (var expected in ids)
        {
            var page = await ReadGroupMembersAsync(http, next!, omitAudienceQuery: true,
                audienceOverride: rawNextAudienceMatches ? null : pathAudience);
            Assert.Equal(new[] { expected }, GroupMemberIds(page));
            next = page.GetProperty("nextLink").GetString();
            if (next is not null)
            {
                Assert.StartsWith(http.BaseAddress.GetLeftPart(UriPartial.Authority) + nextPath + "?", next);
                var token = QueryHelpers.ParseQuery(new Uri(next).Query)["continuationToken"].ToString();
                Assert.False(string.IsNullOrEmpty(token));
                Assert.NotEqual(expected, token);
                if (!rawNextAudienceMatches)
                {
                    // Legacy reconstruction emits a literal '+'. Decoding this audience
                    // changes it to a space, so callers need the partially decoded path audience.
                    using var request = new HttpRequestMessage(HttpMethod.Get, next);
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer",
                        CreateToken(new Uri(next).GetLeftPart(UriPartial.Path)));
                    using var response = await http.SendAsync(request).WaitAsync(TestTimeout);
                    Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
                }
            }
        }
        Assert.Null(next);
    }

    [Fact]
    public async Task GroupMembersLegacyNextLinkDoesNotPreserveDoubleEncodedSpace()
    {
        await using var app = EmulatorApplication.Build(["--urls=http://127.0.0.1:0"]);
        await app.StartAsync().WaitAsync(TestTimeout);
        using var http = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
        AddGroupMember(app, "a", group: "literal%20value");
        AddGroupMember(app, "b", group: "literal%20value");
        AddGroupMember(app, "other", group: "literal value");
        var first = await ReadGroupMembersAsync(http, "/api/hubs/CHAT/groups/literal%2520value/connections?maxpagesize=1");
        Assert.Equal(new[] { "a" }, GroupMemberIds(first));
        var next = first.GetProperty("nextLink").GetString()!;
        Assert.Equal("/api/hubs/CHAT/groups/literal%20value/connections", new Uri(next).AbsolutePath);
        // The legacy URL now identifies a different group. Protected cursors reject that scope.
        await ReadGroupMembersAsync(http, next, HttpStatusCode.BadRequest, omitAudienceQuery: true);
    }

    [Fact]
    public async Task GroupMembersNextLinkIncludesPathBaseAndLocalPort()
    {
        var builder = EmulatorApplication.CreateBuilder(["--urls=http://127.0.0.1:0"]);
        builder.Services.AddSingleton<Microsoft.AspNetCore.Hosting.IStartupFilter>(new PaginationPathBaseStartupFilter());
        await using var app = EmulatorApplication.Build(builder);
        await app.StartAsync().WaitAsync(TestTimeout);
        using var http = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
        AddGroupMember(app, "a");
        AddGroupMember(app, "b");
        var audience = http.BaseAddress.GetLeftPart(UriPartial.Authority) + GroupMembersPath;
        var first = await ReadGroupMembersAsync(http, "/prefix" + GroupMembersPath + "?maxpagesize=1", audienceOverride: audience);
        var next = first.GetProperty("nextLink").GetString()!;
        Assert.StartsWith(http.BaseAddress.GetLeftPart(UriPartial.Authority) + "/prefix" + GroupMembersPath + "?", next);
        Assert.Equal(new[] { "b" }, GroupMemberIds(await ReadGroupMembersAsync(http, next, audienceOverride: audience)));
    }

    private sealed class PaginationPathBaseStartupFilter : Microsoft.AspNetCore.Hosting.IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.UsePathBase("/prefix");
            next(app);
        };
    }

    private static LogicalConnection AddGroupMember(WebApplication app, string id, string? user = null, string hub = Hub, string group = "room")
    {
        var manager = app.Services.GetRequiredService<ConnectionManager>();
        var principal = new ClaimsPrincipal(new ClaimsIdentity(user is null ? [] : new[] { new Claim("sub", user) }));
        var connection = manager.Create(id, hub, principal, "localhost");
        Assert.True(connection.TryAddToGroup(group));
        Assert.True(manager.TryActivate(connection));
        return connection;
    }

    private static async Task<JsonElement> ReadGroupMembersAsync(HttpClient http, string path, HttpStatusCode expected = HttpStatusCode.OK, bool omitAudienceQuery = false, string? audienceOverride = null)
    {
        var uri = new Uri(http.BaseAddress!, path);
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        // Exercise both full-URI and path-only audiences; query values do not scope REST access.
        var audience = audienceOverride ?? (omitAudienceQuery ? uri.GetLeftPart(UriPartial.Path) : uri.AbsoluteUri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken(audience));
        using var response = await http.SendAsync(request).WaitAsync(TestTimeout);
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using var document = JsonDocument.Parse(await response.Content.ReadAsByteArrayAsync().WaitAsync(TestTimeout));
        if (expected == HttpStatusCode.BadRequest) Assert.Equal("Error.BadRequest", document.RootElement.GetProperty("code").GetString());
        return document.RootElement.Clone();
    }

    private static string[] GroupMemberIds(JsonElement page) => page.GetProperty("value").EnumerateArray()
        .Select(member => member.GetProperty("connectionId").GetString()!).ToArray();
}