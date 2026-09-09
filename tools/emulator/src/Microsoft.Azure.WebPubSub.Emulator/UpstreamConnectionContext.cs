// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class UpstreamConnectionContext(
    string connectionId, string hub, string? userId, string? subprotocol, string host)
{
    // Event 0 is reserved for connect, even when no connect handler is configured.
    private int _eventId;

    public string ConnectionId { get; } = connectionId;
    public string Hub { get; } = hub;
    public string? UserId { get; } = userId;
    public string? Subprotocol { get; } = subprotocol;
    public string Host { get; } = host;
    public CookieContainer Cookies { get; } = new();

    public int GetNextEventId() => Interlocked.Increment(ref _eventId);
}