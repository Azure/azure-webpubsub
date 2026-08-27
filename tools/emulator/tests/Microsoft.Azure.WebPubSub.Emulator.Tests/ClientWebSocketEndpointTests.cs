// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class ClientWebSocketEndpointTests
{
    private const string Hub = "chat";
    private const string AccessKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH";
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task RawSendToGroupPreservesBinaryFrames()
    {
        await using var application = await StartApplicationAsync();
        using var receiver = await ConnectAsync(
            application,
            groups: ["room"]);
        using var sender = await ConnectAsync(
            application,
            roles: ["webpubsub.sendToGroup.room"],
            query: "webpubsub_mode=sendToGroup&group=room");
        var payload = new byte[] { 1, 2, 3, 4 };

        await sender.SendAsync(
            payload,
            WebSocketMessageType.Binary,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);
        var buffer = new byte[16];
        var received = await receiver.ReceiveAsync(buffer, CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Binary, received.MessageType);
        Assert.Equal(payload, buffer[..received.Count]);
    }

    [Fact]
    public async Task RawSendersUseConnectionScopedGroups()
    {
        await using var application = await StartApplicationAsync();
        using var firstReceiver = await ConnectAsync(application, groups: ["first"]);
        using var secondReceiver = await ConnectAsync(application, groups: ["second"]);
        using var firstSender = await ConnectAsync(
            application,
            roles: ["webpubsub.sendToGroup.first"],
            query: "webpubsub_mode=sendToGroup&group=first");
        using var secondSender = await ConnectAsync(
            application,
            roles: ["webpubsub.sendToGroup.second"],
            query: "webpubsub_mode=sendToGroup&group=second");

        await firstSender.SendAsync(
            "first"u8.ToArray(),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);
        await secondSender.SendAsync(
            "second"u8.ToArray(),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);

        var firstBuffer = new byte[16];
        var firstResult = await firstReceiver.ReceiveAsync(firstBuffer, CancellationToken.None)
            .WaitAsync(TestTimeout);
        var secondBuffer = new byte[16];
        var secondResult = await secondReceiver.ReceiveAsync(secondBuffer, CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal("first"u8.ToArray(), firstBuffer[..firstResult.Count]);
        Assert.Equal("second"u8.ToArray(), secondBuffer[..secondResult.Count]);
    }

    [Fact]
    public async Task RawSendWithoutRoleClosesConnection()
    {
        await using var application = await StartApplicationAsync();
        using var sender = await ConnectAsync(
            application,
            query: "webpubsub_mode=sendToGroup&group=room");

        await sender.SendAsync(
            "hello"u8.ToArray(),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);
        var result = await sender.ReceiveAsync(new byte[16], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.PolicyViolation, result.CloseStatus);
    }

    [Fact]
    public async Task RequestedSubprotocolIsNotSelectedWithoutConnectUpstream()
    {
        await using var application = await StartApplicationAsync();
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add("custom.protocol");
        var uri = CreateClientUri(application);

        using var webSocket = await client.ConnectAsync(uri, CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Null(webSocket.SubProtocol);
    }

    [Fact]
    public async Task EmptyRawModeIsRejectedBeforeUpgrade()
    {
        await using var application = await StartApplicationAsync();
        var client = application.GetTestServer().CreateWebSocketClient();
        var uri = CreateClientUri(application, query: "webpubsub_mode=");

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.ConnectAsync(uri, CancellationToken.None));

        Assert.Contains("status code: 400", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task OversizedMessageClosesWithMessageTooBig()
    {
        await using var application = await StartApplicationAsync(
            new EmulatorRuntimeOptions { MaxMessageSizeBytes = 4 });
        using var sender = await ConnectAsync(
            application,
            roles: ["webpubsub.sendToGroup.room"],
            query: "webpubsub_mode=sendToGroup&group=room");

        await sender.SendAsync(
            "hello"u8.ToArray(),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);
        var result = await sender.ReceiveAsync(new byte[16], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.MessageTooBig, result.CloseStatus);
    }

    [Fact]
    public async Task ConnectionIsInvisibleUntilActivated()
    {
        await using var application = await StartApplicationAsync();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        var connection = manager.Create(
            "pending-connection",
            Hub,
            new ClaimsPrincipal(new ClaimsIdentity()));

        Assert.False(manager.TryGet(Hub, connection.ConnectionId, out _));
        Assert.True(manager.TryActivate(connection));
        Assert.True(manager.TryGet(Hub, connection.ConnectionId, out var activated));
        Assert.Same(connection, activated);

        manager.Remove(connection);
    }

    private static async Task<WebApplication> StartApplicationAsync(
        EmulatorRuntimeOptions? runtimeOptions = null)
    {
        var builder = EmulatorApplication.CreateBuilder(runtimeOptions: runtimeOptions);
        builder.WebHost.UseTestServer();
        var application = EmulatorApplication.Build(builder);
        await application.StartAsync().WaitAsync(TestTimeout);
        return application;
    }

    private static async Task<WebSocket> ConnectAsync(
        WebApplication application,
        IEnumerable<string>? roles = null,
        IEnumerable<string>? groups = null,
        string? query = null)
    {
        var uri = CreateClientUri(application, roles, groups, query);
        var client = application.GetTestServer().CreateWebSocketClient();
        return await client.ConnectAsync(uri, CancellationToken.None).WaitAsync(TestTimeout);
    }

    private static Uri CreateClientUri(
        WebApplication application,
        IEnumerable<string>? roles = null,
        IEnumerable<string>? groups = null,
        string? query = null)
    {
        var token = CreateToken(roles ?? [], groups ?? []);
        var uri = $"ws://localhost/client/hubs/{Hub}?access_token={Uri.EscapeDataString(token)}";
        if (!string.IsNullOrEmpty(query))
        {
            uri += $"&{query}";
        }
        return new Uri(uri);
    }

    private static string CreateToken(
        IEnumerable<string> roles,
        IEnumerable<string> groups)
    {
        var claims = roles
            .Select(role => new Claim("role", role))
            .Concat(groups.Select(group => new Claim("webpubsub.group", group)));
        var token = new JwtSecurityToken(
            audience: $"http://localhost:8080/client/hubs/{Hub}",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AccessKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}