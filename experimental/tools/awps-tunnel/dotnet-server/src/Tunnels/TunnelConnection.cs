using System.Buffers;
using System.Collections.Concurrent;
using System.Net;
using System.Threading.Channels;

using Azure.Core;
using Azure.Messaging.WebPubSub.Clients;

record ConnectionTarget(Uri Endpoint, string? Target);

internal class TunnelConnection : IDisposable
{
    private const string HttpTunnelPath = "server/tunnel";

    private readonly ILogger _logger;
    private readonly string _hub;
    private readonly ILoggerFactory _loggerFactory;

    private TokenCredential _credential;

    private readonly IOutput _connectionStatus;
    private readonly IServiceEndpointStatusReporter _reporter;
    private Uri _endpoint;

    public Uri TunnelEndpoint => _endpoint;

    private ConcurrentDictionary<string, WebPubSubTunnelClient> _clients = new ConcurrentDictionary<string, WebPubSubTunnelClient>();
    public Func<TunnelHttpRequestMessage, CancellationToken, Task<TunnelHttpResponseMessage>>? RequestHandler { get; init; }

    public IReadOnlyList<string> Connections => _clients.Select(s => s.Key).ToArray();

    public TunnelConnection(IOutput connectionStatus, IServiceEndpointStatusReporter reporter, Uri endpoint, TokenCredential credential, string hub, ILoggerFactory loggerFactory)
    {
        _connectionStatus = connectionStatus;
        _reporter = reporter;
        _credential = credential;
        _endpoint = endpoint;
        _hub = hub;
        _reporter.ReportServiceEndpoint(endpoint.AbsoluteUri);
        _loggerFactory = loggerFactory;
        _logger = _loggerFactory.CreateLogger<TunnelConnection>();
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation($"Connecting to {TunnelEndpoint.AbsoluteUri}");
        _ = ReportLiveTraceUri(cancellationToken);
        SetStatus(ConnectionStatus.Connecting);
        try
        {
            // Always retry if connect fails
            await Utilities.WithRetry(StartCore, null, _logger, cancellationToken);
            SetStatus(ConnectionStatus.Connected);
            await LifetimeTask;
            SetStatus(ConnectionStatus.Disconnected);
        }
        catch (Exception e)
        {
            _logger.LogError($"Error connecting to {TunnelEndpoint.AbsoluteUri}: {e.Message}");
            SetStatus(ConnectionStatus.Disconnected);
        }
    }

    public void Dispose()
    {
        StopAsync().GetAwaiter().GetResult();
    }

    public async Task StopAsync()
    {
        _lifetimeTcs.TrySetResult(null);
        foreach (var (key, _) in _clients)
        {
            await StopConnectionAsync(key, default);
        }
    }

    private void SetStatus(ConnectionStatus status)
    {
        _connectionStatus.Status = status;
        _ = _reporter.ReportStatusChange(status);
    }

    private async Task StartCore(CancellationToken cancellationToken)
    {
        await StartConnectionAsync(new ConnectionTarget(_endpoint, null), cancellationToken);
        SetStatus(ConnectionStatus.Connected);
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

    private async Task StartConnectionAsync(string? endpoint, string? target, CancellationToken token = default)
    {
        if (endpoint != null && !string.Equals(endpoint, _endpoint.AbsoluteUri, StringComparison.OrdinalIgnoreCase))
        {
            // starting to another endpoint
            await StartConnectionAsync(new ConnectionTarget(new Uri(endpoint), target), token);
        }
        else
        {
            await StartConnectionAsync(new ConnectionTarget(_endpoint, target), token);
        }
    }

    public Task LifetimeTask => _lifetimeTcs.Task;

    private readonly TaskCompletionSource<object?> _lifetimeTcs = new TaskCompletionSource<object?>(TaskCreationOptions.RunContinuationsAsynchronously);

    private void TryEndLife()
    {
        if (_lifetimeTcs.Task.IsCompleted)
        {
            return;
        }

        if (_clients.All(s => s.Value.Ended))
        {
            _lifetimeTcs.TrySetResult(null);
        }
    }

    public async Task<string> StartConnectionAsync(ConnectionTarget target, CancellationToken cancellationToken)
    {
        var client = new WebPubSubTunnelClient(target.Endpoint, _credential, _hub, target.Target);
        client.Stopped += _ =>
        {
            TryEndLife();
            return Task.CompletedTask;
        };
        _clients[client.Id] = client;
        await client.StartAsync(cancellationToken);
        _ = ProcessMessages(client, cancellationToken);
        _logger.LogInformation($"Connected connections: ({_clients.Count})\n" + string.Join('\n', PrintClientLines()));
        return client.Id;
    }

    private IEnumerable<string> PrintClientLines()
    {
        foreach(var (_, client) in _clients)
        {
            yield return $"{client.Id}: ended? {client.Ended}";
        }
    }

    private async Task ProcessMessages(WebPubSubTunnelClient client, CancellationToken token)
    {
        while (await client.Reader.WaitToReadAsync(token))
        {
            var message = await client.Reader.ReadAsync(token);

            var buffer = new ReadOnlySequence<byte>(message.Data);
            if (TunnelMessageProtocol.Instance.TryParse(ref buffer, out var tunnelMessage))
            {
                switch (tunnelMessage)
                {
                    case TunnelHttpRequestMessage tunnelRequest:
                        {
                            _logger.LogInformation($"Getting request {tunnelRequest.TracingId}: {tunnelRequest.HttpMethod} {tunnelRequest.Url}");
                            var tunnelResponse = await RequestHandler!.Invoke(tunnelRequest, token);
                            // TODO: multiplex to mulitple client calls
                            await client.SendAsync(tunnelResponse, token);
                        }
                        break;
                    case TunnelConnectionReconnectMessage reconnect:
                        {
                            _logger.LogInformation($"Reconnect the connection: {reconnect.Message}.");
                            _ = StopConnectionAsync(client.Id, token);
                            await StartConnectionAsync(reconnect.Endpoint, reconnect.TargetId, token);
                        }
                        break;
                    case TunnelConnectionRebalanceMessage rebalance:
                        {
                            _logger.LogInformation($"Starting another rebalance connection: {rebalance.Message}.");
                            await StartConnectionAsync(rebalance.Endpoint, rebalance.TargetId, token);
                        }
                        break;
                    case TunnelConnectionCloseMessage close:
                        {
                            _logger.LogInformation($"Close the connection: {close.Message}.");
                            _ = StopConnectionAsync(client.Id, token);
                        }
                        break;
                    case TunnelServiceStatusMessage status:
                        {
                            _logger.LogInformation(status.Message);
                        }
                        break;
                    default:
                        {
                            _logger.LogInformation($"{tunnelMessage.Type} is not supported in current version");
                        }
                        break;
                }
            }
        }
    }

    public async Task StopConnectionAsync(string id, CancellationToken cancellationToken)
    {
        if (_clients.TryGetValue(id, out var client))
        {
            await client.StopAsync();
        }
    }

    private sealed class WebPubSubTunnelClient
    {
        private Channel<ServerDataMessage> _channel = Channel.CreateUnbounded<ServerDataMessage>();
        private WebPubSubClient _client;

        private TaskCompletionSource<string> _startedCts = new TaskCompletionSource<string>();

        public string Id { get; } = Guid.NewGuid().ToString();

        public bool Ended { get; private set; } = false;

        public ChannelReader<ServerDataMessage> Reader => _channel.Reader;

        public WebPubSubTunnelClient(Uri url, TokenCredential credential)
        {
            var options = new WebPubSubClientOptions()
            {
                Protocol = new TunnelServerProtocol(),
                AutoReconnect = false
            };
            _client = new WebPubSubClient(new WebPubSubClientCredential(token => GetAccessTokenUrl(url, credential, token)), options);
            _client.ServerMessageReceived += eventArgs =>
            {
                _channel.Writer.TryWrite(eventArgs.Message);
                return Task.CompletedTask;
            };
            _client.Connected += connected =>
            {
                // everytime when reconnect connectionid could change
                _startedCts.TrySetResult(connected.ConnectionId);
                return Task.CompletedTask;
            };
            _client.Stopped += stopped =>
            {
                Ended = true;
                // stopped before connected message received
                _startedCts.TrySetCanceled();
                _channel.Writer.Complete();
                Stopped?.Invoke(stopped);
                return Task.CompletedTask;
            };
        }

        public WebPubSubTunnelClient(Uri endpoint, TokenCredential credential, string hub, string? target) : this(GetUrl(endpoint.AbsoluteUri, hub, target), credential)
        {
        }

        public Task SendAsync(TunnelMessage message, CancellationToken token) => _client.SendEventAsync(message.Type.ToString(), BinaryData.FromBytes(
            TunnelMessageProtocol.Instance.GetBytes(message)
            ), WebPubSubDataType.Binary, fireAndForget: true, cancellationToken: token);

        public event Func<WebPubSubStoppedEventArgs, Task> Stopped;

        public async Task<string> StartAsync(CancellationToken cancellationToken)
        {
            await _client.StartAsync(cancellationToken);
            return await _startedCts.Task;
        }

        public Task StopAsync() => _client.StopAsync();

        private static Uri GetUrl(string endpoint, string hub, string? target)
        {
            var uriBuilder = new UriBuilder(endpoint);
            uriBuilder.Scheme = uriBuilder.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase) ? "ws" : "wss";
            uriBuilder.Path = uriBuilder.Path + HttpTunnelPath;
            var hubQuery = $"hub={WebUtility.UrlEncode(hub)}";
            if (string.IsNullOrEmpty(uriBuilder.Query))
            {
                uriBuilder.Query = hubQuery;
            }
            else
            {
                uriBuilder.Query = $"{uriBuilder.Query}&{hubQuery}";
            }
            if (string.IsNullOrEmpty(target))
            {
                return uriBuilder.Uri;
            }

            uriBuilder.Query = $"{uriBuilder.Query}&{WebUtility.UrlEncode(target)}";
            return uriBuilder.Uri;

        }

        private static async ValueTask<Uri> GetAccessTokenUrl(Uri endpoint, TokenCredential credential, CancellationToken cancellationToken)
        {
            var bearer = (await credential.GetTokenAsync(new TokenRequestContext(new string[] { "https://webpubsub.azure.com" }, claims: endpoint.AbsoluteUri), cancellationToken)).Token;
            return new Uri($"{endpoint.AbsoluteUri}&access_token={bearer}");
        }

        private sealed class TunnelServerProtocol : WebPubSubProtocol
        {
            public override string Name { get; } = nameof(TunnelServerProtocol);
            public override WebPubSubProtocolMessageType WebSocketMessageType { get; } = WebPubSubProtocolMessageType.Binary;
            public override bool IsReliable { get; } = false;

            public override ReadOnlyMemory<byte> GetMessageBytes(WebPubSubMessage message)
            {
                switch (message)
                {
                    case SendEventMessage sendEventMessage:
                        {
                            // Reuse event data to store tunnel message
                            return sendEventMessage.Data;
                        }
                    case SequenceAckMessage sequenceAckMessage:
                        {
                            // TODO: add when reliable is true
                            break;
                        }
                    default:
                        {
                            break;
                        }
                }

                return Array.Empty<byte>();
            }

            public override WebPubSubMessage ParseMessage(ReadOnlySequence<byte> input)
            {
                /*
                case ConnectedMessage connectedMessage:
                case DisconnectedMessage disconnectedMessage:
                case AckMessage ackMessage:
                case GroupDataMessage groupResponseMessage:
                case ServerDataMessage serverResponseMessage:
                    */
                // TODO: message to add sequence id for recovery case
                if (TunnelMessageProtocol.Instance.TryParse(input, out var message, out var offset))
                {
                    if (message is TunnelConnectionConnectedMessage connected)
                    {
                        return new ConnectedMessage(connected.UserId, connected.ConnectionId, connected.ReconnectionToken);
                    }

                    return new ServerDataMessage(WebPubSubDataType.Binary, new BinaryData(input.Slice(0, offset).ToArray()), null);
                }
                else
                {
                    // not supported
                    throw new NotSupportedException("Expecting tunnel message.");
                }
            }

            public override void WriteMessage(WebPubSubMessage message, IBufferWriter<byte> output)
            {
                switch (message)
                {
                    case SendEventMessage sendEventMessage:
                        {
                            // Reuse event data to store tunnel message
                            output.Write(sendEventMessage.Data);
                            break;
                        }
                    case SequenceAckMessage sequenceAckMessage:
                        {
                            // TODO: add when reliable is true
                            break;
                        }
                    default:
                        {
                            break;
                        }
                }
            }
        }
    }
}
