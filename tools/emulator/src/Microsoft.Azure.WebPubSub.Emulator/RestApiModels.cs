// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

using System.Text.Json.Serialization;

internal sealed class BulkGroupRequest
{
    public string[]? Groups { get; set; }

    public string? Filter { get; set; }
}

internal sealed record GroupMember(string ConnectionId, string? UserId);

internal sealed record GroupMemberPage(
    IReadOnlyList<GroupMember> Value,
    string? ContinuationToken,
    bool HasMore);

internal sealed record GroupMemberPageResponse(IReadOnlyList<GroupMember> Value)
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? NextLink { get; init; }
}