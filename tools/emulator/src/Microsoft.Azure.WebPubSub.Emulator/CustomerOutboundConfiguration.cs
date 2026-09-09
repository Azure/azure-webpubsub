// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text;
using Polly;
using Polly.Extensions.Http;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class CustomerOutboundConfiguration
{
    private static readonly TimeSpan[] RetryDelays =
        [TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(5)];

    // Keep the allowlist aligned with the runtime's CustomerOutboundConfiguration.
    private static readonly string[] UnicodeAllowedUpstreamHeaderNames =
        [
            "X-ASRS-User-Id",
            "X-ASRS-User-Claims",
            "X-ASRS-Event",
            "ce-userId",
        ];

    public static SocketsHttpHandler ConfigureHttpMessageHandler()
    {
        return new SocketsHttpHandler
        {
            UseCookies = false,
            RequestHeaderEncodingSelector = SelectRequestHeaderEncoding,
        };
    }

    public static IAsyncPolicy<HttpResponseMessage> CreateRetryPolicy()
    {
        return Policy<HttpResponseMessage>
            .Handle<HttpRequestException>(exception => exception.Message != "Request headers must contain only ASCII characters.")
            .OrTransientHttpStatusCode()
            .WaitAndRetryAsync(RetryDelays, (result, _) => result.Result?.Dispose());
    }

    private static Encoding? SelectRequestHeaderEncoding(string headerName, HttpRequestMessage request)
    {
        // User IDs and claims may contain Unicode; other headers retain the default encoding.
        return UnicodeAllowedUpstreamHeaderNames.Contains(headerName, StringComparer.OrdinalIgnoreCase)
            ? Encoding.UTF8
            : null;
    }
}