// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class WebPubSubProtobufV1PayloadProcessor : WebPubSubSubprotocolPayloadProcessor
{
    public const string SubprotocolName = WebPubSubProtobufV1Protocol.SubprotocolName;
    public const string ReliableSubprotocolName = "protobuf.reliable.webpubsub.azure.v1";

    public WebPubSubProtobufV1PayloadProcessor(
        ConnectionManager connections,
        IWebPubSubConnectionLifetimeHandler lifetimeHandler,
        WebPubSubProtobufV1Protocol protocol,
        WebPubSubTokenService tokenService,
        ILogger<WebPubSubProtobufV1PayloadProcessor> logger)
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