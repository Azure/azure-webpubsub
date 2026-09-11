// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Security.Claims;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class ConnectEventRequest(HttpRequest request, ClaimsPrincipal user)
{
    public Dictionary<string, string[]> Claims { get; } = user.Claims
        .GroupBy(claim => claim.Type).ToDictionary(group => group.Key, group => group.Select(claim => claim.Value).ToArray());
    public Dictionary<string, string?[]> Query { get; } = request.Query
        .Where(pair => !pair.Key.Equals("access_token", StringComparison.OrdinalIgnoreCase))
        .ToDictionary(pair => pair.Key, pair => pair.Value.ToArray());
    public Dictionary<string, string?[]> Headers { get; } = request.Headers
        .Where(pair => !pair.Key.Equals("Authorization", StringComparison.OrdinalIgnoreCase) &&
            !pair.Key.StartsWith("X-ASRS-Internal-", StringComparison.OrdinalIgnoreCase))
        .ToDictionary(pair => pair.Key, pair => pair.Value.ToArray());
    public IList<string> Subprotocols { get; } = request.HttpContext.WebSockets.WebSocketRequestedProtocols;
    public object[] ClientCertificates { get; } = [];
}

internal sealed record ConnectEventResponse(string? UserId, string[]? Roles, string[]? Groups, string? Subprotocol);