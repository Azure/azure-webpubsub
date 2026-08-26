// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text.RegularExpressions;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static partial class WebPubSubMetadata
{
    public const string HeaderPrefix = "X-WebPubSub-Metadata-";

    private const int MaximumTotalLength = 8 * 1024;
    private const int MaximumKeyLength = 256;
    private const int MaximumValueLength = 1024;

    [GeneratedRegex("^[!#$%&'*+\\-.^_`|~0-9a-z]+$", RegexOptions.IgnoreCase)]
    private static partial Regex KeyRegex();

    public static void Validate(IReadOnlyDictionary<string, string>? metadata)
    {
        if (metadata is null)
        {
            return;
        }

        var totalLength = 0;
        foreach (var item in metadata)
        {
            if (!KeyRegex().IsMatch(item.Key))
            {
                throw new InvalidDataException(
                    $"Metadata key '{item.Key}' contains invalid characters.");
            }
            if (item.Key.Length > MaximumKeyLength)
            {
                throw new InvalidDataException(
                    $"Metadata key '{item.Key}' exceeds {MaximumKeyLength} bytes.");
            }
            if (item.Value.Length > MaximumValueLength)
            {
                throw new InvalidDataException(
                    $"Metadata value for key '{item.Key}' exceeds {MaximumValueLength} bytes.");
            }
            if (item.Value.Any(character => character > 0x7F))
            {
                throw new InvalidDataException(
                    $"Metadata value for key '{item.Key}' must be ASCII.");
            }

            totalLength += item.Key.Length + item.Value.Length;
            if (totalLength > MaximumTotalLength)
            {
                throw new InvalidDataException(
                    $"Metadata exceeds {MaximumTotalLength} bytes.");
            }
        }
    }
}