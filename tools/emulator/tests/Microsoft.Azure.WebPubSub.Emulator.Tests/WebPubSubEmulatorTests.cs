// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Azure;
using Azure.Core;
using Azure.Core.Pipeline;
using Azure.Messaging.WebPubSub;
using Azure.Messaging.WebPubSub.Clients;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class WebPubSubEmulatorTests
{
    private const string AccessKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH";
    private const string ConnectionString = $"Endpoint=http://localhost;AccessKey={AccessKey};Version=1.0;";
    private const string Hub = "testHub";
    private const string JsonProtocol = "json.webpubsub.azure.v1";
    private const string ReliableProtocol = "json.reliable.webpubsub.azure.v1";

    [Fact]
    public async Task RestApi_ServiceHealthRoute_IsHealthy()
    {
        await using var application = await StartApplicationAsync();
        using var request = new HttpRequestMessage(
            HttpMethod.Head,
            "/api/health?api-version=2024-12-01");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public void RestApi_GeneratedApiDefinition_ContainsAllOperations()
    {
        var operations = typeof(WebPubSubApiControllerDefinition)
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
            .SelectMany(method => method
                .GetCustomAttributes<HttpMethodAttribute>()
                .Select(attribute => new
                {
                    Action = method.Name,
                    Method = Assert.Single(attribute.HttpMethods),
                    Path = attribute.Template,
                    OperationId = attribute.Name,
                }))
            .ToArray();

        Assert.Equal("2024-12-01", WebPubSubApiControllerDefinition.ApiVersion);
        Assert.Equal(25, operations.Length);
        Assert.Equal(
            25,
            operations
                .Select(operation => (operation.Method, operation.Path))
                .Distinct()
                .Count());
        Assert.Contains(
            operations,
            operation => operation.Action == "AddConnectionsToGroups" &&
                operation.OperationId == "WebPubSub_AddConnectionsToGroups" &&
                operation.Method == "POST" &&
                operation.Path == "/api/hubs/{hub}/:addToGroups");
    }

    [Fact]
    public async Task RestApi_GeneratedApiDefinition_RegistersEveryOperation()
    {
        await using var application = await StartApplicationAsync();
        var endpointDataSource = application.Services.GetRequiredService<EndpointDataSource>();
        var registeredOperationIds = endpointDataSource.Endpoints
            .Select(endpoint => endpoint.Metadata.GetMetadata<IEndpointNameMetadata>()?.EndpointName)
            .Where(operationId => operationId is not null)
            .Order()
            .ToArray();
        var definedOperationIds = typeof(WebPubSubApiControllerDefinition)
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
            .SelectMany(method => method.GetCustomAttributes<HttpMethodAttribute>())
            .Select(attribute => attribute.Name)
            .Order()
            .ToArray();

        Assert.Equal(definedOperationIds, registeredOperationIds);
    }

    [Fact]
    public async Task RestApi_UnimplementedPermissionOperation_ReturnsNotImplemented()
    {
        await using var application = await StartApplicationAsync();
        using var request = new HttpRequestMessage(
            HttpMethod.Put,
            $"/api/hubs/{Hub}/permissions/sendToGroup/connections/connection" +
            "?targetName=room&api-version=2024-12-01");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.NotImplemented, response.StatusCode);
        Assert.Equal(
            "2021-10-01, 2022-11-01, 2023-07-01, 2024-01-01, 2024-12-01",
            response.Headers.GetValues("api-supported-versions").Single());
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("NotImplemented", body.RootElement.GetProperty("code").GetString());
        Assert.Contains(
            "WebPubSub_GrantPermission",
            body.RootElement.GetProperty("message").GetString());
    }

    // Azure/azure-sdk-assets tag net/webpubsub/Azure.Messaging.WebPubSub_9127424be2,
    // WebPubSubGeneralTests/ServiceClientCanBroadcastMessagesAsync.json.
    [Theory]
    [InlineData("text/plain", "Hello", false)]
    [InlineData("application/json", "{\"hello\":\"world\"}", false)]
    [InlineData("application/octet-stream", "SGVsbG8=", true)]
    public async Task RestApi_RuntimeRecording_BroadcastResponseMatches(
        string contentType,
        string content,
        bool isBase64)
    {
        await using var application = await StartApplicationAsync();
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:send?api-version=2024-12-01");
        request.Content = new ByteArrayContent(
            isBase64 ? Convert.FromBase64String(content) : Encoding.UTF8.GetBytes(content));
        request.Content.Headers.TryAddWithoutValidation("Content-Type", contentType);

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal(0, response.Content.Headers.ContentLength);
        Assert.Empty(await response.Content.ReadAsByteArrayAsync());
        Assert.Equal(
            "2021-10-01, 2022-11-01, 2023-07-01, 2024-01-01, 2024-12-01",
            response.Headers.GetValues("api-supported-versions").Single());
    }

    [Fact]
    public async Task FragmentedMessage_AfterEndOfMessage_IsParsed()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            GetClientUri(roles: ["webpubsub.joinLeaveGroup.room"]));

        _ = await ReceiveJsonAsync(webSocket);

        var payload = Encoding.UTF8.GetBytes(
            """{"type":"joinGroup","group":"room","ackId":1}""");
        await webSocket.SendAsync(
            payload.AsMemory(0, 12),
            WebSocketMessageType.Text,
            endOfMessage: false,
            CancellationToken.None);
        await webSocket.SendAsync(
            payload.AsMemory(12),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None);

        using var ack = await ReceiveJsonAsync(webSocket);
        Assert.Equal("ack", ack.RootElement.GetProperty("type").GetString());
        Assert.Equal(1UL, ack.RootElement.GetProperty("ackId").GetUInt64());
        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task JsonSubprotocol_WithoutRole_ReturnsForbiddenAck()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application, GetClientUri(), JsonProtocol);
        _ = await ReceiveJsonAsync(webSocket);

        await SendJsonAsync(
            webSocket,
            """{"type":"sendToGroup","group":"room","dataType":"text","data":"message","ackId":1}""");

        using var ack = await ReceiveJsonAsync(webSocket);
        Assert.Equal("ack", ack.RootElement.GetProperty("type").GetString());
        Assert.Equal(1UL, ack.RootElement.GetProperty("ackId").GetUInt64());
        Assert.False(ack.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Forbidden", ack.RootElement.GetProperty("error").GetProperty("name").GetString());

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task JsonSubprotocol_WildcardRole_AllowsSendToMatchingGroup()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            GetClientUri(
                groups: ["room-a"],
                roles: ["webpubsub.sendToGroups.room-*"]),
            JsonProtocol);
        _ = await ReceiveJsonAsync(webSocket);

        await SendJsonAsync(
            webSocket,
            """{"type":"sendToGroup","group":"room-a","dataType":"text","data":"message","ackId":1}""");

        using var message = await ReceiveJsonAsync(webSocket);
        Assert.Equal("message", message.RootElement.GetProperty("type").GetString());
        Assert.Equal("room-a", message.RootElement.GetProperty("group").GetString());

        using var ack = await ReceiveJsonAsync(webSocket);
        Assert.Equal("ack", ack.RootElement.GetProperty("type").GetString());
        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task ReliableSubprotocol_DuplicateAckId_DoesNotExecuteMessageAgain()
    {
        await using var application = await StartApplicationAsync();
        using var receiver = await ConnectAsync(
            application,
            GetClientUri(groups: ["room"]),
            ReliableProtocol);
        using var sender = await ConnectAsync(
            application,
            GetClientUri(roles: ["webpubsub.sendToGroup.room"]),
            ReliableProtocol);
        _ = await ReceiveJsonAsync(receiver);
        _ = await ReceiveJsonAsync(sender);
        const string message =
            """{"type":"sendToGroup","group":"room","dataType":"text","data":"message","ackId":1}""";

        await SendJsonAsync(sender, message);
        using (var delivered = await ReceiveJsonAsync(receiver))
        {
            Assert.Equal("message", delivered.RootElement.GetProperty("data").GetString());
        }
        using (var ack = await ReceiveJsonAsync(sender))
        {
            Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        }

        await SendJsonAsync(sender, message);
        using (var duplicateAck = await ReceiveJsonAsync(sender))
        {
            Assert.False(duplicateAck.RootElement.GetProperty("success").GetBoolean());
            Assert.Equal(
                "Duplicate",
                duplicateAck.RootElement.GetProperty("error").GetProperty("name").GetString());
        }

        await SendJsonAsync(receiver, """{"type":"ping"}""");
        using (var pong = await ReceiveJsonAsync(receiver))
        {
            Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
        }

        await receiver.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
        await sender.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task JsonSubprotocol_WildcardRole_AllowsJoinAndLeaveMatchingGroup()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            GetClientUri(roles: ["webpubsub.joinLeaveGroups.room-*"]),
            JsonProtocol);
        _ = await ReceiveJsonAsync(webSocket);

        await SendJsonAsync(
            webSocket,
            """{"type":"joinGroup","group":"room-a","ackId":1}""");
        using (var joinAck = await ReceiveJsonAsync(webSocket))
        {
            Assert.Equal(1UL, joinAck.RootElement.GetProperty("ackId").GetUInt64());
            Assert.True(joinAck.RootElement.GetProperty("success").GetBoolean());
        }

        await SendJsonAsync(
            webSocket,
            """{"type":"leaveGroup","group":"room-a","ackId":2}""");
        using (var leaveAck = await ReceiveJsonAsync(webSocket))
        {
            Assert.Equal(2UL, leaveAck.RootElement.GetProperty("ackId").GetUInt64());
            Assert.True(leaveAck.RootElement.GetProperty("success").GetBoolean());
        }

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task JsonSubprotocol_NoEcho_DoesNotSendMessageBackToSender()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            GetClientUri(groups: ["room"], roles: ["webpubsub.sendToGroup.room"]),
            JsonProtocol);
        _ = await ReceiveJsonAsync(webSocket);

        await SendJsonAsync(
            webSocket,
            """{"type":"sendToGroup","group":"room","dataType":"text","data":"message","noEcho":true,"ackId":1}""");

        using var ack = await ReceiveJsonAsync(webSocket);
        Assert.Equal("ack", ack.RootElement.GetProperty("type").GetString());
        Assert.True(ack.RootElement.GetProperty("success").GetBoolean());

        await SendJsonAsync(webSocket, """{"type":"ping"}""");
        using var pong = await ReceiveJsonAsync(webSocket);
        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task RawWebSocket_RestBinarySend_DeliversBinaryFrame()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application, GetClientUri(), subprotocol: null);
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:send?api-version=2024-12-01");
        request.Content = new ByteArrayContent([1, 2, 3]);
        request.Content.Headers.TryAddWithoutValidation("Content-Type", "application/octet-stream");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);

        var buffer = new byte[16];
        var result = await webSocket
            .ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None)
            .OrTimeout();
        Assert.Equal(WebSocketMessageType.Binary, result.MessageType);
        Assert.True(result.EndOfMessage);
        Assert.Equal([1, 2, 3], buffer[..result.Count]);

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RestApi_ExcludedConnection_DoesNotReceiveMessage(bool sendToGroup)
    {
        await using var application = await StartApplicationAsync();
        var groups = sendToGroup ? new[] { "room" } : null;
        using var excluded = await ConnectAsync(application, GetClientUri(groups));
        using var included = await ConnectAsync(application, GetClientUri(groups));
        using var excludedConnected = await ReceiveJsonAsync(excluded);
        _ = await ReceiveJsonAsync(included);
        var excludedConnectionId = excludedConnected.RootElement
            .GetProperty("connectionId")
            .GetString();
        var route = sendToGroup ? "groups/room/:send" : ":send";
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/{route}?excluded={Uri.EscapeDataString(excludedConnectionId!)}&api-version=2024-12-01");
        request.Content = new StringContent("message");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        using var delivered = await ReceiveJsonAsync(included);
        Assert.Equal("message", delivered.RootElement.GetProperty("data").GetString());

        await SendJsonAsync(excluded, """{"type":"ping"}""");
        using var pong = await ReceiveJsonAsync(excluded);
        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());

        await excluded.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
        await included.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RestApi_Filter_DeliversOnlyToMatchingConnection(bool sendToGroup)
    {
        await using var application = await StartApplicationAsync();
        var groups = sendToGroup ? new[] { "room" } : null;
        using var matching = await ConnectAsync(
            application,
            GetClientUri(groups, userId: "matching-user"));
        using var nonMatching = await ConnectAsync(
            application,
            GetClientUri(groups, userId: "other-user"));
        _ = await ReceiveJsonAsync(matching);
        _ = await ReceiveJsonAsync(nonMatching);
        var route = sendToGroup ? "groups/room/:send" : ":send";
        var filter = sendToGroup
            ? $"userId eq 'matching-user' and 'room' in groups and protocol eq '{ReliableProtocol}'"
            : "userId eq 'matching-user'";
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/{route}?filter={Uri.EscapeDataString(filter)}&api-version=2024-12-01");
        request.Content = new StringContent("message", Encoding.UTF8, "text/plain");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        using var delivered = await ReceiveJsonAsync(matching);
        Assert.Equal("message", delivered.RootElement.GetProperty("data").GetString());

        await SendJsonAsync(nonMatching, """{"type":"ping"}""");
        using var pong = await ReceiveJsonAsync(nonMatching);
        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());

        await matching.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
        await nonMatching.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task RestApi_SubstringFilter_ReturnsAcceptedAndDeliversMessage()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application, GetClientUri());
        _ = await ReceiveJsonAsync(webSocket);
        var filter = Uri.EscapeDataString("substring(connectionId, 1) ne ''");
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:send?filter={filter}&api-version=2024-12-01");
        request.Content = new StringContent("message", Encoding.UTF8, "text/plain");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        using var delivered = await ReceiveJsonAsync(webSocket);
        Assert.Equal("message", delivered.RootElement.GetProperty("data").GetString());

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Theory]
    [InlineData("/api/hubs/testHub/:send")]
    [InlineData("/api/hubs/testHub/groups/room/:send")]
    [InlineData("/api/hubs/testHub/users/user/:send")]
    public async Task RestApi_InvalidFilter_ReturnsRuntimeBadRequest(string path)
    {
        await using var application = await StartApplicationAsync();
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"{path}?filter=userId%20lt%201&api-version=2024-12-01");
        request.Content = new StringContent("message", Encoding.UTF8, "text/plain");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var error = JsonDocument.Parse(await response.Content.ReadAsByteArrayAsync());
        Assert.Equal("Error.BadRequest", error.RootElement.GetProperty("code").GetString());
        Assert.Equal("Request", error.RootElement.GetProperty("target").GetString());
        Assert.Contains(
            "Invalid syntax for 'userId lt 1': Type 'string', expect 'int'.",
            error.RootElement.GetProperty("message").GetString(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task WebSocket_UnsupportedSubprotocol_RejectsHandshake()
    {
        await using var application = await StartApplicationAsync();
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add("protobuf.webpubsub.azure.v1");

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            client.ConnectAsync(GetClientUri(), CancellationToken.None));
        Assert.Contains("status code: 400", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task WebSocket_InvalidClientToken_RejectsHandshake()
    {
        await using var application = await StartApplicationAsync();
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(JsonProtocol);
        var uri = new Uri($"ws://localhost/client/hubs/{Hub}?access_token=invalid");

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            client.ConnectAsync(uri, CancellationToken.None));
        Assert.Contains("status code: 401", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReliableReconnect_WithUnacknowledgedMessage_ReplaysMessage()
    {
        await using var application = await StartApplicationAsync();
        var receiverUri = GetClientUri(groups: ["room"]);
        using var receiver = await ConnectAsync(application, receiverUri);
        using var sender = await ConnectAsync(
            application,
            GetClientUri(roles: ["webpubsub.sendToGroup.room"]));

        using var connected = await ReceiveJsonAsync(receiver);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString();
        var reconnectionToken = connected.RootElement.GetProperty("reconnectionToken").GetString();
        _ = await ReceiveJsonAsync(sender);

        await SendJsonAsync(
            sender,
            """{"type":"sendToGroup","group":"room","dataType":"text","data":"hello","ackId":1}""");

        using var delivered = await ReceiveJsonAsync(receiver);
        Assert.Equal(1UL, delivered.RootElement.GetProperty("sequenceId").GetUInt64());
        Assert.Equal("hello", delivered.RootElement.GetProperty("data").GetString());
        _ = await ReceiveJsonAsync(sender);

        receiver.Abort();

        using var reconnected = await ConnectAsync(
            application,
            AddReconnectParameters(receiverUri, connectionId!, reconnectionToken!));
        using var replayed = await ReceiveJsonAsync(reconnected);

        Assert.Equal(1UL, replayed.RootElement.GetProperty("sequenceId").GetUInt64());
        Assert.Equal("hello", replayed.RootElement.GetProperty("data").GetString());

        await SendJsonAsync(reconnected, """{"type":"sequenceAck","sequenceId":1}""");
        await reconnected.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
        await sender.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task ReliableBuffer_WhenReceiverStopsReading_DoesNotDisconnectSender()
    {
        await using var application = await StartApplicationAsync(reliableMessageBufferCapacity: 1);
        using var receiver = await ConnectAsync(application, GetClientUri(groups: ["room"]));
        using var sender = await ConnectAsync(
            application,
            GetClientUri(roles: ["webpubsub.sendToGroup.room"]));
        _ = await ReceiveJsonAsync(sender);

        // The receiver never reads another frame after the handshake, not even the
        // `connected` message, so the broker must not depend on its delivery progress.
        await SendJsonAsync(
            sender,
            """{"type":"sendToGroup","group":"room","dataType":"text","data":"first","ackId":1}""");
        using var firstAck = await ReceiveJsonAsync(sender);
        Assert.Equal(1UL, firstAck.RootElement.GetProperty("ackId").GetUInt64());

        await SendJsonAsync(
            sender,
            """{"type":"sendToGroup","group":"room","dataType":"text","data":"second","ackId":2}""");
        using var secondAck = await ReceiveJsonAsync(sender);
        Assert.Equal(2UL, secondAck.RootElement.GetProperty("ackId").GetUInt64());

        await SendJsonAsync(
            sender,
            """{"type":"sendToGroup","group":"room","dataType":"text","data":"third","ackId":3}""");
        using var thirdAck = await ReceiveJsonAsync(sender);
        Assert.Equal(3UL, thirdAck.RootElement.GetProperty("ackId").GetUInt64());

        await SendJsonAsync(sender, """{"type":"ping"}""");
        using var pong = await ReceiveJsonAsync(sender);
        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());

        await sender.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task ReliableReconnect_WithInvalidToken_ClosesWithPolicyViolation()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            AddReconnectParameters(GetClientUri(), "unknown-connection", "invalid-token"));

        var buffer = new byte[256];
        var result = await webSocket
            .ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None)
            .OrTimeout();

        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.PolicyViolation, result.CloseStatus);
    }

    [Fact]
    public async Task OfficialSdk_ClientToGroupAndRestSend_Completes()
    {
        // The official SDK clients open their own sockets, so this test runs the
        // emulator on a real Kestrel TCP listener instead of the in-memory TestServer.
        var endpoint = $"http://127.0.0.1:{GetAvailablePort()}";
        var connectionString = $"Endpoint={endpoint};AccessKey={AccessKey};Version=1.0;";
        await using var application = await StartApplicationAsync(
            connectionString,
            useTestServer: false,
            endpoint);

        using (var probe = new HttpClient())
        {
            using var health = await probe.GetAsync($"{endpoint}/health").OrTimeout();
            Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        }

        var serviceClient = new WebPubSubServiceClient(connectionString, Hub);
        await using var receiver = new WebPubSubClient(
            serviceClient.GetClientAccessUri(groups: ["room"]));
        await using var sender = new WebPubSubClient(
            serviceClient.GetClientAccessUri(roles: ["webpubsub.sendToGroup.room"]));
        var groupMessageReceived = new TaskCompletionSource<string>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var serverMessageReceived = new TaskCompletionSource<string>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        receiver.GroupMessageReceived += args =>
        {
            groupMessageReceived.TrySetResult(args.Message.Data.ToString());
            return Task.CompletedTask;
        };
        receiver.ServerMessageReceived += args =>
        {
            serverMessageReceived.TrySetResult(args.Message.Data.ToString());
            return Task.CompletedTask;
        };

        await Task.WhenAll(receiver.StartAsync(), sender.StartAsync()).OrTimeout();
        await sender.SendToGroupAsync(
            "room",
            BinaryData.FromString("from-client"),
            WebPubSubDataType.Text).OrTimeout();
        Assert.Equal("from-client", await groupMessageReceived.Task.OrTimeout());

        await serviceClient.SendToAllAsync(
            BinaryData.FromString("from-rest"),
            ContentType.TextPlain).OrTimeout();

        Assert.Equal("from-rest", await serverMessageReceived.Task.OrTimeout());
        await Task.WhenAll(receiver.StopAsync(), sender.StopAsync()).OrTimeout();
    }

    [Fact]
    public async Task OfficialSdk_RestSendWithInvalidJson_ReturnsBadRequest()
    {
        var endpoint = $"http://127.0.0.1:{GetAvailablePort()}";
        var connectionString = $"Endpoint={endpoint};AccessKey={AccessKey};Version=1.0;";
        await using var application = await StartApplicationAsync(
            connectionString,
            useTestServer: false,
            endpoint);
        var serviceClient = new WebPubSubServiceClient(connectionString, Hub);

        var exception = await Assert.ThrowsAsync<RequestFailedException>(() =>
            serviceClient.SendToAllAsync(
                RequestContent.Create(BinaryData.FromString("not-json")),
                ContentType.ApplicationJson));

        Assert.Equal((int)HttpStatusCode.BadRequest, exception.Status);
    }

    [Fact]
    public async Task OfficialSdk_CloseConnection_Completes()
    {
        var endpoint = $"http://127.0.0.1:{GetAvailablePort()}";
        var connectionString = $"Endpoint={endpoint};AccessKey={AccessKey};Version=1.0;";
        await using var application = await StartApplicationAsync(
            connectionString,
            useTestServer: false,
            endpoint);
        var serviceClient = new WebPubSubServiceClient(connectionString, Hub);
        using var webSocket = new ClientWebSocket();
        webSocket.Options.AddSubProtocol(ReliableProtocol);
        await webSocket
            .ConnectAsync(serviceClient.GetClientAccessUri(), CancellationToken.None)
            .OrTimeout();
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString();

        await serviceClient.CloseConnectionAsync(connectionId!).OrTimeout();

        var buffer = new byte[256];
        var result = await webSocket
            .ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None)
            .OrTimeout();
        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
    }

    [Fact]
    public async Task OfficialSdk_ConnectionAndGroupRestOperations_Complete()
    {
        var endpoint = $"http://127.0.0.1:{GetAvailablePort()}";
        var connectionString = $"Endpoint={endpoint};AccessKey={AccessKey};Version=1.0;";
        await using var application = await StartApplicationAsync(
            connectionString,
            useTestServer: false,
            endpoint);
        var serviceClient = new WebPubSubServiceClient(connectionString, Hub);
        using var webSocket = new ClientWebSocket();
        webSocket.Options.AddSubProtocol(ReliableProtocol);
        await webSocket
            .ConnectAsync(serviceClient.GetClientAccessUri(), CancellationToken.None)
            .OrTimeout();
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;

        Assert.True((await serviceClient.ConnectionExistsAsync(connectionId).OrTimeout()).Value);
        Assert.False((await serviceClient.GroupExistsAsync("room").OrTimeout()).Value);

        await serviceClient.AddConnectionToGroupAsync("room", connectionId).OrTimeout();
        Assert.True((await serviceClient.GroupExistsAsync("room").OrTimeout()).Value);

        await serviceClient.SendToGroupAsync(
            "room",
            BinaryData.FromString("from-group-rest"),
            ContentType.TextPlain).OrTimeout();
        using var groupMessage = await ReceiveJsonAsync(webSocket);
        Assert.Equal("message", groupMessage.RootElement.GetProperty("type").GetString());
        Assert.Equal("group", groupMessage.RootElement.GetProperty("from").GetString());
        Assert.Equal("room", groupMessage.RootElement.GetProperty("group").GetString());
        Assert.Equal("from-group-rest", groupMessage.RootElement.GetProperty("data").GetString());

        await serviceClient.SendToConnectionAsync(
            connectionId,
            BinaryData.FromString("from-connection-rest"),
            ContentType.TextPlain).OrTimeout();
        using var connectionMessage = await ReceiveJsonAsync(webSocket);
        Assert.Equal("message", connectionMessage.RootElement.GetProperty("type").GetString());
        Assert.Equal("server", connectionMessage.RootElement.GetProperty("from").GetString());
        Assert.Equal("from-connection-rest", connectionMessage.RootElement.GetProperty("data").GetString());

        await serviceClient.SendToConnectionAsync(
            connectionId,
            RequestContent.Create(BinaryData.FromString("""{"value":42}""")),
            ContentType.ApplicationJson).OrTimeout();
        using var jsonMessage = await ReceiveJsonAsync(webSocket);
        Assert.Equal("json", jsonMessage.RootElement.GetProperty("dataType").GetString());
        Assert.Equal(42, jsonMessage.RootElement.GetProperty("data").GetProperty("value").GetInt32());

        await serviceClient.RemoveConnectionFromGroupAsync("room", connectionId).OrTimeout();
        Assert.False((await serviceClient.GroupExistsAsync("room").OrTimeout()).Value);

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task RestApi_UserOperations_ApplyToEveryMatchingConnection()
    {
        await using var application = await StartApplicationAsync();
        using var first = await ConnectAsync(application, GetClientUri(userId: "target-user"));
        using var second = await ConnectAsync(application, GetClientUri(userId: "target-user"));
        using var other = await ConnectAsync(application, GetClientUri(userId: "other-user"));
        using var firstConnected = await ReceiveJsonAsync(first);
        _ = await ReceiveJsonAsync(second);
        _ = await ReceiveJsonAsync(other);
        var firstConnectionId = firstConnected.RootElement.GetProperty("connectionId").GetString()!;

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Head,
            $"/api/hubs/{Hub}/users/target-user?api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        using (var request = CreateAuthorizedRequest(
            HttpMethod.Head,
            $"/api/hubs/{Hub}/users/missing?api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        using (var request = CreateAuthorizedRequest(
            HttpMethod.Put,
            $"/api/hubs/{Hub}/users/missing/groups/room?api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Put,
            $"/api/hubs/{Hub}/users/target-user/groups/room?api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        using (var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/groups/room/:send?api-version=2024-12-01"))
        {
            request.Content = new StringContent("group-message", Encoding.UTF8, "text/plain");
            using var response = await application.GetTestClient().SendAsync(request).OrTimeout();
            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        }
        using (var firstMessage = await ReceiveJsonAsync(first))
        using (var secondMessage = await ReceiveJsonAsync(second))
        {
            Assert.Equal("group-message", firstMessage.RootElement.GetProperty("data").GetString());
            Assert.Equal("group-message", secondMessage.RootElement.GetProperty("data").GetString());
        }
        await SendJsonAsync(other, """{"type":"ping"}""");
        using (var pong = await ReceiveJsonAsync(other))
        {
            Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
        }

        var filter = Uri.EscapeDataString($"connectionId eq '{firstConnectionId}'");
        using (var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/users/target-user/:send?filter={filter}&api-version=2024-12-01"))
        {
            request.Content = new StringContent("filtered-message", Encoding.UTF8, "text/plain");
            using var response = await application.GetTestClient().SendAsync(request).OrTimeout();
            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        }
        using (var firstMessage = await ReceiveJsonAsync(first))
        {
            Assert.Equal("filtered-message", firstMessage.RootElement.GetProperty("data").GetString());
        }
        await SendJsonAsync(second, """{"type":"ping"}""");
        using (var pong = await ReceiveJsonAsync(second))
        {
            Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
        }

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/users/target-user/:send?api-version=2024-12-01"))
        {
            request.Content = new StringContent("user-message", Encoding.UTF8, "text/plain");
            using var response = await application.GetTestClient().SendAsync(request).OrTimeout();
            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        }
        using (var firstMessage = await ReceiveJsonAsync(first))
        using (var secondMessage = await ReceiveJsonAsync(second))
        {
            Assert.Equal("user-message", firstMessage.RootElement.GetProperty("data").GetString());
            Assert.Equal("user-message", secondMessage.RootElement.GetProperty("data").GetString());
        }

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Delete,
            $"/api/hubs/{Hub}/users/target-user/groups/room?api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }
        foreach (var group in new[] { "room-a", "room-b" })
        {
            using var request = CreateAuthorizedRequest(
                HttpMethod.Put,
                $"/api/hubs/{Hub}/users/target-user/groups/{group}?api-version=2024-12-01");
            using var response = await application.GetTestClient().SendAsync(request).OrTimeout();
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        using (var request = CreateAuthorizedRequest(
            HttpMethod.Delete,
            $"/api/hubs/{Hub}/users/target-user/groups?api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }
        foreach (var group in new[] { "room", "room-a", "room-b" })
        {
            using var request = CreateAuthorizedRequest(
                HttpMethod.Head,
                $"/api/hubs/{Hub}/groups/{group}?api-version=2024-12-01");
            using var response = await application.GetTestClient().SendAsync(request).OrTimeout();
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/users/target-user/:closeConnections" +
            $"?excluded={Uri.EscapeDataString(firstConnectionId)}&reason=test-close&api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }
        var closeBuffer = new byte[256];
        var close = await second
            .ReceiveAsync(new ArraySegment<byte>(closeBuffer), CancellationToken.None)
            .OrTimeout();
        Assert.Equal(WebSocketMessageType.Close, close.MessageType);
        Assert.Equal("test-close", close.CloseStatusDescription);
        await SendJsonAsync(first, """{"type":"ping"}""");
        using (var pong = await ReceiveJsonAsync(first))
        {
            Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
        }

        await first.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
        await other.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task RestApi_BulkGroupOperations_ApplyFilterToCurrentConnections()
    {
        await using var application = await StartApplicationAsync();
        using var target = await ConnectAsync(
            application,
            GetClientUri(userId: "target-user"));
        using var other = await ConnectAsync(
            application,
            GetClientUri(groups: ["room-a"], userId: "other-user"));
        using var targetConnected = await ReceiveJsonAsync(target);
        using var otherConnected = await ReceiveJsonAsync(other);
        var targetConnectionId = targetConnected.RootElement.GetProperty("connectionId").GetString()!;
        var otherConnectionId = otherConnected.RootElement.GetProperty("connectionId").GetString()!;

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:addToGroups?api-version=2024-12-01"))
        {
            request.Content = new StringContent(
                """{"groups":["room-a","room-b"],"filter":"userId eq 'target-user'"}""",
                Encoding.UTF8,
                "application/json");
            using var response = await application.GetTestClient().SendAsync(request).OrTimeout();
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        Assert.Equal(
            new[] { targetConnectionId, otherConnectionId }.Order(StringComparer.InvariantCulture),
            (await GetGroupMembersAsync(application, "room-a"))
                .Order(StringComparer.InvariantCulture));
        Assert.Equal(
            [targetConnectionId],
            await GetGroupMembersAsync(application, "room-b"));

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:removeFromGroups?api-version=2024-12-01"))
        {
            request.Content = new StringContent(
                """{"groups":["room-a","room-b"],"filter":"userId eq 'target-user'"}""",
                Encoding.UTF8,
                "application/json");
            using var response = await application.GetTestClient().SendAsync(request).OrTimeout();
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        Assert.Equal([otherConnectionId], await GetGroupMembersAsync(application, "room-a"));
        Assert.Empty(await GetGroupMembersAsync(application, "room-b"));

        await target.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
        await other.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Theory]
    [InlineData("{}", "application/json", HttpStatusCode.BadRequest)]
    [InlineData("{\"groups\":[]}", "application/json", HttpStatusCode.BadRequest)]
    [InlineData("{\"groups\":[\" \" ]}", "application/json", HttpStatusCode.BadRequest)]
    [InlineData("{", "application/json", HttpStatusCode.BadRequest)]
    [InlineData(
        "{\"groups\":[\"room\"],\"filter\":\"userId lt 1\"}",
        "application/json",
        HttpStatusCode.BadRequest)]
    [InlineData("{\"groups\":[\"room\"]}", "application/xml", HttpStatusCode.UnsupportedMediaType)]
    public async Task RestApi_BulkGroupOperations_ValidateRequest(
        string body,
        string contentType,
        HttpStatusCode expectedStatus)
    {
        await using var application = await StartApplicationAsync();
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:addToGroups?api-version=2024-12-01");
        request.Content = new StringContent(body, Encoding.UTF8, contentType);

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(expectedStatus, response.StatusCode);
    }

    [Fact]
    public async Task RestApi_RemoveConnectionFromAllGroups_IsIdempotent()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            GetClientUri(groups: ["room-a", "room-b"]));
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Delete,
            $"/api/hubs/{Hub}/connections/{connectionId}/groups?api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }
        Assert.Empty(await GetGroupMembersAsync(application, "room-a"));
        Assert.Empty(await GetGroupMembersAsync(application, "room-b"));

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Delete,
            $"/api/hubs/{Hub}/connections/missing/groups?api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task RestApi_CloseGroupAndHubConnections_HonorExclusionsAndReason()
    {
        await using var application = await StartApplicationAsync();
        using var included = await ConnectAsync(application, GetClientUri(groups: ["room"]));
        using var excluded = await ConnectAsync(application, GetClientUri(groups: ["room"]));
        using var outside = await ConnectAsync(application, GetClientUri());
        _ = await ReceiveJsonAsync(included);
        using var excludedConnected = await ReceiveJsonAsync(excluded);
        using var outsideConnected = await ReceiveJsonAsync(outside);
        var excludedConnectionId = excludedConnected.RootElement.GetProperty("connectionId").GetString()!;
        var outsideConnectionId = outsideConnected.RootElement.GetProperty("connectionId").GetString()!;

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/groups/room/:closeConnections" +
            $"?excluded={Uri.EscapeDataString(excludedConnectionId)}&reason=group-close&api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }
        var closeBuffer = new byte[256];
        var groupClose = await included
            .ReceiveAsync(new ArraySegment<byte>(closeBuffer), CancellationToken.None)
            .OrTimeout();
        Assert.Equal(WebSocketMessageType.Close, groupClose.MessageType);
        Assert.Equal("group-close", groupClose.CloseStatusDescription);
        await AssertWebSocketIsOpenAsync(excluded);
        await AssertWebSocketIsOpenAsync(outside);

        using (var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:closeConnections" +
            $"?excluded={Uri.EscapeDataString(outsideConnectionId)}&reason=hub-close&api-version=2024-12-01"))
        using (var response = await application.GetTestClient().SendAsync(request).OrTimeout())
        {
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }
        var hubClose = await excluded
            .ReceiveAsync(new ArraySegment<byte>(closeBuffer), CancellationToken.None)
            .OrTimeout();
        Assert.Equal(WebSocketMessageType.Close, hubClose.MessageType);
        Assert.Equal("hub-close", hubClose.CloseStatusDescription);
        await AssertWebSocketIsOpenAsync(outside);

        await outside.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task RestApi_ListConnectionsInGroup_PagesInStableOrderAndHonorsTop()
    {
        await using var application = await StartApplicationAsync();
        using var first = await ConnectAsync(
            application,
            GetClientUri(groups: ["room"], userId: "first-user"));
        using var second = await ConnectAsync(
            application,
            GetClientUri(groups: ["room"], userId: "second-user"));
        using var third = await ConnectAsync(
            application,
            GetClientUri(groups: ["room"], userId: "third-user"));
        using var firstConnected = await ReceiveJsonAsync(first);
        using var secondConnected = await ReceiveJsonAsync(second);
        using var thirdConnected = await ReceiveJsonAsync(third);
        var usersByConnection = new Dictionary<string, string>
        {
            [firstConnected.RootElement.GetProperty("connectionId").GetString()!] = "first-user",
            [secondConnected.RootElement.GetProperty("connectionId").GetString()!] = "second-user",
            [thirdConnected.RootElement.GetProperty("connectionId").GetString()!] = "third-user",
        };
        var orderedConnectionIds = usersByConnection.Keys
            .Order(StringComparer.InvariantCulture)
            .ToArray();

        using var firstRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/hubs/{Hub}/groups/room/connections" +
            "?maxpagesize=1&top=2&api-version=2024-12-01");
        using var firstResponse = await application.GetTestClient().SendAsync(firstRequest).OrTimeout();
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        using var firstPage = JsonDocument.Parse(await firstResponse.Content.ReadAsByteArrayAsync());
        var firstMember = Assert.Single(firstPage.RootElement.GetProperty("value").EnumerateArray());
        Assert.Equal(orderedConnectionIds[0], firstMember.GetProperty("connectionId").GetString());
        Assert.Equal(
            usersByConnection[orderedConnectionIds[0]],
            firstMember.GetProperty("userId").GetString());
        var nextLink = firstPage.RootElement.GetProperty("nextLink").GetString();
        Assert.NotNull(nextLink);

        using var nextRequest = CreateAuthorizedRequest(
            HttpMethod.Get,
            new Uri(nextLink).PathAndQuery);
        using var nextResponse = await application.GetTestClient().SendAsync(nextRequest).OrTimeout();
        Assert.Equal(HttpStatusCode.OK, nextResponse.StatusCode);
        using var secondPage = JsonDocument.Parse(await nextResponse.Content.ReadAsByteArrayAsync());
        var secondMember = Assert.Single(secondPage.RootElement.GetProperty("value").EnumerateArray());
        Assert.Equal(orderedConnectionIds[1], secondMember.GetProperty("connectionId").GetString());
        Assert.False(secondPage.RootElement.TryGetProperty("nextLink", out _));

        await first.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
        await second.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
        await third.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Theory]
    [InlineData("maxpagesize=0")]
    [InlineData("maxpagesize=201")]
    [InlineData("maxpagesize=invalid")]
    [InlineData("top=0")]
    [InlineData("top=invalid")]
    public async Task RestApi_ListConnectionsInGroup_ValidatesPagingArguments(string query)
    {
        await using var application = await StartApplicationAsync();
        using var request = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/hubs/{Hub}/groups/room/connections?{query}&api-version=2024-12-01");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task OfficialSdk_MissingRestResources_ReturnExpectedResults()
    {
        var endpoint = $"http://127.0.0.1:{GetAvailablePort()}";
        var connectionString = $"Endpoint={endpoint};AccessKey={AccessKey};Version=1.0;";
        await using var application = await StartApplicationAsync(
            connectionString,
            useTestServer: false,
            endpoint);
        var serviceClient = new WebPubSubServiceClient(connectionString, Hub);

        Assert.False((await serviceClient.ConnectionExistsAsync("missing").OrTimeout()).Value);
        Assert.False((await serviceClient.GroupExistsAsync("missing").OrTimeout()).Value);

        var sendException = await Assert.ThrowsAsync<RequestFailedException>(() =>
            serviceClient.SendToConnectionAsync(
                "missing",
                BinaryData.FromString("message"),
                ContentType.TextPlain));
        Assert.Equal((int)HttpStatusCode.NotFound, sendException.Status);

        var addException = await Assert.ThrowsAsync<RequestFailedException>(() =>
            serviceClient.AddConnectionToGroupAsync("room", "missing"));
        Assert.Equal((int)HttpStatusCode.NotFound, addException.Status);

        var removeException = await Assert.ThrowsAsync<RequestFailedException>(() =>
            serviceClient.RemoveConnectionFromGroupAsync("room", "missing"));
        Assert.Equal((int)HttpStatusCode.NotFound, removeException.Status);

        await serviceClient.CloseConnectionAsync("missing").OrTimeout();
    }

    [Theory]
    [InlineData("POST", "/api/hubs/testHub/:generateToken")]
    [InlineData("POST", "/api/hubs/testHub/:addToGroups")]
    [InlineData("POST", "/api/hubs/testHub/:removeFromGroups")]
    [InlineData("POST", "/api/hubs/testHub/:closeConnections")]
    [InlineData("POST", "/api/hubs/testHub/:send")]
    [InlineData("POST", "/api/hubs/testHub/groups/room/:send")]
    [InlineData("POST", "/api/hubs/testHub/connections/connection/:send")]
    [InlineData("HEAD", "/api/hubs/testHub/connections/connection")]
    [InlineData("DELETE", "/api/hubs/testHub/connections/connection")]
    [InlineData("DELETE", "/api/hubs/testHub/connections/connection/groups")]
    [InlineData("HEAD", "/api/hubs/testHub/groups/room")]
    [InlineData("POST", "/api/hubs/testHub/groups/room/:closeConnections")]
    [InlineData("GET", "/api/hubs/testHub/groups/room/connections")]
    [InlineData("PUT", "/api/hubs/testHub/groups/room/connections/connection")]
    [InlineData("DELETE", "/api/hubs/testHub/groups/room/connections/connection")]
    [InlineData("HEAD", "/api/hubs/testHub/users/user")]
    [InlineData("POST", "/api/hubs/testHub/users/user/:closeConnections")]
    [InlineData("POST", "/api/hubs/testHub/users/user/:send")]
    [InlineData("DELETE", "/api/hubs/testHub/users/user/groups")]
    [InlineData("DELETE", "/api/hubs/testHub/users/user/groups/room")]
    [InlineData("PUT", "/api/hubs/testHub/users/user/groups/room")]
    public async Task RestApi_WithoutBearerToken_IsUnauthorized(string method, string path)
    {
        await using var application = await StartApplicationAsync();
        using var request = new HttpRequestMessage(new HttpMethod(method), path);

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(":send")]
    [InlineData("groups/room/:send")]
    [InlineData("connections/{connectionId}/:send")]
    [InlineData("users/user/:send")]
    public async Task RestApi_MessageTtl_IsAcceptedForImmediateDelivery(string route)
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(
            application,
            GetClientUri(groups: ["room"], userId: "user"));
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var resolvedRoute = route.Replace(
            "{connectionId}",
            Uri.EscapeDataString(connectionId),
            StringComparison.Ordinal);
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/{resolvedRoute}?messageTtlSeconds=30&api-version=2024-12-01");
        request.Content = new StringContent("message", Encoding.UTF8, "text/plain");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        using var delivered = await ReceiveJsonAsync(webSocket);
        Assert.Equal("message", delivered.RootElement.GetProperty("data").GetString());

        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Theory]
    [InlineData(":send", "abc")]
    [InlineData(":send", "-1")]
    [InlineData(":send", "301")]
    [InlineData("groups/room/:send", "abc")]
    [InlineData("groups/room/:send", "-1")]
    [InlineData("groups/room/:send", "301")]
    [InlineData("connections/missing/:send", "abc")]
    [InlineData("connections/missing/:send", "-1")]
    [InlineData("connections/missing/:send", "301")]
    [InlineData("users/user/:send", "abc")]
    [InlineData("users/user/:send", "-1")]
    [InlineData("users/user/:send", "301")]
    public async Task RestApi_InvalidMessageTtl_ReturnsBadRequest(string route, string ttl)
    {
        await using var application = await StartApplicationAsync();
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/{route}?messageTtlSeconds={Uri.EscapeDataString(ttl)}&api-version=2024-12-01");
        request.Content = new StringContent("message", Encoding.UTF8, "text/plain");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task RestApi_UnsupportedContentType_ReturnsUnsupportedMediaType()
    {
        await using var application = await StartApplicationAsync();
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:send?api-version=2024-12-01");
        request.Content = new StringContent("message", Encoding.UTF8, "application/xml");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
    }

    [Theory]
    [InlineData("clientType=MQTT", true)]
    [InlineData("clientType=invalid", false)]
    [InlineData("minutesToExpire=0", false)]
    public async Task RestApi_InvalidGenerateTokenArgument_ReturnsBadRequest(
        string query,
        bool isUnsupportedFeature)
    {
        await using var application = await StartApplicationAsync();
        using var request = CreateAuthorizedRequest(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:generateToken?{query}&api-version=2024-12-01");

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        if (isUnsupportedFeature)
        {
            await AssertUnsupportedFeatureAsync(response);
        }
        else
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }

    [Fact]
    public async Task OfficialSdk_EntraCompatibility_GeneratesUsableClientToken()
    {
        var endpoint = $"https://localhost:{GetAvailablePort()}";
        var connectionString = $"Endpoint={endpoint};AccessKey={AccessKey};Version=1.0;";
        using var certificate = CreateTestCertificate();
        await using var application = await StartApplicationAsync(
            connectionString,
            useTestServer: false,
            endpoint,
            certificate: certificate,
            allowUnvalidatedEntraTokens: true);
        var serviceClient = CreateEntraServiceClient(endpoint);

        var clientUri = serviceClient.GetClientAccessUri(
            userId: "entra-user",
            groups: ["room"],
            roles: ["webpubsub.sendToGroup.room"]);
        using var webSocket = new ClientWebSocket();
        webSocket.Options.AddSubProtocol(ReliableProtocol);
        webSocket.Options.RemoteCertificateValidationCallback = (_, _, _, _) => true;
        await webSocket.ConnectAsync(clientUri, CancellationToken.None).OrTimeout();

        using var connected = await ReceiveJsonAsync(webSocket);
        Assert.Equal("entra-user", connected.RootElement.GetProperty("userId").GetString());
        await serviceClient.SendToAllAsync(
            BinaryData.FromString("from-entra-rest"),
            ContentType.TextPlain).OrTimeout();
        using var delivered = await ReceiveJsonAsync(webSocket);
        Assert.Equal("from-entra-rest", delivered.RootElement.GetProperty("data").GetString());
        await webSocket.CloseAsync(
            WebSocketCloseStatus.NormalClosure,
            "Test complete.",
            CancellationToken.None);
    }

    [Fact]
    public async Task RestApi_AccessKeyTokenWithInvalidSignature_IsUnauthorized()
    {
        await using var application = await StartApplicationAsync();
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            audience: $"http://localhost/api/hubs/{Hub}/:send",
            notBefore: now.AddMinutes(-1),
            expires: now.AddHours(1),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
                    "INVALID-ACCESS-KEY-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")),
                SecurityAlgorithms.HmacSha256));
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:send")
        {
            Content = new StringContent("unauthorized", Encoding.UTF8, "text/plain"),
        };
        request.Headers.Authorization = new(
            "Bearer",
            new JwtSecurityTokenHandler().WriteToken(token));

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RestApi_UnvalidatedWebPubSubAudienceToken_IsUnauthorizedByDefault()
    {
        await using var application = await StartApplicationAsync();
        using var rsa = RSA.Create(2048);
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: "https://example.com/future-entra-issuer",
            audience: "https://webpubsub.azure.com",
            notBefore: now.AddMinutes(-1),
            expires: now.AddHours(1),
            signingCredentials: new SigningCredentials(
                new RsaSecurityKey(rsa),
                SecurityAlgorithms.RsaSha512));
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:send")
        {
            Content = new StringContent("unauthorized", Encoding.UTF8, "text/plain"),
        };
        request.Headers.Authorization = new(
            "Bearer",
            new JwtSecurityTokenHandler().WriteToken(token));

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RestApi_UnvalidatedWebPubSubAudienceToken_IsAcceptedWhenEnabled()
    {
        await using var application = await StartApplicationAsync(
            allowUnvalidatedEntraTokens: true);
        using var rsa = RSA.Create(2048);
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: "https://example.com/future-entra-issuer",
            audience: "https://webpubsub.azure.com",
            notBefore: now.AddMinutes(-1),
            expires: now.AddHours(1),
            signingCredentials: new SigningCredentials(
                new RsaSecurityKey(rsa),
                SecurityAlgorithms.RsaSha512));
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/hubs/{Hub}/:send")
        {
            Content = new StringContent("accepted", Encoding.UTF8, "text/plain"),
        };
        request.Headers.Authorization = new(
            "Bearer",
            new JwtSecurityTokenHandler().WriteToken(token));

        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    }

    private static async Task<WebApplication> StartApplicationAsync(
        string connectionString = ConnectionString,
        bool useTestServer = true,
        string? endpoint = null,
        int reliableMessageBufferCapacity = 1000,
        X509Certificate2? certificate = null,
        bool allowUnvalidatedEntraTokens = false)
    {
        var builder = EmulatorApplication.CreateBuilder(runtimeOptions: new EmulatorRuntimeOptions
        {
            ReconnectTimeout = TimeSpan.FromSeconds(10),
            ReliableMessageBufferCapacity = reliableMessageBufferCapacity,
        });
        if (useTestServer)
        {
            builder.WebHost.UseTestServer();
        }
        else
        {
            if (certificate is null)
            {
                builder.WebHost.UseUrls(endpoint!);
            }
            else
            {
                var uri = new Uri(endpoint!);
                builder.WebHost.ConfigureKestrel(options =>
                    options.ListenLocalhost(uri.Port, listen => listen.UseHttps(certificate)));
            }
        }
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["WebPubSub:ConnectionString"] = connectionString,
            ["WebPubSub:AllowUnvalidatedEntraTokens"] = allowUnvalidatedEntraTokens.ToString(),
        });

        var application = EmulatorApplication.Build(builder);
        await application.StartAsync().OrTimeout();
        return application;
    }

    private static async Task<WebSocket> ConnectAsync(
        WebApplication application,
        Uri uri,
        string? subprotocol = ReliableProtocol)
    {
        var client = application.GetTestServer().CreateWebSocketClient();
        if (subprotocol is not null)
        {
            client.SubProtocols.Add(subprotocol);
        }
        return await client.ConnectAsync(uri, CancellationToken.None).OrTimeout();
    }

    private static Uri GetClientUri(
        IEnumerable<string>? groups = null,
        IEnumerable<string>? roles = null,
        string? userId = null)
    {
        var serviceClient = new WebPubSubServiceClient(ConnectionString, Hub);
        var uri = serviceClient.GetClientAccessUri(
            userId: userId,
            groups: groups,
            roles: roles);
        var token = QueryHelpers.ParseQuery(uri.Query)["access_token"].ToString();
        var audience = new JwtSecurityTokenHandler().ReadJwtToken(token).Audiences.Single();
        Assert.Equal($"http://localhost/client/hubs/{Hub}", audience);
        return uri;
    }

    private static int GetAvailablePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            return ((IPEndPoint)listener.LocalEndpoint).Port;
        }
        finally
        {
            listener.Stop();
        }
    }

    private static AccessToken CreateEntraToken()
    {
        const string tenantId = "00000000-0000-0000-0000-000000000001";
        using var rsa = RSA.Create(2048);
        var expiresOn = DateTimeOffset.UtcNow.AddHours(1);
        var jwt = new JwtSecurityToken(
            issuer: $"https://login.microsoftonline.com/{tenantId}/v2.0",
            audience: "https://webpubsub.azure.com",
            claims: [new Claim("tid", tenantId)],
            notBefore: DateTime.UtcNow.AddMinutes(-1),
            expires: expiresOn.UtcDateTime,
            signingCredentials: new SigningCredentials(
                new RsaSecurityKey(rsa),
                SecurityAlgorithms.RsaSha256));
        return new AccessToken(new JwtSecurityTokenHandler().WriteToken(jwt), expiresOn);
    }

    private static HttpRequestMessage CreateAuthorizedRequest(HttpMethod method, string path)
    {
        var now = DateTime.UtcNow;
        var audience = new Uri(new Uri("http://localhost"), path).AbsoluteUri;
        var token = new JwtSecurityToken(
            audience: audience,
            notBefore: now.AddMinutes(-1),
            expires: now.AddHours(1),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(AccessKey)),
                SecurityAlgorithms.HmacSha256));
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new(
            "Bearer",
            new JwtSecurityTokenHandler().WriteToken(token));
        return request;
    }

    private static async Task<string[]> GetGroupMembersAsync(
        WebApplication application,
        string group)
    {
        using var request = CreateAuthorizedRequest(
            HttpMethod.Get,
            $"/api/hubs/{Hub}/groups/{group}/connections?api-version=2024-12-01");
        using var response = await application.GetTestClient().SendAsync(request).OrTimeout();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsByteArrayAsync());
        return body.RootElement.GetProperty("value")
            .EnumerateArray()
            .Select(member => member.GetProperty("connectionId").GetString()!)
            .ToArray();
    }

    private static async Task AssertWebSocketIsOpenAsync(WebSocket webSocket)
    {
        await SendJsonAsync(webSocket, """{"type":"ping"}""");
        using var pong = await ReceiveJsonAsync(webSocket);
        Assert.Equal("pong", pong.RootElement.GetProperty("type").GetString());
    }

    private static async Task AssertUnsupportedFeatureAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var error = JsonDocument.Parse(await response.Content.ReadAsByteArrayAsync());
        Assert.Equal("NotSupported", error.RootElement.GetProperty("code").GetString());
        Assert.False(string.IsNullOrWhiteSpace(error.RootElement.GetProperty("message").GetString()));
    }

    private static WebPubSubServiceClient CreateEntraServiceClient(string endpoint)
    {
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (_, _, _, _) => true,
        };
        var options = new WebPubSubServiceClientOptions
        {
            Transport = new HttpClientTransport(new HttpClient(handler)),
        };
        return new WebPubSubServiceClient(
            new Uri(endpoint),
            Hub,
            new StaticTokenCredential(CreateEntraToken()),
            options);
    }

    private static X509Certificate2 CreateTestCertificate()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(
            "CN=localhost",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, false));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(
            X509KeyUsageFlags.DigitalSignature,
            false));
        request.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(request.PublicKey, false));
        using var generated = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddMinutes(-1),
            DateTimeOffset.UtcNow.AddHours(1));
        return X509CertificateLoader.LoadPkcs12(
            generated.Export(X509ContentType.Pfx),
            password: null);
    }

    private static Uri AddReconnectParameters(
        Uri originalUri,
        string connectionId,
        string reconnectionToken)
    {
        var separator = string.IsNullOrEmpty(originalUri.Query) ? "?" : "&";
        return new Uri(
            $"{originalUri.AbsoluteUri}{separator}awps_connection_id={Uri.EscapeDataString(connectionId)}" +
            $"&awps_reconnection_token={Uri.EscapeDataString(reconnectionToken)}");
    }

    private static Task SendJsonAsync(WebSocket webSocket, string json)
    {
        var payload = Encoding.UTF8.GetBytes(json);
        return webSocket.SendAsync(
            payload,
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None);
    }

    private static async Task<JsonDocument> ReceiveJsonAsync(WebSocket webSocket)
    {
        var buffer = new byte[1024];
        using var message = new MemoryStream();

        while (true)
        {
            var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None).OrTimeout();
            Assert.NotEqual(WebSocketMessageType.Close, result.MessageType);
            message.Write(buffer, 0, result.Count);
            if (result.EndOfMessage)
            {
                return JsonDocument.Parse(message.ToArray());
            }
        }
    }

    private sealed class StaticTokenCredential(AccessToken token) : TokenCredential
    {
        public override AccessToken GetToken(
            TokenRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            return token;
        }

        public override ValueTask<AccessToken> GetTokenAsync(
            TokenRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            return ValueTask.FromResult(token);
        }
    }
}
