// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text.RegularExpressions;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static partial class WebPubSubNameValidator
{
    public const string HubNamePattern = "^[A-Za-z][A-Za-z0-9_`,.\\[\\]]{0,127}$";
    public const string NotWhitespacePattern = "^(?!\\s+$).+$";
    public const int MaximumGroupNameLength = 1024;

    public static bool IsValidGroupName(string? group)
    {
        return !string.IsNullOrWhiteSpace(group) && group.Length <= MaximumGroupNameLength;
    }

    public static bool IsValidEventName(string? eventName)
    {
        return !string.IsNullOrEmpty(eventName) && EventNameRegex().IsMatch(eventName);
    }

    [GeneratedRegex(
        "^[a-z][a-z0-9_.-]{0,127}$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex EventNameRegex();
}