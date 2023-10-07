using System.Net;

using Microsoft.Extensions.Options;

internal class TunnelService
{
    private readonly TunnelServiceOptions _options;
    private readonly IOutput _connectionStatus;
    private readonly IStateNotifier _dataHub;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TunnelService> _logger;
    private readonly ILoggerFactory _loggerFactory;

    private readonly Uri _localServerUri;

    public TunnelService(IOutput connectionStatus, IStateNotifier dataHub, IOptions<TunnelServiceOptions> options, IHttpClientFactory httpClientFactory, ILoggerFactory loggerFactory)
    {
        _options = options.Value;
        _connectionStatus = connectionStatus;
        _dataHub = dataHub;
        _httpClientFactory = httpClientFactory;
        _loggerFactory = loggerFactory;
        _logger = loggerFactory.CreateLogger<TunnelService>();
        _localServerUri = new UriBuilder(_options.LocalScheme, "localhost", _options.LocalPort).Uri;
        _dataHub.ReportLocalServerUrl(_localServerUri.AbsoluteUri);
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var listener = new TunnelConnection(_connectionStatus, _dataHub, _options.Endpoint,
            _options.Credential, _options.Hub, _loggerFactory)
        {
            RequestHandler = ProcessTunnelRequest
        };

        await listener.RunAsync(cancellationToken);
    }

    public static HttpRequestMessage CreateProxyHttpRequest(HttpRequestMessage request, Uri uri)
    {
        if (request.RequestUri == null)
        {
            throw new ArgumentNullException(nameof(request.RequestUri));
        }

        var uriBuilder = new UriBuilder(request.RequestUri);
        // uri.Scheme, uri.Host, uri.Port, request.RequestUri.LocalPath, request.RequestUri.quer
        uriBuilder.Scheme = uri.Scheme;
        uriBuilder.Host = uri.Host;
        uriBuilder.Port = uri.Port;

        request.RequestUri = uriBuilder.Uri;

        return request;
    }

    private static string GetDisplayUrl(HttpRequestMessage request)
    {
        var uri = request.RequestUri?.OriginalString ?? string.Empty;
        var method = request.Method;
        var body = request.Content?.Headers.ContentLength;
        return $"{method} {uri} {body}";
    }

    private static HttpRequestMessage ToHttp(TunnelHttpRequestMessage request)
    {
        var http = new HttpRequestMessage()
        {
            RequestUri = new Uri(request.Url),
            Method = new HttpMethod(request.HttpMethod),
        };
        if (request.Content.Length > 0)
        {
            var streamContent = new StreamContent(new MemoryStream(request.Content.ToArray()));
            http.Content = streamContent;
        }

        // Copy the request headers
        foreach (var (header, value) in request.Headers)
        {
            if (!http.Headers.TryAddWithoutValidation(header, value) && http.Content != null)
            {
                http.Content?.Headers.TryAddWithoutValidation(header, value);
            }
        }
        return http;
    }

    private async Task<TunnelHttpResponseMessage> ToResponse(TunnelHttpRequestMessage request, HttpResponseMessage message)
    {
        var bytes = new TunnelHttpResponseMessage(request.AckId, request.LocalRouting, (int)message.StatusCode, request.ChannelName, null)
        {
            Content = await message.Content.ReadAsByteArrayAsync(),
        };

        foreach (var (key, header) in message.Headers)
        {
            bytes.Headers.Add(key, header.ToArray());
        }

        if (message.Content != null)
        {
            foreach (var (key, header) in message.Content.Headers)
            {
                bytes.Headers.Add(key, header.ToArray());
            }
        }
        return bytes;
    }

    private async Task<TunnelHttpResponseMessage> ProcessTunnelRequest(TunnelHttpRequestMessage tunnelRequest, CancellationToken token)
    {
        var arrivedAt = DateTime.UtcNow;
        // invoke remote
        HttpResponseMessage response;
        var request = ToHttp(tunnelRequest);

        using var httpClient = _httpClientFactory.CreateClient();
        var requestUrl = GetDisplayUrl(request);
        _logger.LogInformation($"Received request from: '{requestUrl}'");
        // Invoke local http server
        // Or self-host a server?
        var proxiedRequest = CreateProxyHttpRequest(request, _localServerUri);
        var proxiedRequestUrl = GetDisplayUrl(proxiedRequest);
        _logger.LogInformation($"Proxied request to '{proxiedRequestUrl}'");
        var dataModel = new HttpDataModel
        {
            Request = new HttpRequestDetail
            {
                Url = tunnelRequest.Url,
                TracingId = tunnelRequest.TracingId,
                MethodName = tunnelRequest.HttpMethod,
                RequestAt = arrivedAt,
                RequestRaw = tunnelRequest.DumpRaw(),
            }
        };
        var item = new HttpItem(dataModel);
        _ = _dataHub.AddTraffic(item, token);
        try
        {
            response = await httpClient.SendAsync(proxiedRequest);
            _logger.LogInformation($"Received proxied response for '{proxiedRequestUrl}: {response.StatusCode}'");
            if (response.IsSuccessStatusCode)
            {
                await _dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPair.Success);
            }
            else
            {
                await _dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPair.ErrorResponse);
            }
        }
        catch (Exception e)
        {
            _logger.LogError($"Error forwarding request '{proxiedRequestUrl}': {e.Message}");
            response = new HttpResponseMessage(HttpStatusCode.InternalServerError);
            response.Content = new StringContent(e.Message);
            if (e is TaskCanceledException)
            {
                await _dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPair.RequestTimeout);
            }
            else
            {
                await _dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPair.RequestFailed);
            }
        }

        var processedAt = DateTime.UtcNow;

        // TODO: write directly to memory instead of convert
        var tunnelResponse = await ToResponse(tunnelRequest, response);
        _logger.LogInformation($"Getting response for {tunnelRequest.TracingId}: {response.StatusCode}");
        dataModel.Response = new HttpResponseDetail
        {
            Code = (int)response.StatusCode,

            RespondAt = processedAt,
            ResponseRaw = tunnelResponse.DumpRaw(),
        };
        _ = _dataHub.UpdateTraffic(item, token);
        return tunnelResponse;
    }
}