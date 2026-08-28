// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal interface IWebPubSubConnectionLifetimeHandler
{
    Task<UpstreamEventResult> SendMessageAsync(
        LogicalConnection connection,
        ClientMessagePayload message,
        CancellationToken cancellationToken = default);
}

internal sealed record ClientMessagePayload(
    string EventName,
    MessageData Data);

internal sealed record UpstreamEventResult(MessageData? Response = null);

internal sealed class WebPubSubClientConnectionLifetimeHandler :
    IWebPubSubConnectionLifetimeHandler
{
    public Task<UpstreamEventResult> SendMessageAsync(
        LogicalConnection connection,
        ClientMessagePayload message,
        CancellationToken cancellationToken = default)
    {
        throw new NotImplementedException(
            "HTTP upstream event handlers are not implemented.");
    }
}
