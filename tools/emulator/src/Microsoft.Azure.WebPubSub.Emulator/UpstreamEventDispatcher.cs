// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Azure.Core;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class UpstreamEventDispatcher
{
    public const string HttpClientName = "WebPubSubEventHandler";

    private const int MaximumResponseBytes = 16 * 1024 * 1024;
    private readonly EmulatorOptions _options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IEventHubPublisher _eventHubPublisher;
    private readonly TokenCredential _credential;
    private readonly ILogger<UpstreamEventDispatcher> _logger;

    public UpstreamEventDispatcher(
        IOptions<EmulatorOptions> options,
        IHttpClientFactory httpClientFactory,
        IEventHubPublisher eventHubPublisher,
        TokenCredential credential,
        ILogger<UpstreamEventDispatcher> logger)
    {
        _options = options.Value;
        _httpClientFactory = httpClientFactory;
        _eventHubPublisher = eventHubPublisher;
        _credential = credential;
        _logger = logger;
    }

    public async Task<ConnectDispatchResult> DispatchConnectAsync(
        UpstreamEvent upstreamEvent,
        CancellationToken cancellationToken)
    {
        var handler = GetMatchingHandler(upstreamEvent);
        if (handler is null)
        {
            return new(HttpStatusCode.OK, null, null, null);
        }

        try
        {
            using var response = await SendToHandlerAsync(handler, upstreamEvent, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return new(
                    response.StatusCode,
                    null,
                    null,
                    $"The connect event handler returned {(int)response.StatusCode}.");
            }

            var bytes = await ReadContentAsync(response.Content, cancellationToken);
            var connectResponse = bytes.Length == 0
                ? null
                : JsonSerializer.Deserialize<ConnectEventResponse>(bytes, JsonSerializerOptions.Web);
            return new(
                response.StatusCode,
                connectResponse,
                GetSingleHeader(response, "ce-connectionState"),
                null);
        }
        catch (Exception exception) when (
            exception is JsonException or InvalidDataException or HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(exception, "Dispatching the connect event failed.");
            return new(
                HttpStatusCode.InternalServerError,
                null,
                null,
                "Dispatching the connect event failed.");
        }
    }

    public async Task<UserEventDispatchResult> DispatchUserEventAsync(
        UpstreamEvent upstreamEvent,
        CancellationToken cancellationToken)
    {
        var hasListener = await PublishToListenersAsync(upstreamEvent, cancellationToken);
        var handler = GetMatchingHandler(upstreamEvent);
        if (handler is null)
        {
            return new(hasListener, hasListener, null, null, hasListener ? null : "No event handler or listener is configured.");
        }

        try
        {
            using var response = await SendToHandlerAsync(handler, upstreamEvent, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return new(true, false, null, null, $"The event handler returned {(int)response.StatusCode}.");
            }

            var bytes = await ReadContentAsync(response.Content, cancellationToken);
            var metadata = GetMetadata(response);
            var responseData = bytes.Length == 0 && metadata is null
                ? null
                : new MessageData(
                    GetDataType(response.Content.Headers.ContentType),
                    bytes,
                    metadata);
            var connectionState = GetSingleHeader(response, "ce-connectionState");
            return new(true, true, responseData, connectionState, null);
        }
        catch (Exception exception) when (
            exception is HttpRequestException or TaskCanceledException or InvalidDataException)
        {
            _logger.LogWarning(
                exception,
                "Dispatching user event {EventName} for connection {ConnectionId} failed.",
                upstreamEvent.EventName,
                upstreamEvent.ConnectionId);
            return new(true, false, null, null, "Dispatching the event failed.");
        }
    }

    public async Task DispatchNotificationAsync(
        UpstreamEvent upstreamEvent,
        CancellationToken cancellationToken = default)
    {
        await PublishToListenersAsync(upstreamEvent, cancellationToken);
        var handler = GetMatchingHandler(upstreamEvent);
        if (handler is null)
        {
            return;
        }

        try
        {
            using var response = await SendToHandlerAsync(handler, upstreamEvent, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "The {EventName} event handler returned {StatusCode} for connection {ConnectionId}.",
                    upstreamEvent.EventName,
                    (int)response.StatusCode,
                    upstreamEvent.ConnectionId);
            }
        }
        catch (Exception exception) when (
            exception is HttpRequestException or TaskCanceledException or InvalidDataException)
        {
            _logger.LogWarning(
                exception,
                "Dispatching {EventName} for connection {ConnectionId} failed.",
                upstreamEvent.EventName,
                upstreamEvent.ConnectionId);
        }
    }

    private async Task<bool> PublishToListenersAsync(
        UpstreamEvent upstreamEvent,
        CancellationToken cancellationToken)
    {
        if (string.Equals(upstreamEvent.EventName, "connect", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var listeners = GetHubOptions(upstreamEvent.Hub)?.EventListeners ?? [];
        var matching = listeners.Where(listener => Matches(listener.EventNameFilter, upstreamEvent)).ToArray();
        foreach (var listener in matching)
        {
            try
            {
                await _eventHubPublisher.PublishAsync(
                    upstreamEvent,
                    listener.EventHubEndpoint,
                    cancellationToken);
            }
            catch (Exception exception)
            {
                _logger.LogWarning(
                    exception,
                    "Publishing {EventName} for connection {ConnectionId} to Event Hubs failed.",
                    upstreamEvent.EventName,
                    upstreamEvent.ConnectionId);
            }
        }
        return matching.Length > 0;
    }

    private async Task<HttpResponseMessage> SendToHandlerAsync(
        EventHandlerOptions handler,
        UpstreamEvent upstreamEvent,
        CancellationToken cancellationToken)
    {
        var url = handler.UrlTemplate
            .Replace("{hub}", Uri.EscapeDataString(upstreamEvent.Hub), StringComparison.OrdinalIgnoreCase)
            .Replace("{event}", Uri.EscapeDataString(upstreamEvent.EventName), StringComparison.OrdinalIgnoreCase);
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https"))
        {
            throw new InvalidDataException($"Event handler URL '{url}' is not an absolute HTTP or HTTPS URL.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, uri)
        {
            Version = HttpVersion.Version20,
            VersionPolicy = HttpVersionPolicy.RequestVersionOrLower,
            Content = new ByteArrayContent(upstreamEvent.Data.Bytes),
        };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue(GetContentType(upstreamEvent.Data.Type));
        AddCloudEventHeaders(request, upstreamEvent);
        AddMetadataHeaders(request, upstreamEvent.Data.Metadata);
        await AddAuthorizationAsync(request, handler.Auth, cancellationToken);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_options.EventHandlerTimeout);
        return await _httpClientFactory.CreateClient(HttpClientName).SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            timeout.Token);
    }

    private async Task AddAuthorizationAsync(
        HttpRequestMessage request,
        EventHandlerAuthOptions? auth,
        CancellationToken cancellationToken)
    {
        if (auth is null || string.Equals(auth.Type, "None", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }
        if (!string.Equals(auth.Type, "ManagedIdentity", StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(auth.ManagedIdentity?.Resource))
        {
            throw new InvalidDataException("Event handler auth must be None or ManagedIdentity with a resource.");
        }

        var scope = $"{auth.ManagedIdentity.Resource.TrimEnd('/')}/.default";
        var token = await _credential.GetTokenAsync(
            new TokenRequestContext([scope]),
            cancellationToken);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
    }

    private EventHandlerOptions? GetMatchingHandler(UpstreamEvent upstreamEvent)
    {
        return GetHubOptions(upstreamEvent.Hub)?.EventHandlers
            .FirstOrDefault(handler => Matches(handler, upstreamEvent));
    }

    private HubOptions? GetHubOptions(string hub)
    {
        return _options.Hubs.TryGetValue(hub, out var options) ||
            _options.Hubs.TryGetValue("_default", out options)
            ? options
            : null;
    }

    private static bool Matches(EventHandlerOptions handler, UpstreamEvent upstreamEvent)
    {
        return upstreamEvent.Category == UpstreamEventCategory.User
            ? MatchesPatternList(handler.EventPattern, upstreamEvent.EventName)
            : handler.SystemEvents.Contains(upstreamEvent.EventName, StringComparer.OrdinalIgnoreCase);
    }

    private static bool Matches(EventNameFilterOptions filter, UpstreamEvent upstreamEvent)
    {
        return upstreamEvent.Category == UpstreamEventCategory.User
            ? MatchesListenerEvents(filter.UserEventPattern, upstreamEvent.EventName)
            : filter.SystemEvents.Contains(upstreamEvent.EventName, StringComparer.OrdinalIgnoreCase);
    }

    private static bool MatchesListenerEvents(string? patterns, string input)
    {
        return patterns?.Split(',')
            .Select(value => value.Trim())
            .Any(value => value == "*" || string.Equals(value, input, StringComparison.OrdinalIgnoreCase)) == true;
    }

    private static bool MatchesPatternList(string? patterns, string input)
    {
        return patterns?.Split(',')
            .Select(value => value.Trim())
            .Any(value => MatchesPattern(value, input)) == true;
    }

    private static bool MatchesPattern(string pattern, string input)
    {
        return WildcardPattern.TryCreate(pattern, out var matcher) &&
            matcher!.Matches(input, ignoreCase: true);
    }

    private static void AddCloudEventHeaders(HttpRequestMessage request, UpstreamEvent upstreamEvent)
    {
        request.Headers.TryAddWithoutValidation("ce-specversion", "1.0");
        request.Headers.TryAddWithoutValidation("ce-awpsversion", "1.0");
        request.Headers.TryAddWithoutValidation("ce-type", upstreamEvent.Type);
        request.Headers.TryAddWithoutValidation("ce-source", upstreamEvent.Source);
        request.Headers.TryAddWithoutValidation("ce-id", upstreamEvent.Id.ToString());
        request.Headers.TryAddWithoutValidation("ce-time", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"));
        request.Headers.TryAddWithoutValidation("ce-connectionId", upstreamEvent.ConnectionId);
        request.Headers.TryAddWithoutValidation("ce-hub", upstreamEvent.Hub);
        request.Headers.TryAddWithoutValidation("ce-eventName", upstreamEvent.EventName);
        request.Headers.TryAddWithoutValidation("WebHook-Request-Origin", upstreamEvent.Host);
        AddIfNotEmpty(request, "ce-userId", upstreamEvent.UserId);
        AddIfNotEmpty(request, "ce-subprotocol", upstreamEvent.Subprotocol);
        AddIfNotEmpty(request, "ce-connectionState", upstreamEvent.ConnectionState);
    }

    private static void AddIfNotEmpty(HttpRequestMessage request, string name, string? value)
    {
        if (!string.IsNullOrEmpty(value))
        {
            request.Headers.TryAddWithoutValidation(name, value);
        }
    }

    private static void AddMetadataHeaders(
        HttpRequestMessage request,
        IReadOnlyDictionary<string, string>? metadata)
    {
        if (metadata is null)
        {
            return;
        }

        var normalized = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in metadata)
        {
            normalized[item.Key] = item.Value;
        }
        foreach (var item in normalized)
        {
            request.Headers.TryAddWithoutValidation(
                $"{WebPubSubMetadata.HeaderPrefix}{item.Key.ToLowerInvariant()}",
                item.Value);
        }
    }

    private static IReadOnlyDictionary<string, string>? GetMetadata(HttpResponseMessage response)
    {
        Dictionary<string, string>? metadata = null;
        foreach (var header in response.Headers)
        {
            if (!header.Key.StartsWith(WebPubSubMetadata.HeaderPrefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var key = header.Key[WebPubSubMetadata.HeaderPrefix.Length..].ToLowerInvariant();
            if (key.Length == 0)
            {
                continue;
            }
            var value = header.Value.LastOrDefault() ?? string.Empty;
            var lastComma = value.LastIndexOf(',');
            metadata ??= new Dictionary<string, string>(StringComparer.Ordinal);
            metadata[key] = (lastComma < 0 ? value : value[(lastComma + 1)..]).Trim();
        }
        return metadata;
    }

    private static string? GetSingleHeader(HttpResponseMessage response, string name)
    {
        return response.Headers.TryGetValues(name, out var values) ? values.SingleOrDefault() : null;
    }

    private static string GetContentType(MessageDataType dataType)
    {
        return dataType switch
        {
            MessageDataType.Text => "text/plain",
            MessageDataType.Binary => "application/octet-stream",
            MessageDataType.Json => "application/json",
            _ => throw new InvalidOperationException($"Unsupported data type '{dataType}'."),
        };
    }

    private static MessageDataType GetDataType(MediaTypeHeaderValue? contentType)
    {
        return contentType?.MediaType?.ToLowerInvariant() switch
        {
            null or "text/plain" => MessageDataType.Text,
            "application/json" => MessageDataType.Json,
            "application/octet-stream" => MessageDataType.Binary,
            _ => throw new InvalidDataException($"Unsupported event handler response content type '{contentType}'."),
        };
    }

    private static async Task<byte[]> ReadContentAsync(
        HttpContent content,
        CancellationToken cancellationToken)
    {
        await using var stream = await content.ReadAsStreamAsync(cancellationToken);
        using var buffer = new MemoryStream();
        var bytes = new byte[81920];
        while (true)
        {
            var read = await stream.ReadAsync(bytes, cancellationToken);
            if (read == 0)
            {
                return buffer.ToArray();
            }
            if (buffer.Length + read > MaximumResponseBytes)
            {
                throw new InvalidDataException($"Event handler response exceeds {MaximumResponseBytes} bytes.");
            }
            buffer.Write(bytes, 0, read);
        }
    }
}