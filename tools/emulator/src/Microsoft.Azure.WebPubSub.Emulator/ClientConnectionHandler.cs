// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class ClientConnectionHandler
{
    private readonly ILogger<ClientConnectionHandler> _logger;

    public ClientConnectionHandler(ILogger<ClientConnectionHandler> logger)
    {
        _logger = logger;
    }

    public async Task RunAsync(
        string connectionId,
        LogicalConnection connection,
        SocketTransport transport,
        IClientPayloadProcessor processor,
        CancellationToken requestAborted)
    {
        using var linkedCancellation = CancellationTokenSource.CreateLinkedTokenSource(
            requestAborted,
            transport.Aborted);
        try
        {
            processor.OnConnected(connection);
            while (!linkedCancellation.IsCancellationRequested)
            {
                var message = await transport.ReceiveAsync(linkedCancellation.Token);
                if (message.IsClose)
                {
                    if (message.CloseStatus == WebSocketCloseStatus.NormalClosure)
                    {
                        await transport.AcknowledgeCloseAsync(message);
                    }
                    else
                    {
                        transport.Abort();
                    }
                    break;
                }

                if (transport.IsClosing)
                {
                    continue;
                }

                var result = await processor.ProcessAsync(
                    connection,
                    message.MessageType,
                    message.Payload,
                    linkedCancellation.Token);
                if (result.CloseStatus is { } closeStatus)
                {
                    await transport.CloseAsync(
                        closeStatus,
                        result.CloseDescription ?? string.Empty);
                    break;
                }
            }
        }
        catch (OperationCanceledException) when (linkedCancellation.IsCancellationRequested)
        {
        }
        catch (WebSocketMessageTooLargeException exception)
        {
            _logger.LogDebug(
                exception,
                "WebSocket connection {ConnectionId} exceeded the message size limit.",
                connectionId);
            await transport.CloseAsync(
                WebSocketCloseStatus.MessageTooBig,
                "The client message is too large.");
        }
        catch (InvalidDataException exception)
        {
            _logger.LogDebug(
                exception,
                "WebSocket connection {ConnectionId} received an invalid frame.",
                connectionId);
            await transport.CloseAsync(
                WebSocketCloseStatus.ProtocolError,
                "The client frame is invalid.");
        }
        catch (Exception exception) when (
            exception is WebSocketException or ObjectDisposedException)
        {
            _logger.LogDebug(
                exception,
                "WebSocket connection {ConnectionId} ended.",
                connectionId);
            transport.Abort();
        }
    }
}