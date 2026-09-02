// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class WebPubSubJsonV1PayloadProcessor : IClientPayloadProcessor
{
    public const string SubprotocolName = "json.webpubsub.azure.v1";
    public const string ReliableSubprotocolName = "json.reliable.webpubsub.azure.v1";

    private readonly ConnectionManager _connections;
    private readonly IWebPubSubConnectionLifetimeHandler _lifetimeHandler;
    private readonly ILogger<WebPubSubJsonV1PayloadProcessor> _logger;
    private readonly WebPubSubJsonV1Protocol _protocol;
    private readonly WebPubSubTokenService _tokenService;

    public WebPubSubJsonV1PayloadProcessor(
        ConnectionManager connections,
        IWebPubSubConnectionLifetimeHandler lifetimeHandler,
        WebPubSubJsonV1Protocol protocol,
        WebPubSubTokenService tokenService,
        ILogger<WebPubSubJsonV1PayloadProcessor> logger)
    {
        _connections = connections;
        _lifetimeHandler = lifetimeHandler;
        _protocol = protocol;
        _tokenService = tokenService;
        _logger = logger;
    }

    public void OnConnected(LogicalConnection connection)
    {
        var reconnectionToken = connection.IsReliable
            ? _tokenService.IssueReconnectionToken(connection.ConnectionId)
            : null;
        connection.Send(_protocol.WriteConnected(connection, reconnectionToken));
    }

    public async ValueTask<PayloadProcessingResult> ProcessAsync(
        LogicalConnection connection,
        WebSocketMessageType messageType,
        byte[] payload,
        CancellationToken cancellationToken)
    {
        if (messageType != WebSocketMessageType.Text)
        {
            return PayloadProcessingResult.Close(
                WebSocketCloseStatus.InvalidMessageType,
                "The JSON subprotocol requires text messages.");
        }

        WebPubSubClientRequest request;
        try
        {
            request = _protocol.ParseMessage(payload);
        }
        catch (InvalidDataException exception)
        {
            _logger.LogWarning(
                exception,
                "Connection {ConnectionId} sent an invalid JSON protocol message.",
                connection.ConnectionId);
            return PayloadProcessingResult.Close(
                WebSocketCloseStatus.InvalidPayloadData,
                "The client message is not a valid JSON protocol message.");
        }

        if (request is WebPubSubClientPingRequest)
        {
            connection.Send(_protocol.WritePong());
            return PayloadProcessingResult.Continue;
        }

        if (request is WebPubSubClientSequenceAckRequest sequenceAck)
        {
            connection.Acknowledge(sequenceAck.SequenceId);
            return PayloadProcessingResult.Continue;
        }

        if (request.AckId is { } ackId && connection.AckIdCache.Contains(ackId))
        {
            connection.Send(_protocol.WriteErrorAck(
                ackId,
                WebPubSubAckErrorName.Duplicate,
                $"Message with ack-id: {ackId} has been processed"));
            return PayloadProcessingResult.Continue;
        }

        if (request is WebPubSubClientSendEventRequest eventRequest)
        {
            await HandleEventAsync(connection, eventRequest, cancellationToken);
            return PayloadProcessingResult.Continue;
        }

        try
        {
            DispatchClientRequest(connection, request);
            if (request.AckId is { } successfulAckId)
            {
                connection.AckIdCache.Add(successfulAckId);
                connection.Send(_protocol.WriteAck(successfulAckId));
            }
        }
        catch (UnauthorizedAccessException exception)
        {
            _logger.LogWarning(
                "Connection {ConnectionId} failed to process a client message: {Reason}",
                connection.ConnectionId,
                exception.Message);
            WriteErrorAck(
                connection,
                request.AckId,
                WebPubSubAckErrorName.Forbidden,
                exception.Message);
        }
        catch (Exception exception)
        {
            _logger.LogWarning(
                exception,
                "Connection {ConnectionId} failed to process a client message.",
                connection.ConnectionId);
            WriteErrorAck(
                connection,
                request.AckId,
                WebPubSubAckErrorName.InternalServerError,
                "Internal server error");
        }

        return PayloadProcessingResult.Continue;
    }

    public WebSocketPayload EncodeGroupData(
        LogicalConnection connection,
        string group,
        string? fromUserId,
        MessageData data,
        ulong? sequenceId)
    {
        return _protocol.WriteGroupData(group, fromUserId, data, sequenceId);
    }

    public static bool IsSupportedSubprotocol(string? subprotocol)
    {
        return string.Equals(subprotocol, SubprotocolName, StringComparison.OrdinalIgnoreCase) ||
            IsReliableSubprotocol(subprotocol);
    }

    public static bool IsReliableSubprotocol(string? subprotocol)
    {
        return string.Equals(
            subprotocol,
            ReliableSubprotocolName,
            StringComparison.OrdinalIgnoreCase);
    }

    private void DispatchClientRequest(
        LogicalConnection connection,
        WebPubSubClientRequest request)
    {
        switch (request)
        {
            case WebPubSubClientJoinGroupRequest join:
                EnsureJoinLeavePermission(connection, join.Group, "join");
                connection.Groups.TryAdd(join.Group, 0);
                break;
            case WebPubSubClientLeaveGroupRequest leave:
                EnsureJoinLeavePermission(connection, leave.Group, "leave");
                connection.Groups.TryRemove(leave.Group, out _);
                break;
            case WebPubSubClientSendToGroupRequest send:
                if (!connection.CanSendToGroup(send.Group))
                {
                    throw new UnauthorizedAccessException(
                        $"The client does not have permission to send to group '{send.Group}'.");
                }
                _connections.SendToGroup(
                    connection.Hub,
                    send.Group,
                    send.Data,
                    connection,
                    send.NoEcho);
                break;
            default:
                throw new InvalidOperationException(
                    $"Unsupported client request '{request.GetType().Name}'.");
        }
    }

    private async Task HandleEventAsync(
        LogicalConnection connection,
        WebPubSubClientSendEventRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _lifetimeHandler.SendMessageAsync(
                connection,
                new ClientMessagePayload(request.EventName, request.Data),
                cancellationToken);
            if (result.Response is not null)
            {
                connection.SendData(
                    sequenceId => _protocol.WriteServerData(result.Response, sequenceId));
            }
            if (request.AckId is { } ackId)
            {
                connection.AckIdCache.Add(ackId);
                connection.Send(_protocol.WriteAck(ackId));
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            _logger.LogWarning(
                exception,
                "Connection {ConnectionId} failed to send event {EventName}.",
                connection.ConnectionId,
                request.EventName);
            WriteErrorAck(
                connection,
                request.AckId,
                WebPubSubAckErrorName.InternalServerError,
                "Internal server error");
        }
    }

    private void WriteErrorAck(
        LogicalConnection connection,
        ulong? ackId,
        WebPubSubAckErrorName errorName,
        string message)
    {
        if (ackId is { } value)
        {
            connection.Send(_protocol.WriteErrorAck(value, errorName, message));
        }
    }

    private static void EnsureJoinLeavePermission(
        LogicalConnection connection,
        string group,
        string action)
    {
        if (!connection.CanJoinLeaveGroup(group))
        {
            throw new UnauthorizedAccessException(
                $"The client does not have permission to {action} group '{group}'.");
        }
    }
}