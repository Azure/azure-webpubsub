// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class UpstreamEventDispatcher(
    IOptions<EmulatorOptions> options, HttpUpstreamTrigger trigger, ILogger<UpstreamEventDispatcher> logger)
{
    private const string MetadataHeaderPrefix = "x-webpubsub-metadata-";

    public async Task<UpstreamEventResult> DispatchUserEventAsync(
        UpstreamConnectionContext connection, ClientMessagePayload message, CancellationToken cancellationToken)
    {
        var id = connection.GetNextEventId();
        var handler = options.Value.Hubs.TryGetValue(connection.Hub, out var settings)
            ? settings.EventHandlers.FirstOrDefault(item => item.MatchesUserEvent(message.EventName))
            : null;
        if (handler is null)
        {
            throw new InvalidOperationException("No event handler is configured for this user event.");
        }

        using var response = await SendAsync(handler, connection, message.EventName, id,
            message.Data.Bytes.ToArray(), cancellationToken, message.Data);
        response.EnsureSuccessStatusCode();
        await response.Content.LoadIntoBufferAsync(16 * 1024 * 1024, cancellationToken);
        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        // Runtime treats empty bodies as text, regardless of their Content-Type.
        var type = bytes.Length == 0 ? MessageDataType.Text :
            response.Content.Headers.ContentType?.MediaType?.ToLowerInvariant() switch
            {
                null or "application/octet-stream" => MessageDataType.Binary,
                "text/plain" => MessageDataType.Text,
                "application/json" => MessageDataType.Json,
                _ => throw new InvalidDataException("Unsupported event handler response content type."),
            };
        Dictionary<string, string>? metadata = null;
        foreach (var header in response.Headers)
        {
            if (!header.Key.StartsWith(MetadataHeaderPrefix, StringComparison.OrdinalIgnoreCase)) continue;
            var key = header.Key[MetadataHeaderPrefix.Length..].ToLowerInvariant();
            if (key.Length == 0) continue;
            var value = header.Value.LastOrDefault() ?? string.Empty;
            metadata ??= new(StringComparer.Ordinal);
            metadata[key] = value[(value.LastIndexOf(',') + 1)..].Trim();
        }
        if (response.Headers.TryGetValues("ce-connectionState", out var state))
        {
            connection.ConnectionState = state.LastOrDefault();
        }
        return new(bytes.Length == 0 && metadata is null ? null : new MessageData(type, bytes, metadata));
    }

    public async Task<(HttpStatusCode Status, ConnectEventResponse? Response)> DispatchConnectAsync(
        UpstreamConnectionContext connection, ConnectEventRequest body, CancellationToken cancellationToken)
    {
        var handler = GetHandler(connection.Hub, "connect");
        if (handler is null)
        {
            return (HttpStatusCode.OK, null);
        }
        try
        {
            using var response = await SendAsync(handler, connection, "connect", 0,
                JsonSerializer.SerializeToUtf8Bytes(body, JsonSerializerOptions.Web), cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return (response.StatusCode, null);
            }

            const int limit = 16 * 1024 * 1024;
            await response.Content.LoadIntoBufferAsync(limit, cancellationToken);
            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            var payload = bytes.Length == 0 ? null :
                JsonSerializer.Deserialize<ConnectEventResponse>(bytes, JsonSerializerOptions.Web);
            if (payload?.Groups?.Any(group => !WebPubSubNameValidator.IsValidGroupName(group)) == true)
            {
                throw new InvalidDataException("The connect response contains an invalid group.");
            }
            if (payload?.Roles?.Any(role => role is null) == true)
            {
                throw new InvalidDataException("The connect response contains a null role.");
            }
            if (response.Headers.TryGetValues("ce-connectionState", out var state))
            {
                connection.ConnectionState = state.LastOrDefault();
            }
            return (response.StatusCode, payload);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (exception is JsonException or InvalidDataException or IOException or HttpRequestException or OperationCanceledException)
        {
            logger.LogWarning(exception, "Dispatching connect for {ConnectionId} failed.", connection.ConnectionId);
            return (HttpStatusCode.InternalServerError, null);
        }
    }

    public async Task DispatchNotificationAsync(
        UpstreamConnectionContext connection, string eventName, byte[] body)
    {
        var id = connection.GetNextEventId();
        var handler = GetHandler(connection.Hub, eventName);
        if (handler is null)
        {
            return;
        }

        try
        {
            // Notifications survive the client request ending, as in PushModeUpstreamInvoker.
            using var response = await SendAsync(handler, connection, eventName, id, body, CancellationToken.None);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("The {EventName} handler returned {StatusCode} for {ConnectionId}.",
                    eventName, (int)response.StatusCode, connection.ConnectionId);
            }
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Dispatching {EventName} for {ConnectionId} failed.",
                eventName, connection.ConnectionId);
        }
    }

    private EventHandlerOptions? GetHandler(string hub, string eventName) =>
        options.Value.Hubs.TryGetValue(hub, out var settings)
            ? settings.EventHandlers.FirstOrDefault(item => item.SystemEvents.Contains(eventName, StringComparer.OrdinalIgnoreCase))
            : null;

    private async Task<HttpResponseMessage> SendAsync(
        EventHandlerOptions handler, UpstreamConnectionContext connection, string eventName, int id,
        byte[] body, CancellationToken cancellationToken, MessageData? userData = null)
    {
        if (!EventHandlerUrlTemplate.TryResolve(handler.UrlTemplate, connection.Hub, eventName, out var uri) ||
            !EventHandlerUrlTemplate.TryResolve(handler.UrlTemplate, connection.Hub, "validate", out var validationUri))
        {
            throw new InvalidDataException("Event handler URL must resolve to an HTTP or HTTPS URL without Key Vault references.");
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, uri)
        {
            Version = HttpVersion.Version20,
            Content = new ByteArrayContent(body),
        };
        request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(userData?.Type switch
        {
            MessageDataType.Text => "text/plain; charset=utf-8",
            MessageDataType.Binary => "application/octet-stream",
            _ => "application/json",
        });
        if (userData?.Metadata is { } metadata)
        {
            var normalized = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in metadata) normalized[item.Key] = item.Value;
            foreach (var item in normalized)
            {
                request.Headers.TryAddWithoutValidation(MetadataHeaderPrefix + item.Key.ToLowerInvariant(), item.Value);
            }
        }
        request.Headers.Add("ce-specversion", "1.0");
        request.Headers.Add("ce-awpsversion", "1.0");
        request.Headers.Add("ce-type", $"azure.webpubsub.{(userData is null ? "sys" : "user")}.{eventName}");
        request.Headers.Add("ce-source", $"/hubs/{connection.Hub}/client/{connection.ConnectionId}");
        request.Headers.Add("ce-id", id.ToString(CultureInfo.InvariantCulture));
        request.Headers.Add("ce-time", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture));
        request.Headers.Add("ce-connectionId", connection.ConnectionId);
        request.Headers.Add("ce-hub", connection.Hub);
        request.Headers.Add("ce-eventName", eventName);
        request.Headers.Add("WebHook-Request-Origin", connection.Host);
        request.Headers.Add("x-ms-client-request-id", Guid.NewGuid().ToString());
        request.Headers.Add("ce-signature", connection.GetSignature(options.Value.AccessKey));
        if (!string.IsNullOrEmpty(connection.UserId))
        {
            request.Headers.Add("ce-userId", connection.UserId);
        }
        if (!string.IsNullOrEmpty(connection.Subprotocol))
        {
            request.Headers.Add("ce-subprotocol", connection.Subprotocol);
        }
        if (connection.ConnectionState is not null)
        {
            request.Headers.Add("ce-connectionState", connection.ConnectionState);
        }
        return await trigger.SendAsync(request, validationUri, connection, cancellationToken);
    }
}