// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class UpstreamEventDispatcher(
    IOptions<EmulatorOptions> options, HttpUpstreamTrigger trigger, ILogger<UpstreamEventDispatcher> logger)
{
    public async Task DispatchNotificationAsync(
        UpstreamConnectionContext connection, string eventName, byte[] body)
    {
        var id = connection.GetNextEventId();
        if (!options.Value.Hubs.TryGetValue(connection.Hub, out var hub))
        {
            return;
        }
        var handler = hub.EventHandlers.FirstOrDefault(item =>
            item.SystemEvents.Contains(eventName, StringComparer.OrdinalIgnoreCase));
        if (handler is null)
        {
            return;
        }

        try
        {
            if (!EventHandlerUrlTemplate.TryResolve(handler.UrlTemplate, connection.Hub, eventName, out var uri))
            {
                throw new InvalidDataException("Event handler URL must resolve to an HTTP or HTTPS URL without Key Vault references.");
            }
            using var request = new HttpRequestMessage(HttpMethod.Post, uri)
            {
                Version = HttpVersion.Version20,
                Content = new ByteArrayContent(body),
            };
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
            request.Headers.Add("ce-specversion", "1.0");
            request.Headers.Add("ce-awpsversion", "1.0");
            request.Headers.Add("ce-type", $"azure.webpubsub.sys.{eventName}");
            request.Headers.Add("ce-source", $"/hubs/{connection.Hub}/client/{connection.ConnectionId}");
            request.Headers.Add("ce-id", id.ToString(CultureInfo.InvariantCulture));
            request.Headers.Add("ce-time", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture));
            request.Headers.Add("ce-connectionId", connection.ConnectionId);
            request.Headers.Add("ce-hub", connection.Hub);
            request.Headers.Add("ce-eventName", eventName);
            request.Headers.Add("WebHook-Request-Origin", connection.Host);
            request.Headers.Add("x-ms-client-request-id", Guid.NewGuid().ToString());
            var signature = HMACSHA256.HashData(
                Encoding.UTF8.GetBytes(options.Value.AccessKey), Encoding.UTF8.GetBytes(connection.ConnectionId));
            request.Headers.Add("ce-signature", $"sha256={Convert.ToHexStringLower(signature)}");
            if (!string.IsNullOrEmpty(connection.UserId))
            {
                request.Headers.Add("ce-userId", connection.UserId);
            }
            if (!string.IsNullOrEmpty(connection.Subprotocol))
            {
                request.Headers.Add("ce-subprotocol", connection.Subprotocol);
            }

            // Notifications survive the client request ending, as in PushModeUpstreamInvoker.
            using var response = await trigger.SendAsync(request, connection, CancellationToken.None);
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
}