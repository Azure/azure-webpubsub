// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class HttpUpstreamTrigger(
    IHttpClientFactory clients, AbuseProtector abuseProtector, ILogger<HttpUpstreamTrigger> logger)
{
    public const string HttpClientName = "WebPubSubEventHandler";

    public async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, Uri validationUri, UpstreamConnectionContext connection, CancellationToken cancellationToken)
    {
        if (!await abuseProtector.ValidateAsync(validationUri, connection.Host))
        {
            throw new HttpRequestException("The upstream endpoint did not allow the WebHook-Request-Origin.");
        }
        var uri = request.RequestUri!;
        var cookies = connection.Cookies.GetCookieHeader(uri);
        if (cookies.Length > 0)
        {
            request.Headers.Add("Cookie", cookies);
        }
        using var client = clients.CreateClient(HttpClientName);
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (response.IsSuccessStatusCode && response.Headers.TryGetValues("Set-Cookie", out var values))
        {
            foreach (var value in values)
            {
                try
                {
                    connection.Cookies.SetCookies(uri, value);
                }
                catch (CookieException exception)
                {
                    logger.LogWarning(exception, "The upstream returned an invalid cookie.");
                }
            }
        }
        return response;
    }
}