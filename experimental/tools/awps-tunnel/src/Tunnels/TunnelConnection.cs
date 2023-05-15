using System.IO.Pipelines;
using System.Net;
using System.Net.WebSockets;
using System.Threading;

using Azure.Core;

using Microsoft.Extensions.Azure;
using Microsoft.Net.Http.Headers;

internal class TunnelConnection : IDisposable
{
    private const string HttpTunnelPath = "server/tunnel";
    private readonly TaskCompletionSource<WebSocketCloseStatus?> _closeTcs = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private volatile WebSocketConnection? _webSocket;

    private readonly ILogger _logger;
    private readonly string _hub;
    private readonly ILoggerFactory _loggerFactory;

    private TokenCredential _credential;

    // Can change with every reconnect
    private string? _target;
    private Uri? _tunnelEndpoint;
    private readonly IOutput _connectionStatus;
    private readonly IServiceEndpointStatusReporter _reporter;
    private readonly IRepository<HttpItem> _store;
    private Uri _endpoint;
    private volatile bool _allowReconnect;

    public string? Target
    {
        get => _target;
        set
        {
            if (value != _target)
            {
                _target = value;
                _tunnelEndpoint = GetTunnelEndpoint();
            }
        }
    }

    public Uri TunnelEndpoint
    {
        get
        {
            if (_tunnelEndpoint == null)
            {
                _tunnelEndpoint = GetTunnelEndpoint();
            }

            return _tunnelEndpoint;
        }
    }

    public Func<TunnelRequestMessage, CancellationToken, Task<TunnelResponseMessage>>? RequestHandler { get; init; }

    public TunnelConnection(IOutput connectionStatus, IServiceEndpointStatusReporter reporter, IRepository<HttpItem> store, Uri endpoint, TokenCredential credential, string hub, ILoggerFactory loggerFactory)
    {
        _connectionStatus = connectionStatus;
        _reporter = reporter;
        _store = store;
        _credential = credential;
        _hub = hub;
        SetEndpoint(endpoint);
        _loggerFactory = loggerFactory;
        _logger = _loggerFactory.CreateLogger<TunnelConnection>();
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        do
        {
            // always allow reconnect unless explicitly set
            _allowReconnect = true;

            _logger.LogInformation($"Connecting to {TunnelEndpoint.AbsoluteUri}");
            SetStatus(ConnectionStatus.Connecting);
            try
            {
                // Always retry if connect fails
                await Utilities.WithRetry(RunCore, null, _logger, cancellationToken);
            }
            catch (Exception e)
            {
                _logger.LogError($"Error connecting to {TunnelEndpoint.AbsoluteUri}: {e.Message}");
            }
            // Wait for 1 second before reconnect
            await Utilities.Delay(1000, cancellationToken);
        } while (_allowReconnect && !cancellationToken.IsCancellationRequested);
    }

    public void Dispose()
    {
        _webSocket?.Dispose();
    }

    public Task StopAsync()
    {
        return _webSocket?.StopAsync() ?? Task.CompletedTask;
    }

    private void SetEndpoint(Uri endpoint)
    {
        if (Equals(_endpoint, endpoint))
        {
            return;
        }
        _endpoint = endpoint;
        _tunnelEndpoint = GetTunnelEndpoint();
        _reporter.ReportServiceEndpoint(endpoint.AbsoluteUri);
    }

    private void SetStatus(ConnectionStatus status)
    {
        _connectionStatus.Status = status;
        _ = _reporter.ReportStatusChange(status);
    }

    private async Task RunCore(CancellationToken cancellationToken)
    {
        var bearer = (await _credential.GetTokenAsync(new TokenRequestContext(new string[] { "https://webpubsub.azure.com" }, claims: TunnelEndpoint.AbsoluteUri), cancellationToken)).Token;
        var ws = _webSocket = new WebSocketConnection(TunnelEndpoint, bearer, _logger, cancellationToken);
        _ = ReportLiveTraceUri(cancellationToken);
        ws.OnMessage = m => ProcessTunnelMessageAsync(m, cancellationToken);
        ws.OnConnected = () =>
        {
            SetStatus(ConnectionStatus.Connected);
            _logger.LogInformation("Connected to " + TunnelEndpoint.AbsoluteUri); return Task.CompletedTask;
        };
        ws.OnDisconnected = (e, ex) =>
        {
            SetStatus(ConnectionStatus.Disconnected);
            _logger.LogInformation($"Disconnected from {TunnelEndpoint.AbsoluteUri}: {e} {ex?.Message}"); return Task.CompletedTask;
        };
        await ws.LifecycleTask;
    }

    private async Task ReportLiveTraceUri(CancellationToken cancellationToken)
    {
        var uriBuilder = new UriBuilder(_endpoint);
        uriBuilder.Path = "livetrace";
        var clientToken = (await _credential.GetTokenAsync(new TokenRequestContext(new string[] { "https://webpubsub.azure.com" },
            claims: uriBuilder.Uri.AbsoluteUri), cancellationToken)).Token;

        uriBuilder.Path = "livetrace/tool";
        var clientToolToken = (await _credential.GetTokenAsync(new TokenRequestContext(new string[] { "https://webpubsub.azure.com" },
            claims: uriBuilder.Uri.AbsoluteUri), cancellationToken)).Token;

        uriBuilder.Query = $"livetrace_access_token={clientToken}&access_token={clientToolToken}";
        var uri = uriBuilder.Uri;
        await _reporter.ReportLiveTraceUrl(uri.AbsoluteUri);
    }

    private Uri GetTunnelEndpoint()
    {
        var uriBuilder = new UriBuilder(_endpoint.AbsoluteUri);
        uriBuilder.Scheme = uriBuilder.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase) ? "ws" : "wss";
        uriBuilder.Path = uriBuilder.Path + HttpTunnelPath;
        var hubQuery = $"hub={WebUtility.UrlEncode(_hub)}";
        if (string.IsNullOrEmpty(uriBuilder.Query))
        {
            uriBuilder.Query = hubQuery;
        }
        else
        {
            uriBuilder.Query = $"{uriBuilder.Query}&{hubQuery}";
        }
        var target = _target;
        if (string.IsNullOrEmpty(target))
        {
            return uriBuilder.Uri;
        }

        uriBuilder.Query = $"{uriBuilder.Query}&{WebUtility.UrlEncode(target)}";
        return uriBuilder.Uri;
    }

    private async Task ProcessTunnelMessageAsync(TunnelMessage message, CancellationToken token)
    {
        switch (message!)
        {
            case TunnelRequestMessage tunnelRequest:
                {
                    _logger.LogInformation($"Getting request {tunnelRequest.TracingId}: {tunnelRequest.HttpMethod} {tunnelRequest.Url}");
                    var tunnelResponse = await RequestHandler!.Invoke(tunnelRequest, token);
                    using var writer = new MemoryBufferWriter();
                    TunnelMessageProtocol.Instance.Write(tunnelResponse, writer);
                    using var owner = writer.CreateMemoryOwner();
                    await _webSocket!.SendAsync(owner.Memory, token);
                }
                break;
            case ServiceReconnectTunnelMessage reconnect:
                {
                    _logger.LogInformation($"Reconnect the connection: {reconnect.Message}.");
                    await Reconnect(reconnect, token);
                }
                break;
            case ConnectionCloseTunnelMessage close:
                {
                    _logger.LogInformation($"Close the connection: {close.Message}.");
                    await Close();
                }
                break;
            case ServiceStatusTunnelMessage status:
                {
                    _logger.LogInformation(status.Message);
                }
                break;
            default:
                {
                    _logger.LogInformation($"{message.Type} is not supported in current version");
                }
                break;
        }
    }

    private async Task Reconnect(ServiceReconnectTunnelMessage? reconnect = null, CancellationToken token = default)
    {
        _allowReconnect = true;
        SetStatus(ConnectionStatus.Reconnecting);
        if (reconnect != null)
        {
            if (!string.IsNullOrEmpty(reconnect.TargetId))
            {
                Target = reconnect.TargetId;
            }
            if (!string.IsNullOrEmpty(reconnect.Endpoint))
            {
                SetEndpoint(new Uri(reconnect.Endpoint));
            }
        }
        await StopAsync();
    }

    private async Task Close()
    {
        _allowReconnect = false;
        await StopAsync();
    }

    private sealed class WebSocketConnection : IDisposable
    {
        private readonly Uri _endpoint;
        private readonly ILogger _logger;
        private readonly ClientWebSocket _webSocket;

        public Task LifecycleTask { get; }

        public WebSocketConnection(Uri endpoint, string token, ILogger logger, CancellationToken cancellation)
        {
            _endpoint = endpoint;
            _logger = logger;
            _webSocket = new ClientWebSocket();
            _webSocket.Options.SetRequestHeader(HeaderNames.Authorization, "Bearer " + token);

            // start the life cycle
            LifecycleTask = RunAsync(cancellation);
        }

        public ValueTask SendAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken)
        {
            return _webSocket.SendAsync(buffer, WebSocketMessageType.Binary, true, cancellationToken);
        }

        public async Task StopAsync()
        {
            try
            {
                if (_webSocket.State != WebSocketState.Closed)
                {
                    // Block a Start from happening until we've finished capturing the connection state.
                    await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", default);
                }
            }
            catch { }

            try
            {
                await LifecycleTask.ConfigureAwait(false);
            }
            catch { }
        }

        public Func<Task>? OnConnected { get; set; }

        public Func<DisconnectEvent, Exception?, Task>? OnDisconnected { get; set; }

        public Func<TunnelMessage, Task>? OnMessage { get; set; }

        private async Task RunAsync(CancellationToken cancellation)
        {
            await _webSocket.ConnectAsync(_endpoint, cancellation).ConfigureAwait(false);
            await (OnConnected?.Invoke() ?? Task.CompletedTask).ConfigureAwait(false);
            await ReceiveLoop(cancellation).ConfigureAwait(false);
        }

        private async Task ReceiveLoop(CancellationToken token)
        {
            var pipe = new Pipe();
            Task writing = WriteAsync(pipe.Writer, token);
            Task reading = ReadAsync(pipe.Reader, token);
            await Task.WhenAll(reading, writing);

            async Task WriteAsync(PipeWriter writer, CancellationToken token)
            {
                while (!token.IsCancellationRequested)
                {
                    var memory = writer.GetMemory();
                    ValueWebSocketReceiveResult receiveResult;
                    try
                    {
                        receiveResult = await _webSocket.ReceiveAsync(memory, token);
                    }
                    catch (Exception ex) when (ex is InvalidOperationException || ex is ObjectDisposedException)
                    {
                        // _webSocket ends remotely
                        OnDisconnected?.Invoke(DisconnectEvent.ClosedWithException, ex);
                        break;
                    }
                    catch (OperationCanceledException)
                    {
                        // cancelled
                        OnDisconnected?.Invoke(DisconnectEvent.Cancelled, null);
                        break;
                    }
                    catch (Exception ex)
                    {
                        OnDisconnected?.Invoke(DisconnectEvent.ClosedWithException, ex);
                        _logger.LogError("Error receiving", ex);
                        break;
                    }

                    // Need to check again for NetCoreApp2.2 because a close can happen between a 0-byte read and the actual read
                    if (receiveResult.MessageType == WebSocketMessageType.Close)
                    {
                        try
                        {
                            if (_webSocket.State != WebSocketState.Closed)
                            {
                                await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, default);
                            }
                        }
                        catch
                        {
                            // It is possible that the remote is already closed
                        }

                        OnDisconnected?.Invoke(DisconnectEvent.NormalClosure, null);
                        break;
                    }

                    // always binary
                    if (receiveResult.MessageType != WebSocketMessageType.Binary)
                    {
                        OnDisconnected?.Invoke(DisconnectEvent.ClosedWithInvalidMessageType, null);
                        _logger.LogError($"Error receiving {receiveResult.MessageType} message type.");
                        break;
                    }

                    writer.Advance(receiveResult.Count);

                    // Make the data available to the PipeReader.
                    FlushResult result = await writer.FlushAsync();

                    if (result.IsCompleted)
                    {
                        break;
                    }
                }

                await writer.CompleteAsync();
            }

            async Task ReadAsync(PipeReader reader, CancellationToken token)
            {
                while (!token.IsCancellationRequested)
                {
                    try
                    {
                        ReadResult result = await reader.ReadAsync(token);
                        var buffer = result.Buffer;
                        while (TunnelMessageProtocol.Instance.TryParse(ref buffer, out var message))
                        {
                            if (OnMessage != null)
                            {
                                try
                                {
                                    await OnMessage.Invoke(message);
                                }
                                catch (Exception ex)
                                {
                                    _logger.LogError($"Error handling message {message.GetType().Name}: {ex.Message}.", ex);
                                }
                            }
                        }
                        reader.AdvanceTo(buffer.Start, buffer.End);
                        if (result.IsCompleted || result.IsCanceled)
                        {
                            break;
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }

                await reader.CompleteAsync();
            }
        }

        public void Dispose()
        {
            _webSocket.Dispose();
        }

        public enum DisconnectEvent
        {
            NormalClosure,
            Cancelled,
            ClosedWithException,
            ClosedWithInvalidMessageType
        }
    }
}
