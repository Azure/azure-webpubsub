// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Azure;
using Azure.Core;
using Azure.Core.Pipeline;
using Azure.Messaging.WebPubSub;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public partial class RestApiTests
{
    [Theory]
    [InlineData("hub", null)]
    [InlineData("hub", "maintenance + & / 你好")]
    [InlineData("group", "")]
    [InlineData("group", "maintenance + & / 你好")]
    [InlineData("user", null)]
    [InlineData("user", "maintenance + & / 你好")]
    public async Task OfficialServerSdkClosesOnlyScopedConnections(string scope, string? reason)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        var service = CreateCloseService(http);
        var otherHubService = CreateCloseService(http, "other");
        var sockets = new List<WebSocket>();
        var clients = new List<(WebSocket Socket, WebPubSubServiceClient Service, string Id, bool Close)>();
        try
        {
            var first = await OpenAsync(service, "alice", "room", close: true);
            var second = await OpenAsync(service, scope == "group" ? "bob" : "alice",
                scope == "user" ? "elsewhere" : "room", close: true);
            var excluded = await OpenAsync(service, "alice", "room", close: false);
            var secondExcluded = await OpenAsync(service, "alice", "room", close: false);
            await OpenAsync(service, "alice", "ROOM", close: scope != "group");
            await OpenAsync(service, "ALICE", "room", close: scope != "user");
            await OpenAsync(service, "bob", "elsewhere", close: scope == "hub");
            await OpenAsync(otherHubService, "alice", "room", close: false);
            if (!string.IsNullOrEmpty(reason))
            {
                // The reason belongs in the JSON notification, not the size-limited close frame.
                reason += new string('x', 200);
            }

            var response = await CloseScopeAsync(service, scope,
                [excluded, secondExcluded, excluded, "missing", $"{first},{second}", $" {first} "], reason)
                .WaitAsync(TestTimeout);
            Assert.Equal(204, response.Status);
            foreach (var client in clients.Where(client => client.Close))
            {
                await AssertAppServerCloseAsync(client.Socket, reason);
                Assert.False((await client.Service.ConnectionExistsAsync(client.Id).WaitAsync(TestTimeout)).Value);
            }

            await AssertSurvivorsAsync("after-close");
            // Retrying with every surviving target excluded is also a successful no-op.
            var repeated = await CloseScopeAsync(service, scope,
                clients.Where(client => !client.Close).Select(client => client.Id), reason).WaitAsync(TestTimeout);
            Assert.Equal(204, repeated.Status);
            await AssertSurvivorsAsync("after-all-excluded");
        }
        finally
        {
            foreach (var socket in sockets)
            {
                socket.Dispose();
            }
        }

        async Task<string> OpenAsync(WebPubSubServiceClient sdk, string user, string group, bool close)
        {
            var client = app.GetTestServer().CreateWebSocketClient();
            client.SubProtocols.Add(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
            var socket = await client.ConnectAsync(sdk.GetClientAccessUri(userId: user, groups: [group]),
                CancellationToken.None).WaitAsync(TestTimeout);
            sockets.Add(socket);
            using var connected = await ReceiveJsonAsync(socket);
            var id = connected.RootElement.GetProperty("connectionId").GetString()!;
            clients.Add((socket, sdk, id, close));
            return id;
        }

        async Task AssertSurvivorsAsync(string sentinel)
        {
            foreach (var client in clients.Where(client => !client.Close))
            {
                Assert.True((await client.Service.ConnectionExistsAsync(client.Id).WaitAsync(TestTimeout)).Value);
                await client.Service.SendToConnectionAsync(client.Id, BinaryData.FromString(sentinel), ContentType.TextPlain)
                    .WaitAsync(TestTimeout);
                using var message = await ReceiveJsonAsync(client.Socket);
                Assert.Equal("message", message.RootElement.GetProperty("type").GetString());
                Assert.Equal(sentinel, message.RootElement.GetProperty("data").GetString());
            }
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("2021-10-01")]
    [InlineData("2022-11-01")]
    [InlineData("2023-07-01")]
    [InlineData("2024-01-01")]
    [InlineData("2024-12-01")]
    public async Task ScopedCloseWithNoMatchesReturnsNoContentForSupportedVersions(string? version)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        using var socket = await ConnectAsync(app, "alice");
        using var connected = await ReceiveJsonAsync(socket);
        var id = connected.RootElement.GetProperty("connectionId").GetString()!;
        await CreateCloseService(http).AddConnectionToGroupAsync("room", id).WaitAsync(TestTimeout);
        foreach (var target in new[] { "/api/hubs/empty", "/api/hubs/CHAT/groups/missing", "/api/hubs/CHAT/users/missing" })
        {
            var path = target + "/:closeConnections" + (version is null ? "" : $"?api-version={version}");
            using var request = CreateAuthorizedRequest(HttpMethod.Post, path);
            using var response = await http.SendAsync(request).WaitAsync(TestTimeout);
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
            Assert.Empty(await response.Content.ReadAsByteArrayAsync().WaitAsync(TestTimeout));
            await AssertReceivesDirectSentinelAsync(app, socket, id, "missing-scope-sentinel");
        }
    }

    [Theory]
    [InlineData("hub")]
    [InlineData("group")]
    [InlineData("user")]
    public async Task ScopedCloseRejectsInvalidRequestsWithoutClosingConnections(string scope)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        using var socket = await ConnectAsync(app, "alice");
        using var connected = await ReceiveJsonAsync(socket);
        var id = connected.RootElement.GetProperty("connectionId").GetString()!;
        await CreateCloseService(http).AddConnectionToGroupAsync("room", id).WaitAsync(TestTimeout);
        var path = CloseScopePath(scope);
        using var anonymous = await http.PostAsync(path, null).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        using var wrongAudience = CreateAuthorizedRequest(HttpMethod.Post, path.Replace("/CHAT/", "/other/"));
        wrongAudience.RequestUri = new Uri(path, UriKind.Relative);
        using var denied = await http.SendAsync(wrongAudience).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);

        var invalidPaths = new List<string>
        {
            path.Replace("/CHAT/", "/1invalid/"),
            path + "?api-version=2099-01-01",
            path + "?api-version=2024-12-01&api-version=2024-12-01",
        };
        if (scope == "group")
        {
            invalidPaths.Add(path.Replace("/room/", "/%20/"));
            invalidPaths.Add(path.Replace("/room/", "/%09/"));
            invalidPaths.Add(path.Replace("/room/", $"/{new string('g', 1025)}/"));
        }
        if (scope == "user")
        {
            invalidPaths.Add(path.Replace("/alice/", "/%20/"));
        }
        foreach (var invalidPath in invalidPaths)
        {
            using var request = CreateAuthorizedRequest(HttpMethod.Post, invalidPath);
            using var response = await http.SendAsync(request).WaitAsync(TestTimeout);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            using var error = JsonDocument.Parse(await response.Content.ReadAsByteArrayAsync().WaitAsync(TestTimeout));
            Assert.Equal("Error.BadRequest", error.RootElement.GetProperty("code").GetString());
        }
        await AssertReceivesDirectSentinelAsync(app, socket, id, "rejected-close-sentinel");
    }

    [Theory]
    [InlineData("hub")]
    [InlineData("group")]
    [InlineData("user")]
    public async Task ScopedCloseOfDetachedReliableConnectionPreventsRecovery(string scope)
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var app = EmulatorApplication.Build(builder);
        var detached = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
            }
            finally
            {
                if (context.Request.Path.StartsWithSegments("/client") &&
                    !context.Request.Query.ContainsKey("awps_connection_id"))
                {
                    detached.TrySetResult();
                }
            }
        });
        await app.StartAsync().WaitAsync(TestTimeout);
        using var http = app.GetTestClient();
        var service = CreateCloseService(http);
        var initial = await ConnectReliableAsync(app, "alice");
        using var socket = initial.WebSocket;
        await service.AddConnectionToGroupAsync("room", initial.ConnectionId).WaitAsync(TestTimeout);
        var manager = app.Services.GetRequiredService<ConnectionManager>();
        Assert.True(manager.TryGet(Hub, initial.ConnectionId, out var connection));
        socket.Abort();
        await detached.Task.WaitAsync(TestTimeout);
        Assert.True(manager.TryGet(Hub, initial.ConnectionId, out var retained));
        Assert.Same(connection, retained);

        var response = await CloseScopeAsync(service, scope, reason: "offline-close").WaitAsync(TestTimeout);
        Assert.Equal(204, response.Status);
        Assert.False((await service.ConnectionExistsAsync(initial.ConnectionId).WaitAsync(TestTimeout)).Value);
        Assert.False((await service.GroupExistsAsync("room").WaitAsync(TestTimeout)).Value);
        Assert.False((await service.UserExistsAsync("alice").WaitAsync(TestTimeout)).Value);
        using var recovered = await ConnectRecoveryAsync(app, initial.ConnectionId, initial.ReconnectionToken);
        var close = await recovered.ReceiveAsync(new byte[256], CancellationToken.None).WaitAsync(TestTimeout);
        Assert.Equal(WebSocketMessageType.Close, close.MessageType);
        Assert.Equal(WebSocketCloseStatus.PolicyViolation, close.CloseStatus);
        Assert.Equal("The connection could not be recovered.", close.CloseStatusDescription);
        Assert.Equal(204, (await CloseScopeAsync(service, scope).WaitAsync(TestTimeout)).Status);
    }

    [Theory]
    [InlineData("hub")]
    [InlineData("group")]
    [InlineData("user")]
    public async Task ScopedCloseSnapshotDoesNotCloseReplacementWithSameId(string scope)
    {
        await using var app = await StartApplicationAsync();
        using var http = app.GetTestClient();
        var service = CreateCloseService(http);
        using var first = await ConnectAsync(app, "alice");
        using var firstConnected = await ReceiveJsonAsync(first);
        var firstId = firstConnected.RootElement.GetProperty("connectionId").GetString()!;
        using var second = await ConnectAsync(app, "alice");
        using var secondConnected = await ReceiveJsonAsync(second);
        var secondId = secondConnected.RootElement.GetProperty("connectionId").GetString()!;
        await service.AddConnectionToGroupAsync("room", firstId).WaitAsync(TestTimeout);
        await service.AddConnectionToGroupAsync("room", secondId).WaitAsync(TestTimeout);
        var manager = app.Services.GetRequiredService<ConnectionManager>();
        string? selectedId = null;
        LogicalConnection? replacement = null;
        var exclusions = new CloseSelectionExclusions(id =>
        {
            if (selectedId is null)
            {
                selectedId = id;
                return;
            }
            // Replace the first selected instance while selecting the second, without relying on enumeration order or timing.
            Assert.True(manager.TryGet(Hub, selectedId, out var selected));
            manager.Remove(selected);
            replacement = manager.Create(selected.UpstreamContext, new ClaimsPrincipal());
            Assert.True(replacement.TryAddToGroup("room"));
            Assert.True(manager.TryActivate(replacement));
        });
        try
        {
            switch (scope)
            {
                case "hub": manager.CloseAllConnections(Hub, exclusions, "snapshot-close"); break;
                case "group": manager.CloseGroupConnections(Hub, "room", exclusions, "snapshot-close"); break;
                case "user": manager.CloseUserConnections(Hub, "alice", exclusions, "snapshot-close"); break;
                default: throw new ArgumentOutOfRangeException(nameof(scope));
            }
            await AssertAppServerCloseAsync(first, "snapshot-close");
            await AssertAppServerCloseAsync(second, "snapshot-close");
            Assert.NotNull(replacement);
            Assert.True(manager.TryGet(Hub, replacement.ConnectionId, out var retained));
            Assert.Same(replacement, retained);
            Assert.True(retained.TryAddToGroup("still-open"));
        }
        finally
        {
            manager.CloseAllConnections(Hub);
        }
    }

    private static WebPubSubServiceClient CreateCloseService(HttpClient http, string hub = "CHAT") =>
        new($"Endpoint=http://localhost;AccessKey={EmulatorOptions.DefaultAccessKey}", hub,
            new WebPubSubServiceClientOptions { Transport = new HttpClientTransport(http) });

    private static Task<Response> CloseScopeAsync(
        WebPubSubServiceClient service, string scope, IEnumerable<string>? excluded = null, string? reason = null) => scope switch
        {
            "hub" => service.CloseAllConnectionsAsync(excluded, reason),
            "group" => service.CloseGroupConnectionsAsync("room", excluded, reason),
            "user" => service.CloseUserConnectionsAsync("alice", excluded, reason),
            _ => throw new ArgumentOutOfRangeException(nameof(scope)),
        };

    private static string CloseScopePath(string scope) => scope switch
    {
        "hub" => "/api/hubs/CHAT/:closeConnections",
        "group" => "/api/hubs/CHAT/groups/room/:closeConnections",
        "user" => "/api/hubs/CHAT/users/alice/:closeConnections",
        _ => throw new ArgumentOutOfRangeException(nameof(scope)),
    };

    private static async Task AssertAppServerCloseAsync(WebSocket socket, string? reason)
    {
        using var disconnected = await ReceiveJsonAsync(socket);
        Assert.Equal("system", disconnected.RootElement.GetProperty("type").GetString());
        Assert.Equal("disconnected", disconnected.RootElement.GetProperty("event").GetString());
        Assert.Equal("Application server closed the connection." + (string.IsNullOrEmpty(reason) ? "" : $" Reason: {reason}"),
            disconnected.RootElement.GetProperty("message").GetString());
        var close = await socket.ReceiveAsync(new byte[256], CancellationToken.None).WaitAsync(TestTimeout);
        Assert.Equal(WebSocketMessageType.Close, close.MessageType);
        Assert.Equal(WebSocketCloseStatus.NormalClosure, close.CloseStatus);
        Assert.Equal(string.Empty, close.CloseStatusDescription);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, string.Empty, CancellationToken.None).WaitAsync(TestTimeout);
    }

    private sealed class CloseSelectionExclusions(Action<string> onContains) : HashSet<string>(StringComparer.Ordinal), IReadOnlySet<string>
    {
        bool IReadOnlySet<string>.Contains(string item)
        {
            onContains(item);
            return Contains(item);
        }
    }
}