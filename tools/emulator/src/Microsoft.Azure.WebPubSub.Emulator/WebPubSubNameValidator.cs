// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class WebPubSubNameValidator
{
    public const int MaximumGroupNameLength = 1024;

    public static bool IsValidGroupName(string? group)
    {
        return !string.IsNullOrWhiteSpace(group) && group.Length <= MaximumGroupNameLength;
    }
}