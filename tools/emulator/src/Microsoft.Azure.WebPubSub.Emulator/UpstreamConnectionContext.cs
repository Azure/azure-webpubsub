// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class UpstreamConnectionContext(
    string connectionId, string hub, string? userId, string? subprotocol, string host)
{
    // Event 0 is reserved for connect, even when no connect handler is configured.
    private int _eventId;
    private readonly object _signatureLock = new();
    private (string Key, string Signature)? _signatureCache;

    public string ConnectionId { get; } = connectionId;
    public string Hub { get; } = hub;
    public string? UserId { get; } = userId;
    public string? Subprotocol { get; } = subprotocol;
    public string Host { get; } = host;
    public CookieContainer Cookies { get; } = new();

    public int GetNextEventId() => Interlocked.Increment(ref _eventId);

    public string GetSignature(string accessKey)
    {
        // Like the runtime's GetSignatures, cache by signing key, not by event.
        lock (_signatureLock)
        {
            if (_signatureCache is { } cached && cached.Key == accessKey)
            {
                return cached.Signature;
            }

            var hash = HMACSHA256.HashData(
                Encoding.UTF8.GetBytes(accessKey), Encoding.UTF8.GetBytes(ConnectionId));
            var signature = $"sha256={Convert.ToHexStringLower(hash)}";
            _signatureCache = (accessKey, signature);
            return signature;
        }
    }
}