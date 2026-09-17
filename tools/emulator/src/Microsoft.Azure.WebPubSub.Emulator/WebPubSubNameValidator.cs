// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Diagnostics.CodeAnalysis;
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

    // Validate raw '*' characters; tokenizer complexity is checked separately.
    public static bool IsValidPattern(string pattern, [NotNullWhen(false)] out string? errorMsg)
    {
        var complexity = 0;
        if (string.IsNullOrEmpty(pattern))
        {
            errorMsg = "Pattern cannot be null or empty.";
            return false;
        }
        if (pattern.Length > Constants.Permission.MaxPatternLength)
        {
            errorMsg = $"Pattern exceeds maximum length of {Constants.Permission.MaxPatternLength} characters.";
            return false;
        }
        // Check for invalid escape sequences and maximum '*' count
        for (var i = 0; i < pattern.Length; i++)
        {
            if (pattern[i] is '\\')
            {
                if (i + 1 == pattern.Length)
                {
                    errorMsg = "Pattern cannot end with a single backslash.";
                    return false; // Ends with a single backslash
                }
                if (!EscapableTokens.All.Contains(pattern[i + 1]))
                {
                    errorMsg = $"Invalid escape character at position {i}: '{pattern[i + 1]}' can't be escaped.";
                    return false;
                }
                i += 1; // Skip the next character as it's escaped
            }
            else if (pattern[i] is '*')
            {
                complexity++; // Increase complexity for each '*' or '**' found
            }
        }
        if (complexity > Constants.Permission.MaxPatternComplexity)
        {
            errorMsg = $"Too many '*' in the pattern, exceeding the maximum allowed complexity of {Constants.Permission.MaxPatternComplexity}.";
            return false;
        }
        errorMsg = null;
        return true;
    }

    [GeneratedRegex(
        "^[a-z][a-z0-9_.-]{0,127}$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex EventNameRegex();
}