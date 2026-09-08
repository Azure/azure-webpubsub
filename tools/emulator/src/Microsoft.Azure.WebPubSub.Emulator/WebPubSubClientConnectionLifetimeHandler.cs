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
    private readonly UpstreamEventDispatcher _events;

    public WebPubSubClientConnectionLifetimeHandler(UpstreamEventDispatcher events)
    {
        _events = events;
    }

    public async Task<UpstreamEventResult> SendMessageAsync(
        LogicalConnection connection,
        ClientMessagePayload message,
        CancellationToken cancellationToken = default)
    {
        var result = await _events.DispatchUserEventAsync(
            connection.CreateUserEvent(message.EventName, message.Data),
            cancellationToken);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(result.Error);
        }

        connection.ConnectionState = result.ConnectionState ?? connection.ConnectionState;
        return new UpstreamEventResult(result.Response);
    }
}
