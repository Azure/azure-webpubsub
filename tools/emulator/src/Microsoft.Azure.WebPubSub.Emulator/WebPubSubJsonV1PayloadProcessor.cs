// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class WebPubSubJsonV1PayloadProcessor : WebPubSubSubprotocolPayloadProcessor
{
    public const string SubprotocolName = "json.webpubsub.azure.v1";
    public const string ReliableSubprotocolName = "json.reliable.webpubsub.azure.v1";

    public WebPubSubJsonV1PayloadProcessor(
        ConnectionManager connections,
        IWebPubSubConnectionLifetimeHandler lifetimeHandler,
        WebPubSubJsonV1Protocol protocol,
        WebPubSubTokenService tokenService,
        ILogger<WebPubSubJsonV1PayloadProcessor> logger)
        : base(connections, lifetimeHandler, protocol, tokenService, logger)
    {
    }

    public static bool IsSupportedSubprotocol(string? subprotocol)
    {
        return string.Equals(subprotocol, SubprotocolName, StringComparison.OrdinalIgnoreCase) ||
            IsReliableSubprotocol(subprotocol);
    }

    public static bool IsReliableSubprotocol(string? subprotocol)
    {
        return string.Equals(
            subprotocol,
            ReliableSubprotocolName,
            StringComparison.OrdinalIgnoreCase);
    }
}