// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Diagnostics.CodeAnalysis;
using System.Text.RegularExpressions;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static partial class EventHandlerUrlTemplate
{
    public static bool TryResolve(
        string template, string hub, string eventName, [NotNullWhen(true)] out Uri? uri)
    {
        uri = null;
        // Secret resolution is not implemented; do not send an unresolved secret reference.
        if (template.Contains("{@Microsoft.KeyVault", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        var resolved = ParameterRegex().Replace(template, match => Uri.EscapeDataString(
            match.Value.Equals("{hub}", StringComparison.OrdinalIgnoreCase) ? hub : eventName));
        return Uri.TryCreate(resolved, UriKind.Absolute, out uri) && uri.Scheme is "http" or "https";
    }

    [GeneratedRegex("\\{(?:hub|event)\\}", RegexOptions.IgnoreCase)]
    private static partial Regex ParameterRegex();
}