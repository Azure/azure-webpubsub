// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Azure;
using Azure.Core;
using Azure.Messaging.WebPubSub;
using Azure.Messaging.WebPubSub.Client.Protobuf;
using Google.Protobuf;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public partial class RestApiTests
{
    [Theory]
    [InlineData("sendToGroup")]
    [InlineData("joinLeaveGroup")]
    [InlineData("SENDTOGROUP")]
    [InlineData("1")]
    [InlineData("2")]
    public async Task PermissionRestContractPreservesVersionsTargetsAndMissingConnections(string permission)
    {
        await using var app = await StartApplicationAsync();
        using var socket = await ConnectAsync(app);
        using var connected = await ReceiveJsonAsync(socket);
        var id = connected.RootElement.GetProperty("connectionId").GetString()!;
        foreach (var version in new[] { "", "2021-10-01", "2022-11-01", "2023-07-01", "2024-01-01", "2024-12-01" })
        {
            var suffix = version.Length == 0 ? "" : $"&api-version={version}";
            foreach (var target in new[] { "room", "*", "room.*", " room ", "a/b+你好", new string('x', 1024) })
            {
                var path = PermissionPath(permission, id, target) + suffix;
                await AssertPermissionStatusAsync(app, HttpMethod.Head, path, HttpStatusCode.NotFound, "Info.Connection.NotExisted");
                await AssertPermissionStatusAsync(app, HttpMethod.Put, path, HttpStatusCode.OK);
                await AssertPermissionStatusAsync(app, HttpMethod.Put, path, HttpStatusCode.OK);
                await AssertPermissionStatusAsync(app, HttpMethod.Head, path, HttpStatusCode.OK);
                await AssertPermissionStatusAsync(app, HttpMethod.Head, PermissionPath(permission, id, "ROOM") + suffix, HttpStatusCode.NotFound);
                if (target == "room.*")
                    await AssertPermissionStatusAsync(app, HttpMethod.Head, PermissionPath(permission, id, "room.child") + suffix, HttpStatusCode.NotFound);
                await AssertPermissionStatusAsync(app, HttpMethod.Head, path.Replace("/CHAT/", "/other/"), HttpStatusCode.NotFound);
                await AssertPermissionStatusAsync(app, HttpMethod.Delete, path, HttpStatusCode.NoContent);
                await AssertPermissionStatusAsync(app, HttpMethod.Delete, path, HttpStatusCode.NoContent);
                await AssertPermissionStatusAsync(app, HttpMethod.Head, path, HttpStatusCode.NotFound);
            }
            var missing = PermissionPath(permission, "missing", "room") + suffix;
            await AssertPermissionStatusAsync(app, HttpMethod.Put, missing, HttpStatusCode.NotFound, "Info.Connection.NotExisted");
            await AssertPermissionStatusAsync(app, HttpMethod.Head, missing, HttpStatusCode.NotFound, "Info.Connection.NotExisted");
            await AssertPermissionStatusAsync(app, HttpMethod.Delete, missing, HttpStatusCode.NoContent);
        }
    }

    [Theory]
    [InlineData("HEAD")]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task PermissionRestValidatesInputAndAuthentication(string method)
    {
        await using var app = await StartApplicationAsync();
        var verb = new HttpMethod(method);
        var path = PermissionPath("sendToGroup", "missing", "room");
        using var unauthorized = await app.GetTestClient().SendAsync(new HttpRequestMessage(verb, path)).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
        foreach (var target in new string?[] { null, "", " \t", new string('x', 1025) })
            await AssertPermissionStatusAsync(app, verb, PermissionPath("sendToGroup", "missing", target), HttpStatusCode.BadRequest);
        foreach (var permission in new[] { "unknown", "0", "3", "-1", "sendToGroup,joinLeaveGroup" })
            await AssertPermissionStatusAsync(app, verb, PermissionPath(permission, "missing", "room"), HttpStatusCode.BadRequest);
        await AssertPermissionStatusAsync(app, verb, path.Replace("/CHAT/", "/1invalid/"), HttpStatusCode.BadRequest);
        await AssertPermissionStatusAsync(app, verb, path + "&api-version=2099-01-01", HttpStatusCode.BadRequest);
        await AssertPermissionStatusAsync(app, verb, path + "&api-version=2024-12-01&api-version=2024-12-01", HttpStatusCode.BadRequest);
        using var wrongAudience = CreateAuthorizedRequest(verb, PermissionPath("sendToGroup", "another", "room"));
        wrongAudience.RequestUri = new Uri(path, UriKind.Relative);
        using var rejected = await app.GetTestClient().SendAsync(wrongAudience).WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task PermissionRestReturnsConflictWithoutChangingFullLiteralSet(bool revoke)
    {
        await using var app = await StartApplicationAsync();
        using var socket = await ConnectPermissionSocketAsync(app, revoke ? ["webpubsub.sendToGroup"] : []);
        using var connected = await ReceiveJsonAsync(socket);
        var id = connected.RootElement.GetProperty("connectionId").GetString()!;
        Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(Hub, id, out var connection));
        var permissions = connection.GetPermissions(ConnectionRoleAction.SendToGroup);
        for (var i = 0; i < ConnectionRolePermissions.MaximumLiteralCount; i++)
            Assert.True(revoke ? permissions.TryRevoke($"room{i}") : permissions.TryGrant($"room{i}"));
        var verb = revoke ? HttpMethod.Delete : HttpMethod.Put;
        var path = PermissionPath("sendToGroup", id, "overflow");
        await AssertPermissionStatusAsync(app, verb, path, HttpStatusCode.Conflict, "Error.Connection.Conflict");
        Assert.Equal(revoke, permissions.Check("overflow"));
    }

    [Theory]
    [InlineData("json.webpubsub.azure.v1")]
    [InlineData("protobuf.webpubsub.azure.v1")]
    [InlineData("json.reliable.webpubsub.azure.v1")]
    [InlineData("protobuf.reliable.webpubsub.azure.v1")]
    public async Task OfficialSdkPermissionChangesApplyToClientOperationsAndSurviveRecovery(string protocol)
    {
        var builder = EmulatorApplication.CreateBuilder(["--urls=http://127.0.0.1:0"]);
        builder.Logging.ClearProviders();
        await using var app = EmulatorApplication.Build(builder);
        var detached = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        app.Use(async (context, next) =>
        {
            try { await next(context); }
            finally
            {
                if (context.Request.Path.StartsWithSegments("/client") && !context.Request.Query.ContainsKey("awps_connection_id"))
                    detached.TrySetResult();
            }
        });
        await app.StartAsync().WaitAsync(TestTimeout);
        var service = new WebPubSubServiceClient($"Endpoint={app.Urls.Single()};AccessKey={EmulatorOptions.DefaultAccessKey}", Hub);
        using var receiver = new ClientWebSocket();
        receiver.Options.AddSubProtocol(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
        await receiver.ConnectAsync(service.GetClientAccessUri(groups: ["room"], roles: ["webpubsub.sendToGroup"]), CancellationToken.None).WaitAsync(TestTimeout);
        using var receiverConnected = await ReceiveJsonAsync(receiver);
        var receiverId = receiverConnected.RootElement.GetProperty("connectionId").GetString()!;
        using var socket = new ClientWebSocket();
        socket.Options.AddSubProtocol(protocol);
        await socket.ConnectAsync(service.GetClientAccessUri(roles: ["webpubsub.joinLeaveGroups.room*", "webpubsub.sendToGroup"]), CancellationToken.None).WaitAsync(TestTimeout);
        var protobuf = protocol.StartsWith("protobuf", StringComparison.Ordinal);
        var buffer = new byte[4096];
        var frame = await socket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(TestTimeout);
        string id, token;
        if (protobuf)
        {
            var connected = DownstreamMessage.Parser.ParseFrom(buffer, 0, frame.Count).SystemMessage.ConnectedMessage;
            id = connected.ConnectionId;
            token = connected.ReconnectionToken;
        }
        else
        {
            using var connected = JsonDocument.Parse(buffer.AsMemory(0, frame.Count));
            id = connected.RootElement.GetProperty("connectionId").GetString()!;
            token = connected.RootElement.TryGetProperty("reconnectionToken", out var value) ? value.GetString()! : "";
        }
        Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(Hub, id, out var logical));
        ulong ackId = 0;
        await AssertOperationAsync(socket, "joinGroup", true);
        foreach (var permission in new[] { WebPubSubPermission.SendToGroup, WebPubSubPermission.JoinLeaveGroup })
        {
            Assert.True((await service.CheckPermissionAsync(permission, id, "room").WaitAsync(TestTimeout)).Value);
            Assert.Equal(204, (await service.RevokePermissionAsync(permission, id, "room").WaitAsync(TestTimeout)).Status);
            Assert.False((await service.CheckPermissionAsync(permission, id, "room").WaitAsync(TestTimeout)).Value);
            Assert.True((await service.CheckPermissionAsync(permission, id, "room-other").WaitAsync(TestTimeout)).Value);
        }
        Assert.True((await service.CheckPermissionAsync(WebPubSubPermission.SendToGroup, receiverId, "room").WaitAsync(TestTimeout)).Value);
        Assert.Contains("room", logical.Groups.Keys); // Revoking does not evict an existing member.
        await AssertOperationAsync(socket, "sendToGroup", false);
        await AssertOperationAsync(socket, "joinGroup", false);
        await AssertOperationAsync(socket, "leaveGroup", false);
        Assert.Equal(200, (await service.GrantPermissionAsync(WebPubSubPermission.SendToGroup, id, "room").WaitAsync(TestTimeout)).Status);
        await AssertOperationAsync(socket, "sendToGroup", true);
        if (protocol.Contains(".reliable.", StringComparison.Ordinal))
        {
            socket.Abort();
            await detached.Task.WaitAsync(TestTimeout);
            await service.GrantPermissionAsync(WebPubSubPermission.JoinLeaveGroup, id, "offline").WaitAsync(TestTimeout);
            using var recovered = new ClientWebSocket();
            recovered.Options.AddSubProtocol(protocol);
            await recovered.ConnectAsync(new Uri(app.Urls.Single().Replace("http:", "ws:") +
                $"/client/hubs/{Hub}?awps_connection_id={id}&awps_reconnection_token={Uri.EscapeDataString(token)}"), CancellationToken.None).WaitAsync(TestTimeout);
            Assert.True(app.Services.GetRequiredService<ConnectionManager>().TryGet(Hub, id, out var retained));
            Assert.Same(logical, retained);
            await AssertOperationAsync(recovered, "sendToGroup", true);
            await AssertOperationAsync(recovered, "leaveGroup", false);
            await AssertOperationAsync(recovered, "joinGroup", true, "offline");
            await service.GrantPermissionAsync(WebPubSubPermission.JoinLeaveGroup, id, "room").WaitAsync(TestTimeout);
            await AssertOperationAsync(recovered, "leaveGroup", true);
        }
        else
        {
            await service.GrantPermissionAsync(WebPubSubPermission.JoinLeaveGroup, id, "room").WaitAsync(TestTimeout);
            await AssertOperationAsync(socket, "leaveGroup", true);
        }
        Assert.DoesNotContain("room", logical.Groups.Keys);
        Assert.False((await service.CheckPermissionAsync(WebPubSubPermission.SendToGroup, "missing", "room").WaitAsync(TestTimeout)).Value);
        var missing = await Assert.ThrowsAsync<RequestFailedException>(() => service.GrantPermissionAsync(WebPubSubPermission.SendToGroup, "missing", "room"));
        Assert.Equal(404, missing.Status);
        Assert.Equal("Info.Connection.NotExisted", missing.ErrorCode);
        Assert.Equal(204, (await service.RevokePermissionAsync(WebPubSubPermission.SendToGroup, "missing", "room").WaitAsync(TestTimeout)).Status);

        async Task AssertOperationAsync(WebSocket client, string operation, bool success, string group = "room")
        {
            ++ackId;
            byte[] payload = protobuf ? (operation switch
            {
                "joinGroup" => new UpstreamMessage { JoinGroupMessage = new() { Group = group, AckId = ackId } },
                "leaveGroup" => new UpstreamMessage { LeaveGroupMessage = new() { Group = group, AckId = ackId } },
                _ => new UpstreamMessage { SendToGroupMessage = new() { Group = group, AckId = ackId, NoEcho = true, Data = new() { TextData = "live" } } },
            }).ToByteArray() : JsonSerializer.SerializeToUtf8Bytes(new { type = operation, group, ackId, noEcho = true, dataType = "text", data = "live" });
            await client.SendAsync(payload, protobuf ? WebSocketMessageType.Binary : WebSocketMessageType.Text, true, CancellationToken.None).WaitAsync(TestTimeout);
            var received = await client.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(TestTimeout);
            Assert.True(received.EndOfMessage);
            if (protobuf)
            {
                var ack = DownstreamMessage.Parser.ParseFrom(buffer, 0, received.Count).AckMessage;
                Assert.NotNull(ack);
                Assert.Equal(ackId, ack.AckId);
                Assert.Equal(success, ack.Success);
                Assert.Equal(success ? null : "Forbidden", ack.Error?.Name);
            }
            else
            {
                using var ack = JsonDocument.Parse(buffer.AsMemory(0, received.Count));
                Assert.Equal(ackId, ack.RootElement.GetProperty("ackId").GetUInt64());
                Assert.Equal(success, ack.RootElement.GetProperty("success").GetBoolean());
                if (!success) Assert.Equal("Forbidden", ack.RootElement.GetProperty("error").GetProperty("name").GetString());
            }
            if (operation == "sendToGroup")
            {
                // An ordered sentinel proves denied sends delivered nothing, without timing-based probes.
                if (!success)
                    await service.SendToConnectionAsync(receiverId, BinaryData.FromString("sentinel"), ContentType.TextPlain).WaitAsync(TestTimeout);
                using var data = await ReceiveJsonAsync(receiver);
                Assert.Equal(success ? "live" : "sentinel", data.RootElement.GetProperty("data").GetString());
            }
        }
    }

    private static async Task<WebSocket> ConnectPermissionSocketAsync(WebApplication app, string[] roles)
    {
        var client = app.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
        var service = new WebPubSubServiceClient($"Endpoint=http://localhost;AccessKey={EmulatorOptions.DefaultAccessKey}", Hub);
        return await client.ConnectAsync(service.GetClientAccessUri(roles: roles), CancellationToken.None).WaitAsync(TestTimeout);
    }

    private static string PermissionPath(string permission, string id, string? target) =>
        $"/api/hubs/CHAT/permissions/{permission}/connections/{id}" +
        (target is null ? "" : $"?targetName={Uri.EscapeDataString(target)}");

    private static async Task AssertPermissionStatusAsync(WebApplication app, HttpMethod method, string path, HttpStatusCode status, string? code = null)
    {
        using var request = CreateAuthorizedRequest(method, path);
        using var response = await app.GetTestClient().SendAsync(request).WaitAsync(TestTimeout);
        Assert.Equal(status, response.StatusCode);
        if (code is not null) Assert.Equal(code, Assert.Single(response.Headers.GetValues("x-ms-error-code")));
    }
}