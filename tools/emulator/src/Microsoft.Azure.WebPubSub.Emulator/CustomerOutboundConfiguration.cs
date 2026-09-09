// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class CustomerOutboundConfiguration
{
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

    private static Encoding? SelectRequestHeaderEncoding(string headerName, HttpRequestMessage request)
    {
        // User IDs and claims may contain Unicode; other headers retain the default encoding.
        return UnicodeAllowedUpstreamHeaderNames.Contains(headerName, StringComparer.OrdinalIgnoreCase)
            ? Encoding.UTF8
            : null;
    }
}