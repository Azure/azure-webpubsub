// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text.RegularExpressions;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static partial class EventHandlerUrlTemplate
{
    [GeneratedRegex(
        "\\{(?:hub|event|@Microsoft\\.KeyVault\\(SecretUri=(?<secretIdentity>.+?)\\))\\}",
        RegexOptions.IgnoreCase)]
    private static partial Regex ParameterRegex();

    public static bool TryResolve(
        string urlTemplate,
        string hub,
        string eventName,
        out Uri? uri)
    {
        var resolved = ParameterRegex().Replace(urlTemplate, match =>
        {
            if (match.Value.Equals("{hub}", StringComparison.OrdinalIgnoreCase))
            {
                return Uri.EscapeDataString(hub);
            }
            if (match.Value.Equals("{event}", StringComparison.OrdinalIgnoreCase))
            {
                return Uri.EscapeDataString(eventName);
            }
            return match.Value;
        });
        return Uri.TryCreate(resolved, UriKind.Absolute, out uri) &&
            uri.Scheme is "http" or "https";
    }

    public static Uri Resolve(string urlTemplate, string hub, string eventName)
    {
        if (!TryResolve(urlTemplate, hub, eventName, out var uri))
        {
            throw new InvalidDataException(
                $"Event handler URL '{urlTemplate}' is not an absolute HTTP or HTTPS URL.");
        }
        return uri!;
    }
}