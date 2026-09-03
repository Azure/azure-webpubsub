// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
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

    [Theory]
    [InlineData("custom.protocol")]
    [InlineData("protobuf.webpubsub.azure.v1")]
    public async Task UnsupportedSubprotocolIsNotSelected(string subprotocol)
    {
        await using var application = await StartApplicationAsync();
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(subprotocol);
        var uri = CreateClientUri();

        using var webSocket = await client.ConnectAsync(uri, CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Null(webSocket.SubProtocol);
    }

    [Fact]
    public async Task JsonSubprotocolReceivesConnectedMessage()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            subprotocol: WebPubSubJsonV1PayloadProcessor.SubprotocolName);

        var message = await ReceiveJsonAsync(webSocket);

        Assert.Equal(WebPubSubJsonV1PayloadProcessor.SubprotocolName, webSocket.SubProtocol);
        Assert.Equal("system", message.RootElement.GetProperty("type").GetString());
        Assert.Equal("connected", message.RootElement.GetProperty("event").GetString());
        Assert.False(string.IsNullOrEmpty(
            message.RootElement.GetProperty("connectionId").GetString()));
    }

    [Fact]
    public async Task ReliableJsonSubprotocolReceivesReconnectionToken()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            subprotocol: WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName);

        using var message = await ReceiveJsonAsync(webSocket);

        Assert.Equal(
            WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName,
            webSocket.SubProtocol);
        var reconnectionToken = message.RootElement
            .GetProperty("reconnectionToken")
            .GetString();
        Assert.False(string.IsNullOrEmpty(reconnectionToken));
        Assert.Equal(
            "https://webpubsub.azure.com",
            new JwtSecurityTokenHandler().ReadJwtToken(reconnectionToken).Issuer);
    }

    [Fact]
    public async Task InvalidReconnectionTokenClosesWithPolicyViolation()
    {
        await using var application = await StartApplicationAsync();
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName);

        using var recovered = await client.ConnectAsync(
            CreateReconnectUri("missing", "invalid-token"),
            CancellationToken.None).WaitAsync(TestTimeout);
        var result = await recovered.ReceiveAsync(new byte[256], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.PolicyViolation, result.CloseStatus);
    }

    [Fact]
    public async Task ReconnectionTokenIsScopedToConnectionId()
    {
        await using var application = await StartApplicationAsync();
        using var initial = await ConnectAsync(
            application,
            subprotocol: WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName);
        using var connected = await ReceiveJsonAsync(initial);
        var reconnectionToken = connected.RootElement
            .GetProperty("reconnectionToken")
            .GetString()!;
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName);

        using var recovered = await client.ConnectAsync(
            CreateReconnectUri("another-connection", reconnectionToken),
            CancellationToken.None).WaitAsync(TestTimeout);
        var result = await recovered.ReceiveAsync(new byte[256], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.PolicyViolation, result.CloseStatus);
    }

    [Fact]
    public async Task ReconnectWithoutTokenClosesWithPolicyViolation()
    {
        await using var application = await StartApplicationAsync();
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName);
        var uri = new Uri(
            $"ws://localhost/client/hubs/{Hub}?awps_connection_id=connection");

        using var webSocket = await client.ConnectAsync(uri, CancellationToken.None)
            .WaitAsync(TestTimeout);
        var result = await webSocket.ReceiveAsync(new byte[256], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.PolicyViolation, result.CloseStatus);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(WebPubSubJsonV1PayloadProcessor.SubprotocolName)]
    public async Task ReconnectUsesOriginalReliableSubprotocol(string? requestedSubprotocol)
    {
        await using var application = await StartApplicationAsync();
        using var initial = await ConnectAsync(
            application,
            subprotocol: WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName);
        using var connected = await ReceiveJsonAsync(initial);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var reconnectionToken = connected.RootElement
            .GetProperty("reconnectionToken")
            .GetString()!;
        var client = application.GetTestServer().CreateWebSocketClient();
        if (requestedSubprotocol is not null)
        {
            client.SubProtocols.Add(requestedSubprotocol);
        }

        using var recovered = await client.ConnectAsync(
            CreateReconnectUri(connectionId, reconnectionToken),
            CancellationToken.None).WaitAsync(TestTimeout);
        await recovered.SendAsync(
            "{\"type\":\"ping\"}"u8.ToArray(),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None).WaitAsync(TestTimeout);
        using var pong = await ReceiveJsonAsync(recovered);

        Assert.Equal(
            WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName,
            recovered.SubProtocol,
            ignoreCase: true);
        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
    }

    [Fact]
    public async Task ReconnectionTokenWithoutConnectionIdStartsNewConnection()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            query: "awps_reconnection_token=stray",
            subprotocol: WebPubSubJsonV1PayloadProcessor.SubprotocolName);

        using var connected = await ReceiveJsonAsync(webSocket);

        Assert.Equal("connected", connected.RootElement.GetProperty("event").GetString());
    }

    [Fact]
    public async Task ReconnectCanonicalizesHubName()
    {
        await using var application = await StartApplicationAsync();
        using var initial = await ConnectAsync(
            application,
            subprotocol: WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName);
        using var connected = await ReceiveJsonAsync(initial);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var reconnectionToken = connected.RootElement
            .GetProperty("reconnectionToken")
            .GetString()!;
        var client = application.GetTestServer().CreateWebSocketClient();

        using var recovered = await client.ConnectAsync(
            CreateReconnectUri(connectionId, reconnectionToken, hub: "CHAT"),
            CancellationToken.None).WaitAsync(TestTimeout);

        Assert.Equal(
            WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName,
            recovered.SubProtocol,
            ignoreCase: true);
    }

    [Fact]
    public async Task JsonSubprotocolNegotiationIsCaseInsensitive()
    {
        const string requestedSubprotocol = "JSON.WEBPUBSUB.AZURE.V1";
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            subprotocol: requestedSubprotocol);

        using var message = await ReceiveJsonAsync(webSocket);

        Assert.Equal(requestedSubprotocol, webSocket.SubProtocol);
        Assert.Equal("connected", message.RootElement.GetProperty("event").GetString());
    }

    [Fact]
    public async Task EmptyRawModeIsRejectedBeforeUpgrade()
    {
        await using var application = await StartApplicationAsync();
        var client = application.GetTestServer().CreateWebSocketClient();
        var uri = CreateClientUri(query: "webpubsub_mode=");

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
        string? query = null,
        string? subprotocol = null)
    {
        var uri = CreateClientUri(roles, groups, query);
        var client = application.GetTestServer().CreateWebSocketClient();
        if (subprotocol is not null)
        {
            client.SubProtocols.Add(subprotocol);
        }
        return await client.ConnectAsync(uri, CancellationToken.None).WaitAsync(TestTimeout);
    }

    private static async Task<JsonDocument> ReceiveJsonAsync(WebSocket webSocket)
    {
        var buffer = new byte[4096];
        var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None)
            .WaitAsync(TestTimeout);
        Assert.Equal(WebSocketMessageType.Text, result.MessageType);
        Assert.True(result.EndOfMessage);
        return JsonDocument.Parse(buffer.AsMemory(0, result.Count));
    }

    private static Uri CreateClientUri(
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

    private static Uri CreateReconnectUri(
        string connectionId,
        string reconnectionToken,
        string hub = Hub)
    {
        return new Uri(
            $"ws://localhost/client/hubs/{hub}?awps_connection_id={Uri.EscapeDataString(connectionId)}" +
            $"&awps_reconnection_token={Uri.EscapeDataString(reconnectionToken)}");
    }

    private static string CreateToken(
        IEnumerable<string> roles,
        IEnumerable<string> groups)
    {
        var claims = roles
            .Select(role => new Claim("role", role))
            .Concat(groups.Select(group => new Claim("webpubsub.group", group)));
        var token = new JwtSecurityToken(
            audience: $"http://localhost{WebPubSubTokenService.ClientPathPrefix}{Hub}",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}