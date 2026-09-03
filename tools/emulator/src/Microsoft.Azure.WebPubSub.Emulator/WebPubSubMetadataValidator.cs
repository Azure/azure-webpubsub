// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text.RegularExpressions;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static partial class WebPubSubMetadataValidator
{
    private const int MaximumTotalBytes = 8 * 1024;
    private const int MaximumKeyBytes = 256;
    private const int MaximumValueBytes = 1024;

    public static void Validate(IReadOnlyDictionary<string, string>? metadata)
    {
        if (metadata is null)
        {
            return;
        }

        var totalBytes = 0;
        foreach (var item in metadata)
        {
            if (!MetadataKeyRegex().IsMatch(item.Key))
            {
                throw new InvalidDataException(
                    $"Metadata key '{item.Key}' contains invalid characters.");
            }
            if (!item.Value.All(character => character <= 0x7f))
            {
                throw new InvalidDataException(
                    $"Metadata value for key '{item.Key}' must be ASCII.");
            }
            if (item.Key.Length > MaximumKeyBytes)
            {
                throw new InvalidDataException(
                    $"Metadata key '{item.Key}' exceeds {MaximumKeyBytes} bytes.");
            }
            if (item.Value.Length > MaximumValueBytes)
            {
                throw new InvalidDataException(
                    $"Metadata value for key '{item.Key}' exceeds {MaximumValueBytes} bytes.");
            }

            totalBytes += item.Key.Length + item.Value.Length;
            if (totalBytes > MaximumTotalBytes)
            {
                throw new InvalidDataException($"Metadata exceeds {MaximumTotalBytes} bytes.");
            }
        }
    }

    [GeneratedRegex(
        "^[!#$%&'*+\\-.^_`|~0-9a-z]+$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MetadataKeyRegex();
}