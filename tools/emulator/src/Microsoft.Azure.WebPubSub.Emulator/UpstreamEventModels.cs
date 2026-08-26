// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal enum UpstreamEventCategory
{
    System,
    User,
}

internal sealed record UpstreamEvent(
    int Id,
    string Hub,
    string EventName,
    UpstreamEventCategory Category,
    string ConnectionId,
    string? UserId,
    string? Subprotocol,
    string? ConnectionState,
    MessageData Data,
    string Host)
{
    public string Type => Category == UpstreamEventCategory.User
        ? $"azure.webpubsub.user.{EventName}"
        : $"azure.webpubsub.sys.{EventName}";

    public string Source => $"/hubs/{Hub}/client/{ConnectionId}";
}

internal sealed record ConnectEventResponse(
    string? Subprotocol,
    string[]? Roles,
    string? UserId,
    string[]? Groups);

internal sealed record ConnectDispatchResult(
    HttpStatusCode StatusCode,
    ConnectEventResponse? Response,
    string? ConnectionState,
    string? Error)
{
    public bool Succeeded => (int)StatusCode is >= 200 and <= 299;
}

internal sealed record UserEventDispatchResult(
    bool Handled,
    bool Succeeded,
    MessageData? Response,
    string? ConnectionState,
    string? Error);