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
        CancellationToken requestAborted,
        bool isInitialConnection = true)
    {
        using var linkedCancellation = CancellationTokenSource.CreateLinkedTokenSource(
            requestAborted,
            transport.Aborted);
        using var detachOnCancellation = linkedCancellation.Token.Register(
            () => connection.Detach(transport));
        try
        {
            if (!await connection.ProcessIfCurrentAsync(
                transport,
                () =>
                {
                    if (isInitialConnection)
                    {
                        processor.OnConnected(connection);
                    }
                    return ValueTask.CompletedTask;
                },
                linkedCancellation.Token))
            {
                return;
            }

            while (!linkedCancellation.IsCancellationRequested)
            {
                ReceivedWebSocketMessage? message = null;
                WebSocketCloseStatus? terminalCloseStatus = null;
                string terminalCloseDescription = string.Empty;
                var current = await connection.ProcessIfCurrentAsync(
                    transport,
                    async () =>
                    {
                        try
                        {
                            message = await transport.ReceiveAsync(linkedCancellation.Token);
                        }
                        catch (WebSocketMessageTooLargeException exception)
                        {
                            _logger.LogDebug(
                                exception,
                                "WebSocket connection {ConnectionId} exceeded the message size limit.",
                                connectionId);
                            terminalCloseStatus = WebSocketCloseStatus.MessageTooBig;
                            terminalCloseDescription = "The client message is too large.";
                            connection.CloseIfCurrent(
                                transport,
                                terminalCloseStatus.Value,
                                terminalCloseDescription);
                            return;
                        }
                        catch (InvalidDataException exception)
                        {
                            _logger.LogDebug(
                                exception,
                                "WebSocket connection {ConnectionId} received an invalid frame.",
                                connectionId);
                            terminalCloseStatus = WebSocketCloseStatus.ProtocolError;
                            terminalCloseDescription = "The client frame is invalid.";
                            connection.CloseIfCurrent(
                                transport,
                                terminalCloseStatus.Value,
                                terminalCloseDescription);
                            return;
                        }

                        if (message.IsClose)
                        {
                            if (message.CloseStatus == WebSocketCloseStatus.NormalClosure)
                            {
                                terminalCloseStatus = WebSocketCloseStatus.NormalClosure;
                                terminalCloseDescription =
                                    message.CloseStatusDescription ?? string.Empty;
                                connection.CloseIfCurrent(
                                    transport,
                                    terminalCloseStatus.Value,
                                    terminalCloseDescription);
                            }
                            else
                            {
                                transport.Abort();
                            }
                            return;
                        }

                        if (transport.IsClosing)
                        {
                            return;
                        }

                    },
                    linkedCancellation.Token);
                if (!current)
                {
                    break;
                }

                if (terminalCloseStatus is { } closeStatus)
                {
                    await transport.CloseAsync(
                        closeStatus,
                        terminalCloseDescription);
                    break;
                }

                if (message?.IsClose == true)
                {
                    break;
                }

                if (message is null)
                {
                    continue;
                }

                var processing = await connection.ProcessReceivedMessageAsync(
                    () => processor.ProcessAsync(
                        connection,
                        message.MessageType,
                        message.Payload,
                        linkedCancellation.Token),
                    linkedCancellation.Token);
                if (processing is null)
                {
                    break;
                }

                var (result, closingTransport) = processing.Value;
                if (result.CloseStatus is { } processingCloseStatus)
                {
                    if (closingTransport is not null)
                    {
                        await closingTransport.CloseAsync(
                            processingCloseStatus,
                            result.CloseDescription ?? string.Empty);
                    }
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
            connection.CloseIfCurrent(
                transport,
                WebSocketCloseStatus.MessageTooBig,
                "The client message is too large.");
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
            connection.CloseIfCurrent(
                transport,
                WebSocketCloseStatus.ProtocolError,
                "The client frame is invalid.");
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