// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Azure;
using Azure.Core;
using Azure.Messaging.WebPubSub;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public partial class RestApiTests
{
    [Fact]
    public async Task OfficialSdkGroupApisPreserveSelectionMembershipAndPermissions()
    {
        await using var app = EmulatorApplication.Build(["--urls=http://127.0.0.1:0"]);
        await app.StartAsync().WaitAsync(TestTimeout);
        var connectionString = $"Endpoint={app.Urls.Single()};AccessKey={EmulatorOptions.DefaultAccessKey}";
        var service = new WebPubSubServiceClient(connectionString, "CHAT");
        var other = new WebPubSubServiceClient(connectionString, "other");
        var clients = new List<(ClientWebSocket Socket, WebPubSubServiceClient Service, LogicalConnection Connection)>();
        try
        {
            await OpenAsync(service, "alice", "room");
            await OpenAsync(service, "alice", "room");
            await OpenAsync(service, "ALICE", "room");
            await OpenAsync(service, "alice", "ROOM");
            await OpenAsync(other, "alice", "room");
            var groups = new[] { "second", "third", "second", "a/b + 你好", new string('g', 1024) };
            Assert.Equal(200, (await service.AddConnectionsToGroupsAsync(groups,
                "userId eq 'alice' and 'room' in groups and not ('second' in groups)").WaitAsync(TestTimeout)).Status);
            for (var i = 0; i < clients.Count; i++)
            {
                Assert.Equal(i < 2, clients[i].Connection.Groups.ContainsKey("third"));
                Assert.Equal(i < 2, clients[i].Connection.Groups.ContainsKey(groups[^1]));
            }
            await service.SendToGroupAsync("third", BinaryData.FromString("joined"), ContentType.TextPlain).WaitAsync(TestTimeout);
            foreach (var client in clients.Take(2))
            {
                using var message = await ReceiveJsonAsync(client.Socket);
                Assert.Equal("joined", message.RootElement.GetProperty("data").GetString());
            }
            Assert.Equal(200, (await service.RemoveConnectionsFromGroupsAsync(groups, "'second' in groups").WaitAsync(TestTimeout)).Status);
            foreach (var client in clients)
            {
                Assert.Single(client.Connection.Groups);
                foreach (var permission in new[] { WebPubSubPermission.JoinLeaveGroup, WebPubSubPermission.SendToGroup })
                    Assert.False((await client.Service.CheckPermissionAsync(permission, client.Connection.ConnectionId, "third").WaitAsync(TestTimeout)).Value);
                await client.Service.SendToConnectionAsync(client.Connection.ConnectionId, BinaryData.FromString("sentinel"), ContentType.TextPlain).WaitAsync(TestTimeout);
                using var message = await ReceiveJsonAsync(client.Socket);
                Assert.Equal("sentinel", message.RootElement.GetProperty("data").GetString());
            }
            var id = clients[0].Connection.ConnectionId;
            Assert.Equal(204, (await other.RemoveConnectionFromAllGroupsAsync(id).WaitAsync(TestTimeout)).Status);
            Assert.Contains("room", clients[0].Connection.Groups.Keys);
            for (var i = 0; i < 2; i++)
                Assert.Equal(204, (await service.RemoveConnectionFromAllGroupsAsync(id).WaitAsync(TestTimeout)).Status);
            Assert.Empty(clients[0].Connection.Groups);
            Assert.Contains("room", clients[1].Connection.Groups.Keys);
            Assert.True((await service.ConnectionExistsAsync(id).WaitAsync(TestTimeout)).Value);
        }
        finally
        {
            foreach (var client in clients) client.Socket.Dispose();
        }

        async Task OpenAsync(WebPubSubServiceClient sdk, string user, string group)
        {
            var socket = new ClientWebSocket();
            socket.Options.AddSubProtocol(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
            try
            {
                await socket.ConnectAsync(sdk.GetClientAccessUri(userId: user, groups: [group]), CancellationToken.None).WaitAsync(TestTimeout);
                using var connected = await ReceiveJsonAsync(socket);
                var id = connected.RootElement.GetProperty("connectionId").GetString()!;
                Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(sdk == other ? "other" : Hub, id, out var connection));
                clients.Add((socket, sdk, connection));
            }
            catch { socket.Dispose(); throw; }
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("2021-10-01")]
    [InlineData("2022-11-01")]
    [InlineData("2023-07-01")]
    [InlineData("2024-01-01")]
    [InlineData("2024-12-01")]
    public async Task GroupApisSupportVersionsOptionalFiltersAndNoMatches(string? version)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        using var socket = await ConnectAsync(app);
        using var connected = await ReceiveJsonAsync(socket);
        var id = connected.RootElement.GetProperty("connectionId").GetString()!;
        Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(Hub, id, out var connection));
        var suffix = version is null ? "" : $"?api-version={version}";
        // No group-count cap: this is distinct from the maximum length of each name.
        var groups = Enumerable.Range(0, 1025).Select(i => $"g{i}").ToArray();
        foreach (var filter in new[] { "", ",\"filter\":null", ",\"filter\":\"\"" })
        {
            var body = "{\"groups\":" + JsonSerializer.Serialize(groups) + filter + "}";
            await AssertGroupResponseAsync(http, "/api/hubs/CHAT/:addToGroups" + suffix, body);
            await AssertGroupResponseAsync(http, "/api/hubs/CHAT/:addToGroups" + suffix, body);
            Assert.Equal(groups.Length, connection.Groups.Count);
            await AssertGroupResponseAsync(http, "/api/hubs/CHAT/:removeFromGroups" + suffix, body);
            Assert.Empty(connection.Groups);
        }
        foreach (var operation in new[] { "addToGroups", "removeFromGroups" })
            foreach (var hub in new[] { "CHAT", "empty" })
                await AssertGroupResponseAsync(http, $"/api/hubs/{hub}/:{operation}" + suffix, """{"groups":["room"],"filter":"connectionId eq 'missing'"}""");
        await AssertGroupResponseAsync(http, $"/api/hubs/CHAT/connections/{id}/groups" + suffix, null, HttpStatusCode.NoContent);
        await AssertGroupResponseAsync(http, "/api/hubs/CHAT/connections/missing/groups" + suffix, null, HttpStatusCode.NoContent);
        Assert.Empty(connection.Groups);
    }

    [Theory]
    [InlineData("")]
    [InlineData("{")]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("42")]
    [InlineData("{}")]
    [InlineData("{\"filter\":\"true\"}")]
    [InlineData("{\"groups\":null}")]
    [InlineData("{\"groups\":[]}")]
    [InlineData("{\"groups\":\"room\"}")]
    [InlineData("{\"groups\":{}}")]
    [InlineData("{\"groups\":[\"room\",null]}")]
    [InlineData("{\"groups\":[\"room\",42]}")]
    [InlineData("{\"groups\":[\"room\",false]}")]
    [InlineData("{\"groups\":[\"room\",{}]}")]
    [InlineData("{\"groups\":[\"room\",\"\"]}")]
    [InlineData("{\"groups\":[\"room\",\" \\t\"]}")]
    [InlineData("{\"groups\":[\"room\"],\"filter\":42}")]
    [InlineData("{\"groups\":[\"room\"],\"filter\":{}}")]
    [InlineData("{\"groups\":[\"room\"],\"filter\":[]}")]
    [InlineData("{\"groups\":[\"room\"],\"filter\":false}")]
    [InlineData("{\"groups\":[\"room\"],\"filter\":\" \"}")]
    [InlineData("{\"groups\":[\"room\"],\"filter\":\"true or userId\"}")]
    [InlineData("{\"groups\":[\"room\"],\"filter\":\"groups/any(g: g)\"}")]
    [InlineData("{\"groups\":[\"room\"],\"filter\":\"unknown eq 1\"}")]
    public async Task GroupApisRejectInvalidBodiesBeforeAnyMembershipChange(string body)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        using var socket = await ConnectAsync(app);
        using var connected = await ReceiveJsonAsync(socket);
        var id = connected.RootElement.GetProperty("connectionId").GetString()!;
        Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(Hub, id, out var connection));
        foreach (var operation in new[] { "addToGroups", "removeFromGroups" })
        {
            if (operation == "removeFromGroups") await CreateCloseService(http).AddConnectionToGroupAsync("room", id).WaitAsync(TestTimeout);
            var before = connection.Groups.Keys.ToArray();
            await AssertGroupResponseAsync(http, $"/api/hubs/CHAT/:{operation}", body, HttpStatusCode.BadRequest);
            var tooLong = JsonSerializer.Serialize(new { groups = new[] { "room", new string('g', 1025) }, filter = "true" });
            await AssertGroupResponseAsync(http, $"/api/hubs/CHAT/:{operation}", tooLong, HttpStatusCode.BadRequest);
            Assert.Equal(before, connection.Groups.Keys);
        }
    }

    [Theory]
    [InlineData("addToGroups")]
    [InlineData("removeFromGroups")]
    [InlineData("all")]
    public async Task GroupApisValidateAuthenticationPathsAndContentType(string operation)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        using var socket = await ConnectAsync(app);
        using var connected = await ReceiveJsonAsync(socket);
        var id = connected.RootElement.GetProperty("connectionId").GetString()!;
        await CreateCloseService(http).AddConnectionToGroupAsync("room", id).WaitAsync(TestTimeout);
        var path = operation == "all" ? $"/api/hubs/CHAT/connections/{id}/groups" : $"/api/hubs/CHAT/:{operation}";
        var body = operation == "all" ? null : """{"groups":["room","second"],"filter":"true"}""";
        var method = operation == "all" ? HttpMethod.Delete : HttpMethod.Post;
        using var anonymous = await http.SendAsync(new HttpRequestMessage(method, path)).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        using var wrongAudience = CreateAuthorizedRequest(method, path.Replace("/CHAT/", "/other/"));
        wrongAudience.RequestUri = new Uri(path, UriKind.Relative);
        using var denied = await http.SendAsync(wrongAudience).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        foreach (var invalid in new[] { path.Replace("/CHAT/", "/1invalid/"), path + "?api-version=2099-01-01", path + "?api-version=2024-12-01&api-version=2024-12-01" })
            await AssertGroupResponseAsync(http, invalid, body, HttpStatusCode.BadRequest);
        if (operation == "all")
            await AssertGroupResponseAsync(http, path.Replace(id, "%20"), null, HttpStatusCode.BadRequest);
        else
            foreach (var type in new string?[] { null, "text/plain", "application/octet-stream", "application/xml", "application/json; charset=unknown", "application/json; charset=\"" })
                await AssertGroupResponseAsync(http, path, body, HttpStatusCode.UnsupportedMediaType, type);
        Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(Hub, id, out var connection));
        Assert.Equal(new[] { "room" }, connection.Groups.Keys);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(1L)]
    [InlineData(256L)]
    public async Task GroupApisBoundBodyReadsEvenWithIncorrectContentLength(long? reportedLength)
    {
        var builder = EmulatorApplication.CreateBuilder(runtimeOptions: new EmulatorRuntimeOptions { MaxMessageSizeBytes = 128 });
        builder.WebHost.UseTestServer();
        await using var app = EmulatorApplication.Build(builder);
        // TestServer permits an inconsistent length, exercising the streaming bound as well as the header check.
        app.Use((context, next) => { context.Request.ContentLength = reportedLength; return next(context); });
        await app.StartAsync().WaitAsync(TestTimeout);
        using var http = app.GetTestClient();
        foreach (var operation in new[] { "addToGroups", "removeFromGroups" })
            await AssertGroupResponseAsync(http, $"/api/hubs/CHAT/:{operation}", "{\"groups\":[\"room\"]}" + new string(' ', 256), HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("addToGroups")]
    [InlineData("removeFromGroups")]
    [InlineData("all")]
    public async Task GroupApisUpdateDetachedMembershipWithoutChangingRecoveryOrPermissions(string operation)
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var app = EmulatorApplication.Build(builder);
        var detached = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        app.Use(async (context, next) =>
        {
            try { await next(context); }
            finally
            {
                if (context.Request.Path.StartsWithSegments("/client") && !context.Request.Query.ContainsKey("awps_connection_id")) detached.TrySetResult();
            }
        });
        await app.StartAsync().WaitAsync(TestTimeout);
        using var http = app.GetTestClient();
        var service = CreateCloseService(http);
        var initial = await ConnectReliableAsync(app);
        using var socket = initial.WebSocket;
        await service.AddConnectionsToGroupsAsync(["room", "keep"], "true").WaitAsync(TestTimeout);
        await service.GrantPermissionAsync(WebPubSubPermission.SendToGroup, initial.ConnectionId, "room").WaitAsync(TestTimeout);
        Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(Hub, initial.ConnectionId, out var connection));
        socket.Abort();
        await detached.Task.WaitAsync(TestTimeout);
        var path = operation == "all" ? $"/api/hubs/CHAT/connections/{initial.ConnectionId}/groups" : $"/api/hubs/CHAT/:{operation}";
        var body = operation == "all" ? null : """{"groups":["room","second"],"filter":"'room' in groups"}""";
        await AssertGroupResponseAsync(http, path, body, operation == "all" ? HttpStatusCode.NoContent : HttpStatusCode.OK);
        using var recovered = await ConnectRecoveryAsync(app, initial.ConnectionId, initial.ReconnectionToken);
        Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(Hub, initial.ConnectionId, out var retained));
        Assert.Same(connection, retained);
        Assert.Equal(operation switch { "addToGroups" => new[] { "keep", "room", "second" }, "removeFromGroups" => ["keep"], _ => [] }, retained.Groups.Keys.OrderBy(g => g));
        Assert.True((await service.CheckPermissionAsync(WebPubSubPermission.SendToGroup, initial.ConnectionId, "room").WaitAsync(TestTimeout)).Value);
        Assert.False((await service.CheckPermissionAsync(WebPubSubPermission.JoinLeaveGroup, initial.ConnectionId, "room").WaitAsync(TestTimeout)).Value);
        await service.SendToGroupAsync(operation == "addToGroups" ? "second" : "room", BinaryData.FromString("group"), ContentType.TextPlain).WaitAsync(TestTimeout);
        if (operation == "addToGroups")
        {
            using var message = await ReceiveJsonAsync(recovered);
            Assert.Equal("group", message.RootElement.GetProperty("data").GetString());
        }
        await AssertReceivesDirectSentinelAsync(app, recovered, initial.ConnectionId, "recovered");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task GroupApisSnapshotAllConnectionsBeforeEnumeratingMutationGroups(bool add)
    {
        await using var app = await StartApplicationAsync();
        using var first = await ConnectAsync(app);
        using var firstConnected = await ReceiveJsonAsync(first);
        using var second = await ConnectAsync(app);
        using var secondConnected = await ReceiveJsonAsync(second);
        var manager = app.Services.GetRequiredService<ConnectionManager>();
        var connections = new[] { firstConnected, secondConnected }.Select(message =>
        {
            Assert.True(manager.TryGet(Hub, message.RootElement.GetProperty("connectionId").GetString()!, out var connection));
            if (!add) { connection.TryAddToGroup("selector"); connection.TryAddToGroup("result"); }
            return connection;
        }).ToArray();
        var groups = new MembershipSelectionGroups(() =>
        {
            // Change every candidate as soon as mutation begins; lazy filtering would miss later targets.
            foreach (var connection in connections)
                if (add) connection.TryAddToGroup("selector"); else connection.RemoveFromGroup("selector");
        });
        if (add) manager.AddConnectionsToGroups(Hub, groups, "not ('selector' in groups)");
        else manager.RemoveConnectionsFromGroups(Hub, groups, "'selector' in groups");
        Assert.All(connections, connection => Assert.Equal(add, connection.Groups.ContainsKey("result")));
    }

    private static async Task AssertGroupResponseAsync(HttpClient http, string path, string? body,
        HttpStatusCode expected = HttpStatusCode.OK, string? contentType = "application/json")
    {
        using var request = CreateAuthorizedRequest(body is null ? HttpMethod.Delete : HttpMethod.Post, path);
        if (body is not null)
        {
            request.Content = new ByteArrayContent(Encoding.UTF8.GetBytes(body));
            if (contentType is not null) request.Content.Headers.TryAddWithoutValidation("Content-Type", contentType);
        }
        using var response = await http.SendAsync(request).WaitAsync(TestTimeout);
        Assert.Equal(expected, response.StatusCode);
        var bytes = await response.Content.ReadAsByteArrayAsync().WaitAsync(TestTimeout);
        if (expected is HttpStatusCode.OK or HttpStatusCode.NoContent) Assert.Empty(bytes);
        if (expected == HttpStatusCode.BadRequest)
        {
            using var error = JsonDocument.Parse(bytes);
            Assert.Equal("Error.BadRequest", error.RootElement.GetProperty("code").GetString());
        }
    }

    private sealed class MembershipSelectionGroups(Action onEnumerate) : List<string>(["result"]), IReadOnlyList<string>
    {
        IEnumerator<string> IEnumerable<string>.GetEnumerator()
        {
            onEnumerate();
            return GetEnumerator();
        }
    }
}