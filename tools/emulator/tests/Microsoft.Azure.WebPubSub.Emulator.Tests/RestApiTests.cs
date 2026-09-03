// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
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
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class RestApiTests
{
    private const string Hub = "chat";
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task OfficialServerSdkCanCheckAndSendToConnection()
    {
        await using var application = EmulatorApplication.Build(
            ["--urls=http://127.0.0.1:0"]);
        await application.StartAsync().WaitAsync(TestTimeout);
        var server = application.Services.GetRequiredService<IServer>();
        var endpoint = Assert.Single(
            server.Features.Get<IServerAddressesFeature>()!.Addresses);
        var connectionString =
            $"Endpoint={endpoint};AccessKey={EmulatorOptions.DefaultAccessKey};Version=1.0;";
        var serviceClient = new WebPubSubServiceClient(connectionString, Hub);
        using var webSocket = new ClientWebSocket();
        webSocket.Options.AddSubProtocol(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
        await webSocket.ConnectAsync(
            serviceClient.GetClientAccessUri(),
            CancellationToken.None).WaitAsync(TestTimeout);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;

        Assert.True((await serviceClient.ConnectionExistsAsync(connectionId)
            .WaitAsync(TestTimeout)).Value);

        await serviceClient.SendToConnectionAsync(
            connectionId,
            BinaryData.FromString("from-sdk"),
            ContentType.TextPlain).WaitAsync(TestTimeout);
        using var textMessage = await ReceiveJsonAsync(webSocket);
        Assert.Equal("server", textMessage.RootElement.GetProperty("from").GetString());
        Assert.Equal("from-sdk", textMessage.RootElement.GetProperty("data").GetString());

        await serviceClient.SendToConnectionAsync(
            connectionId,
            RequestContent.Create(BinaryData.FromString("""{"value":42}""")),
            ContentType.ApplicationJson).WaitAsync(TestTimeout);
        using var jsonMessage = await ReceiveJsonAsync(webSocket);
        Assert.Equal("json", jsonMessage.RootElement.GetProperty("dataType").GetString());
        Assert.Equal(42, jsonMessage.RootElement
            .GetProperty("data")
            .GetProperty("value")
            .GetInt32());

        Assert.False((await serviceClient.ConnectionExistsAsync("missing")
            .WaitAsync(TestTimeout)).Value);
        await serviceClient.SendToConnectionAsync(
            "missing",
            BinaryData.FromString("ignored"),
            ContentType.TextPlain).WaitAsync(TestTimeout);

        await serviceClient.CloseConnectionAsync(connectionId, "server-close")
            .WaitAsync(TestTimeout);
        using var disconnected = await ReceiveJsonAsync(webSocket);
        var close = await webSocket.ReceiveAsync(new byte[256], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal("system", disconnected.RootElement.GetProperty("type").GetString());
        Assert.Equal("disconnected", disconnected.RootElement.GetProperty("event").GetString());
        Assert.Equal(
            "Application server closed the connection. Reason: server-close",
            disconnected.RootElement.GetProperty("message").GetString());
        Assert.Equal(WebSocketMessageType.Close, close.MessageType);
        Assert.Equal(WebSocketCloseStatus.NormalClosure, close.CloseStatus);
        Assert.Equal(string.Empty, close.CloseStatusDescription);
        Assert.False((await serviceClient.ConnectionExistsAsync(connectionId)
            .WaitAsync(TestTimeout)).Value);
        await serviceClient.CloseConnectionAsync("missing").WaitAsync(TestTimeout);
    }

    [Fact]
    public async Task OfficialServerSdkCanManageConnectionGroupMembership()
    {
        await using var application = EmulatorApplication.Build(
            ["--urls=http://127.0.0.1:0"]);
        await application.StartAsync().WaitAsync(TestTimeout);
        var server = application.Services.GetRequiredService<IServer>();
        var endpoint = Assert.Single(
            server.Features.Get<IServerAddressesFeature>()!.Addresses);
        var connectionString =
            $"Endpoint={endpoint};AccessKey={EmulatorOptions.DefaultAccessKey};Version=1.0;";
        var serviceClient = new WebPubSubServiceClient(connectionString, Hub);
        using var webSocket = new ClientWebSocket();
        webSocket.Options.AddSubProtocol(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
        await webSocket.ConnectAsync(
            serviceClient.GetClientAccessUri(),
            CancellationToken.None).WaitAsync(TestTimeout);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        Assert.True(manager.TryGet(Hub, connectionId, out var connection));

        var addResponse = await serviceClient.AddConnectionToGroupAsync(
            "room",
            connection.ConnectionId).WaitAsync(TestTimeout);

        Assert.Equal((int)HttpStatusCode.OK, addResponse.Status);
        Assert.True(connection.Groups.ContainsKey("room"));

        var removeResponse = await serviceClient.RemoveConnectionFromGroupAsync(
            "room",
            connection.ConnectionId).WaitAsync(TestTimeout);

        Assert.Equal((int)HttpStatusCode.NoContent, removeResponse.Status);
        Assert.False(connection.Groups.ContainsKey("room"));

        var exception = await Assert.ThrowsAsync<RequestFailedException>(() =>
            serviceClient.AddConnectionToGroupAsync("room", "missing"));
        Assert.Equal((int)HttpStatusCode.NotFound, exception.Status);
        Assert.Equal("Error.Connection.NotExisted", exception.ErrorCode);
        var rawResponse = Assert.IsAssignableFrom<Response>(exception.GetRawResponse());
        Assert.True(rawResponse.Headers.TryGetValue("x-ms-error-code", out var errorCode));
        Assert.Equal(
            "Error.Connection.NotExisted",
            errorCode);
        using var error = JsonDocument.Parse(rawResponse.Content);
        Assert.Equal(
            "Connection `missing` is not found.",
            error.RootElement.GetProperty("message").GetString());
        Assert.Equal("Connection", error.RootElement.GetProperty("target").GetString());
        var missingRemoveResponse = await serviceClient.RemoveConnectionFromGroupAsync(
            "room",
            "missing").WaitAsync(TestTimeout);
        Assert.Equal((int)HttpStatusCode.NoContent, missingRemoveResponse.Status);
    }

    [Fact]
    public async Task DetachedReliableMembershipChangesAffectGroupDeliveryAfterRecovery()
    {
        await using var application = await StartApplicationAsync();
        var initial = await ConnectReliableAsync(application);
        using var initialSocket = initial.WebSocket;
        initialSocket.Abort();
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        Assert.True(manager.TryGet(Hub, initial.ConnectionId, out var connection));
        var upperGroupPath = $"/api/hubs/CHAT/groups/Room/connections/{initial.ConnectionId}" +
            "?api-version=2024-12-01";
        using var addRequest = CreateAuthorizedRequest(HttpMethod.Put, upperGroupPath);

        using var addResponse = await application.GetTestClient()
            .SendAsync(addRequest)
            .WaitAsync(TestTimeout);
        manager.SendToGroup(
            Hub,
            "room",
            new MessageData(MessageDataType.Text, "wrong-case"u8.ToArray()),
            sender: null,
            noEcho: false);
        manager.SendToGroup(
            Hub,
            "Room",
            new MessageData(MessageDataType.Text, "delivered"u8.ToArray()),
            sender: null,
            noEcho: false);
        using var recovered = await ConnectRecoveryAsync(
            application,
            initial.ConnectionId,
            initial.ReconnectionToken);
        using var delivered = await ReceiveJsonAsync(recovered);

        Assert.Equal(HttpStatusCode.OK, addResponse.StatusCode);
        Assert.True(connection.Groups.ContainsKey("Room"));
        Assert.False(connection.Groups.ContainsKey("room"));
        Assert.Equal("Room", delivered.RootElement.GetProperty("group").GetString());
        Assert.Equal("delivered", delivered.RootElement.GetProperty("data").GetString());

        var removePath = $"/api/hubs/chat/groups/Room/connections/{initial.ConnectionId}" +
            "?api-version=2024-12-01";
        using var removeRequest = CreateAuthorizedRequest(HttpMethod.Delete, removePath);
        using var removeResponse = await application.GetTestClient()
            .SendAsync(removeRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.NoContent, removeResponse.StatusCode);
        Assert.False(connection.Groups.ContainsKey("Room"));
    }

    [Fact]
    public async Task ConnectionExistsAndSendToConnectionUseLiveConnection()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var connectionPath = $"/api/hubs/{Hub}/connections/{connectionId}?api-version=2024-12-01";

        using var existsRequest = CreateAuthorizedRequest(HttpMethod.Head, connectionPath);
        using var existsResponse = await application.GetTestClient()
            .SendAsync(existsRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.OK, existsResponse.StatusCode);

        var sendPath = $"/api/hubs/{Hub}/connections/{connectionId}/:send?api-version=2024-12-01";
        using var sendRequest = CreateAuthorizedRequest(HttpMethod.Post, sendPath);
        sendRequest.Content = new StringContent("hello", Encoding.UTF8, "text/plain");
        sendRequest.Headers.Add("X-WebPubSub-Metadata-Trace", "first, final");
        using var sendResponse = await application.GetTestClient()
            .SendAsync(sendRequest)
            .WaitAsync(TestTimeout);
        using var message = await ReceiveJsonAsync(webSocket);

        Assert.Equal(HttpStatusCode.Accepted, sendResponse.StatusCode);
        Assert.Equal("message", message.RootElement.GetProperty("type").GetString());
        Assert.Equal("server", message.RootElement.GetProperty("from").GetString());
        Assert.Equal("text", message.RootElement.GetProperty("dataType").GetString());
        Assert.Equal("hello", message.RootElement.GetProperty("data").GetString());
        Assert.Equal(
            "final",
            message.RootElement.GetProperty("metadata").GetProperty("trace").GetString());

        using var binaryRequest = CreateAuthorizedRequest(HttpMethod.Post, sendPath);
        binaryRequest.Content = new ByteArrayContent([0, 1, 2]);
        binaryRequest.Content.Headers.ContentType =
            new MediaTypeHeaderValue("application/octet-stream");
        using var binaryResponse = await application.GetTestClient()
            .SendAsync(binaryRequest)
            .WaitAsync(TestTimeout);
        using var binaryMessage = await ReceiveJsonAsync(webSocket);

        Assert.Equal(HttpStatusCode.Accepted, binaryResponse.StatusCode);
        Assert.Equal("binary", binaryMessage.RootElement.GetProperty("dataType").GetString());
        Assert.Equal([0, 1, 2], binaryMessage.RootElement.GetProperty("data").GetBytesFromBase64());
    }

    [Fact]
    public async Task DirectSendToDetachedReliableConnectionReplaysInOrder()
    {
        await using var application = await StartApplicationAsync();
        var initial = await ConnectReliableAsync(application);
        using var initialSocket = initial.WebSocket;
        initialSocket.Abort();

        var sendPath =
            $"/api/hubs/{Hub}/connections/{initial.ConnectionId}/:send?api-version=2024-12-01";
        using var firstRequest = CreateAuthorizedRequest(HttpMethod.Post, sendPath);
        firstRequest.Content = new StringContent("first", Encoding.UTF8, "text/plain");
        firstRequest.Headers.Add("X-WebPubSub-Metadata-Trace", "rest");
        using var firstResponse = await application.GetTestClient()
            .SendAsync(firstRequest)
            .WaitAsync(TestTimeout);
        using var secondRequest = CreateAuthorizedRequest(HttpMethod.Post, sendPath);
        secondRequest.Content = new StringContent("second", Encoding.UTF8, "text/plain");
        using var secondResponse = await application.GetTestClient()
            .SendAsync(secondRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.Accepted, firstResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, secondResponse.StatusCode);

        using var recovered = await ConnectRecoveryAsync(
            application,
            initial.ConnectionId,
            initial.ReconnectionToken);
        using var first = await ReceiveJsonAsync(recovered);
        using var second = await ReceiveJsonAsync(recovered);

        Assert.Equal("server", first.RootElement.GetProperty("from").GetString());
        Assert.Equal("first", first.RootElement.GetProperty("data").GetString());
        Assert.Equal(1UL, first.RootElement.GetProperty("sequenceId").GetUInt64());
        Assert.Equal(
            "rest",
            first.RootElement.GetProperty("metadata").GetProperty("trace").GetString());
        Assert.Equal("second", second.RootElement.GetProperty("data").GetString());
        Assert.Equal(2UL, second.RootElement.GetProperty("sequenceId").GetUInt64());
    }

    [Fact]
    public async Task MissingConnectionHasServiceCompatibleStatuses()
    {
        await using var application = await StartApplicationAsync();
        const string connectionPath =
            "/api/hubs/chat/connections/missing?api-version=2024-12-01";
        using var existsRequest = CreateAuthorizedRequest(HttpMethod.Head, connectionPath);
        using var existsResponse = await application.GetTestClient()
            .SendAsync(existsRequest)
            .WaitAsync(TestTimeout);

        const string sendPath =
            "/api/hubs/chat/connections/missing/:send?api-version=2024-12-01";
        using var sendRequest = CreateAuthorizedRequest(HttpMethod.Post, sendPath);
        sendRequest.Content = new ByteArrayContent("ignored"u8.ToArray());
        sendRequest.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        using var sendResponse = await application.GetTestClient()
            .SendAsync(sendRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.NotFound, existsResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, sendResponse.StatusCode);
    }

    [Fact]
    public async Task CloseConnectionSendsDisconnectedMessageWithReason()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var reason = new string('x', 200);
        var path = $"/api/hubs/{Hub}/connections/{connectionId}" +
            $"?reason={reason}&api-version=2024-12-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Delete, path);

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);
        using var disconnected = await ReceiveJsonAsync(webSocket);
        var close = await webSocket.ReceiveAsync(new byte[256], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("system", disconnected.RootElement.GetProperty("type").GetString());
        Assert.Equal("disconnected", disconnected.RootElement.GetProperty("event").GetString());
        Assert.Equal(
            $"Application server closed the connection. Reason: {reason}",
            disconnected.RootElement.GetProperty("message").GetString());
        Assert.Equal(WebSocketMessageType.Close, close.MessageType);
        Assert.Equal(WebSocketCloseStatus.NormalClosure, close.CloseStatus);
        Assert.Equal(string.Empty, close.CloseStatusDescription);
    }

    [Fact]
    public async Task CloseMissingConnectionReturnsNoContent()
    {
        await using var application = await StartApplicationAsync();
        const string path =
            "/api/hubs/chat/connections/missing?api-version=2024-12-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Delete, path);

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task CloseDetachedReliableConnectionPreventsRecovery()
    {
        await using var application = await StartApplicationAsync();
        var initial = await ConnectReliableAsync(application);
        using var initialSocket = initial.WebSocket;
        initialSocket.Abort();
        var path = $"/api/hubs/{Hub}/connections/{initial.ConnectionId}" +
            "?api-version=2024-12-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Delete, path);

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);
        using var recovered = await ConnectRecoveryAsync(
            application,
            initial.ConnectionId,
            initial.ReconnectionToken);
        var close = await recovered.ReceiveAsync(new byte[256], CancellationToken.None)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(WebSocketMessageType.Close, close.MessageType);
        Assert.Equal(WebSocketCloseStatus.PolicyViolation, close.CloseStatus);
    }

    [Fact]
    public async Task CloseConnectionRequiresAuthorization()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var path = $"/api/hubs/{Hub}/connections/{connectionId}" +
            "?api-version=2024-12-01";

        using var response = await application.GetTestClient()
            .DeleteAsync(path)
            .WaitAsync(TestTimeout);
        using var existsRequest = CreateAuthorizedRequest(HttpMethod.Head, path);
        using var existsResponse = await application.GetTestClient()
            .SendAsync(existsRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, existsResponse.StatusCode);
    }

    [Fact]
    public async Task InvalidApiVersionDoesNotCloseConnection()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var invalidPath = $"/api/hubs/{Hub}/connections/{connectionId}" +
            "?api-version=unsupported";
        using var invalidRequest = CreateAuthorizedRequest(HttpMethod.Delete, invalidPath);

        using var invalidResponse = await application.GetTestClient()
            .SendAsync(invalidRequest)
            .WaitAsync(TestTimeout);
        var validPath = $"/api/hubs/{Hub}/connections/{connectionId}" +
            "?api-version=2024-12-01";
        using var existsRequest = CreateAuthorizedRequest(HttpMethod.Head, validPath);
        using var existsResponse = await application.GetTestClient()
            .SendAsync(existsRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.BadRequest, invalidResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, existsResponse.StatusCode);
    }

    [Fact]
    public async Task RejectedGroupMembershipRequestsDoNotMutateConnection()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var manager = application.Services.GetRequiredService<ConnectionManager>();
        Assert.True(manager.TryGet(Hub, connectionId, out var connection));
        var validPath = $"/api/hubs/{Hub}/groups/room/connections/{connectionId}" +
            "?api-version=2024-12-01";

        using var unauthorizedResponse = await application.GetTestClient()
            .PutAsync(validPath, content: null)
            .WaitAsync(TestTimeout);
        var invalidVersionPath = $"/api/hubs/{Hub}/groups/room/connections/{connectionId}" +
            "?api-version=unsupported";
        using var invalidVersionRequest = CreateAuthorizedRequest(
            HttpMethod.Put,
            invalidVersionPath);
        using var invalidVersionResponse = await application.GetTestClient()
            .SendAsync(invalidVersionRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.Unauthorized, unauthorizedResponse.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, invalidVersionResponse.StatusCode);
        Assert.False(connection.Groups.ContainsKey("room"));
    }

    [Theory]
    [InlineData(" ")]
    [InlineData("\t")]
    public async Task GroupMembershipRejectsWhitespaceGroupName(string group)
    {
        await using var application = await StartApplicationAsync();
        var path = $"/api/hubs/{Hub}/groups/{Uri.EscapeDataString(group)}" +
            "/connections/missing?api-version=2024-12-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Put, path);

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);
        using var error = JsonDocument.Parse(
            await response.Content.ReadAsByteArrayAsync().WaitAsync(TestTimeout));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Error.BadRequest", error.RootElement.GetProperty("code").GetString());
        Assert.False(string.IsNullOrEmpty(error.RootElement.GetProperty("message").GetString()));
    }

    [Fact]
    public async Task GroupMembershipRejectsGroupNameOverMaximumLength()
    {
        await using var application = await StartApplicationAsync();
        var group = new string('g', WebPubSubNameValidator.MaximumGroupNameLength + 1);
        var path = $"/api/hubs/{Hub}/groups/{group}" +
            "/connections/missing?api-version=2024-12-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Delete, path);

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task RestOperationsRequireRequestScopedBearerToken()
    {
        await using var application = await StartApplicationAsync();
        const string path = "/api/hubs/chat/connections/missing?api-version=2024-12-01";
        using var unauthorized = await application.GetTestClient()
            .SendAsync(new HttpRequestMessage(HttpMethod.Head, path))
            .WaitAsync(TestTimeout);
        using var wrongAudienceRequest = new HttpRequestMessage(HttpMethod.Head, path);
        wrongAudienceRequest.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            CreateToken("http://localhost/api/hubs/other/connections/missing"));
        using var wrongAudience = await application.GetTestClient()
            .SendAsync(wrongAudienceRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrongAudience.StatusCode);
    }

    [Fact]
    public async Task RestTokenAudienceCanOmitQueryString()
    {
        await using var application = await StartApplicationAsync();
        const string path = "/api/hubs/chat/connections/missing?api-version=2024-12-01";
        using var request = new HttpRequestMessage(HttpMethod.Head, path);
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            CreateToken("http://localhost/api/hubs/chat/connections/missing"));

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("2021-10-01")]
    [InlineData("2022-11-01")]
    [InlineData("2023-07-01")]
    [InlineData("2024-01-01")]
    [InlineData("2024-12-01")]
    public async Task AdvertisedApiVersionIsAccepted(string? apiVersion)
    {
        await using var application = await StartApplicationAsync();
        var path = "/api/hubs/chat/connections/missing" +
            (apiVersion is null ? string.Empty : $"?api-version={apiVersion}");
        using var request = CreateAuthorizedRequest(HttpMethod.Head, path);

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(
            "2021-10-01, 2022-11-01, 2023-07-01, 2024-01-01, 2024-12-01",
            response.Headers.GetValues("api-supported-versions").Single());
    }

    [Theory]
    [InlineData("unsupported")]
    [InlineData("2024-12-01,2023-07-01")]
    public async Task UnsupportedApiVersionIsRejected(string apiVersion)
    {
        await using var application = await StartApplicationAsync();
        var path =
            $"/api/hubs/chat/connections/missing/:send?api-version={Uri.EscapeDataString(apiVersion)}";
        using var request = CreateAuthorizedRequest(HttpMethod.Post, path);
        request.Content = new StringContent("hello", Encoding.UTF8, "text/plain");

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task DuplicateApiVersionIsRejected()
    {
        await using var application = await StartApplicationAsync();
        const string path =
            "/api/hubs/chat/connections/missing?api-version=2024-12-01&api-version=2023-07-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Head, path);

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task InvalidApiVersionDoesNotDeliverMessage()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var invalidPath =
            $"/api/hubs/{Hub}/connections/{connectionId}/:send?api-version=unsupported";
        using var invalidRequest = CreateAuthorizedRequest(HttpMethod.Post, invalidPath);
        invalidRequest.Content = new StringContent("invalid", Encoding.UTF8, "text/plain");

        using var invalidResponse = await application.GetTestClient()
            .SendAsync(invalidRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.BadRequest, invalidResponse.StatusCode);

        var validPath =
            $"/api/hubs/{Hub}/connections/{connectionId}/:send?api-version=2024-12-01";
        using var validRequest = CreateAuthorizedRequest(HttpMethod.Post, validPath);
        validRequest.Content = new StringContent("valid", Encoding.UTF8, "text/plain");
        using var validResponse = await application.GetTestClient()
            .SendAsync(validRequest)
            .WaitAsync(TestTimeout);
        using var delivered = await ReceiveJsonAsync(webSocket);

        Assert.Equal(HttpStatusCode.Accepted, validResponse.StatusCode);
        Assert.Equal("valid", delivered.RootElement.GetProperty("data").GetString());
    }

    [Fact]
    public async Task UnknownLengthBodyIsRejected()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var path =
            $"/api/hubs/chat/connections/{connectionId}/:send?api-version=2024-12-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Post, path);
        request.Content = new UnknownLengthContent("hello"u8.ToArray());
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("text/plain");

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var validRequest = CreateAuthorizedRequest(HttpMethod.Post, path);
        validRequest.Content = new StringContent("sentinel", Encoding.UTF8, "text/plain");
        using var validResponse = await application.GetTestClient()
            .SendAsync(validRequest)
            .WaitAsync(TestTimeout);
        using var delivered = await ReceiveJsonAsync(webSocket);

        Assert.Equal(HttpStatusCode.Accepted, validResponse.StatusCode);
        Assert.Equal("sentinel", delivered.RootElement.GetProperty("data").GetString());
    }

    [Theory]
    [InlineData("application/xml", "<message />", HttpStatusCode.UnsupportedMediaType)]
    [InlineData("application/json", "{", HttpStatusCode.BadRequest)]
    public async Task SendToConnectionValidatesContent(
        string contentType,
        string body,
        HttpStatusCode expectedStatus)
    {
        await using var application = await StartApplicationAsync();
        const string path =
            "/api/hubs/chat/connections/missing/:send?api-version=2024-12-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Post, path);
        request.Content = new StringContent(body, Encoding.UTF8);
        request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);

        Assert.Equal(expectedStatus, response.StatusCode);
    }

    [Fact]
    public async Task MalformedContentTypeDoesNotDeliverMessage()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var path =
            $"/api/hubs/chat/connections/{connectionId}/:send?api-version=2024-12-01";
        using var malformedRequest = CreateAuthorizedRequest(HttpMethod.Post, path);
        malformedRequest.Content = new ByteArrayContent("invalid"u8.ToArray());
        malformedRequest.Content.Headers.TryAddWithoutValidation(
            "Content-Type",
            "text/plain; charset=\"");

        using var malformedResponse = await application.GetTestClient()
            .SendAsync(malformedRequest)
            .WaitAsync(TestTimeout);

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, malformedResponse.StatusCode);

        using var validRequest = CreateAuthorizedRequest(HttpMethod.Post, path);
        validRequest.Content = new StringContent("sentinel", Encoding.UTF8, "text/plain");
        using var validResponse = await application.GetTestClient()
            .SendAsync(validRequest)
            .WaitAsync(TestTimeout);
        using var delivered = await ReceiveJsonAsync(webSocket);

        Assert.Equal(HttpStatusCode.Accepted, validResponse.StatusCode);
        Assert.Equal("sentinel", delivered.RootElement.GetProperty("data").GetString());
    }

    [Fact]
    public async Task ValidationErrorsUseStructuredResponse()
    {
        await using var application = await StartApplicationAsync();
        const string path =
            "/api/hubs/chat/connections/missing/:send?api-version=2024-12-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Post, path);
        request.Content = new StringContent("{", Encoding.UTF8, "application/json");

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);
        using var error = JsonDocument.Parse(
            await response.Content.ReadAsByteArrayAsync().WaitAsync(TestTimeout));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("Error.BadRequest", error.RootElement.GetProperty("code").GetString());
        Assert.Equal(
            "The request body is not a valid JSON.",
            error.RootElement.GetProperty("message").GetString());
        Assert.Equal("Request", error.RootElement.GetProperty("target").GetString());
    }

    [Fact]
    public async Task InvalidMetadataUsesStructuredResponse()
    {
        await using var application = await StartApplicationAsync();
        const string path =
            "/api/hubs/chat/connections/missing/:send?api-version=2024-12-01";
        using var request = CreateAuthorizedRequest(HttpMethod.Post, path);
        request.Content = new StringContent("hello", Encoding.UTF8, "text/plain");
        request.Headers.TryAddWithoutValidation(
            $"X-WebPubSub-Metadata-{new string('a', 257)}",
            "value");

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);
        using var error = JsonDocument.Parse(
            await response.Content.ReadAsByteArrayAsync().WaitAsync(TestTimeout));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Error.BadRequest", error.RootElement.GetProperty("code").GetString());
        Assert.False(string.IsNullOrEmpty(error.RootElement.GetProperty("message").GetString()));
        Assert.Equal("Request", error.RootElement.GetProperty("target").GetString());
    }

    [Theory]
    [InlineData("-1", HttpStatusCode.BadRequest)]
    [InlineData("301", HttpStatusCode.BadRequest)]
    [InlineData("invalid", HttpStatusCode.BadRequest)]
    [InlineData("1", HttpStatusCode.Accepted)]
    [InlineData("300", HttpStatusCode.Accepted)]
    public async Task SendToConnectionValidatesMessageTtl(
        string ttl,
        HttpStatusCode expectedStatus)
    {
        await using var application = await StartApplicationAsync();
        var path =
            $"/api/hubs/chat/connections/missing/:send?api-version=2024-12-01&messageTtlSeconds={ttl}";
        using var request = CreateAuthorizedRequest(HttpMethod.Post, path);
        request.Content = new StringContent("hello", Encoding.UTF8, "text/plain");

        using var response = await application.GetTestClient()
            .SendAsync(request)
            .WaitAsync(TestTimeout);

        Assert.Equal(expectedStatus, response.StatusCode);
    }

    [Fact]
    public async Task MessageTtlIsAcceptedForImmediateDelivery()
    {
        await using var application = await StartApplicationAsync();
        using var webSocket = await ConnectAsync(application);
        using var connected = await ReceiveJsonAsync(webSocket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString()!;
        var ttlPath = $"/api/hubs/{Hub}/connections/{connectionId}/:send" +
            "?api-version=2024-12-01&messageTtlSeconds=1";
        using var ttlRequest = CreateAuthorizedRequest(HttpMethod.Post, ttlPath);
        ttlRequest.Content = new StringContent("delivered", Encoding.UTF8, "text/plain");

        using var ttlResponse = await application.GetTestClient()
            .SendAsync(ttlRequest)
            .WaitAsync(TestTimeout);
        using var delivered = await ReceiveJsonAsync(webSocket);

        Assert.Equal(HttpStatusCode.Accepted, ttlResponse.StatusCode);
        Assert.Equal("delivered", delivered.RootElement.GetProperty("data").GetString());
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = EmulatorApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var application = EmulatorApplication.Build(builder);
        await application.StartAsync().WaitAsync(TestTimeout);
        return application;
    }

    private static async Task<WebSocket> ConnectAsync(WebApplication application)
    {
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(WebPubSubJsonV1PayloadProcessor.SubprotocolName);
        var path = $"{WebPubSubTokenService.ClientPathPrefix}{Hub}";
        var token = CreateToken($"http://localhost{path}");
        return await client.ConnectAsync(
            new Uri($"ws://localhost{path}?access_token={Uri.EscapeDataString(token)}"),
            CancellationToken.None).WaitAsync(TestTimeout);
    }

    private static async Task<(WebSocket WebSocket, string ConnectionId, string ReconnectionToken)>
        ConnectReliableAsync(WebApplication application)
    {
        var client = application.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add(WebPubSubJsonV1PayloadProcessor.ReliableSubprotocolName);
        var path = $"{WebPubSubTokenService.ClientPathPrefix}{Hub}";
        var token = CreateToken($"http://localhost{path}");
        var webSocket = await client.ConnectAsync(
            new Uri($"ws://localhost{path}?access_token={Uri.EscapeDataString(token)}"),
            CancellationToken.None).WaitAsync(TestTimeout);
        using var connected = await ReceiveJsonAsync(webSocket);
        return (
            webSocket,
            connected.RootElement.GetProperty("connectionId").GetString()!,
            connected.RootElement.GetProperty("reconnectionToken").GetString()!);
    }

    private static async Task<WebSocket> ConnectRecoveryAsync(
        WebApplication application,
        string connectionId,
        string reconnectionToken)
    {
        var client = application.GetTestServer().CreateWebSocketClient();
        var uri = $"ws://localhost{WebPubSubTokenService.ClientPathPrefix}{Hub}" +
            $"?awps_connection_id={Uri.EscapeDataString(connectionId)}" +
            $"&awps_reconnection_token={Uri.EscapeDataString(reconnectionToken)}";
        return await client.ConnectAsync(new Uri(uri), CancellationToken.None)
            .WaitAsync(TestTimeout);
    }

    private static HttpRequestMessage CreateAuthorizedRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            CreateToken($"http://localhost{path}"));
        return request;
    }

    private static string CreateToken(string audience)
    {
        var token = new JwtSecurityToken(
            audience: audience,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
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

    private sealed class UnknownLengthContent(byte[] content) : HttpContent
    {
        protected override Task SerializeToStreamAsync(
            Stream stream,
            TransportContext? context)
        {
            return stream.WriteAsync(content).AsTask();
        }

        protected override bool TryComputeLength(out long length)
        {
            length = 0;
            return false;
        }
    }
}
