// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text.RegularExpressions;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static partial class WebPubSubMetadataValidator
{
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
            if (item.Key.Length > Constants.Metadata.MaxKeyBytes)
            {
                throw new InvalidDataException(
                    $"Metadata key '{item.Key}' exceeds {Constants.Metadata.MaxKeyBytes} bytes.");
            }
            if (item.Value.Length > Constants.Metadata.MaxValueBytes)
            {
                throw new InvalidDataException(
                    $"Metadata value for key '{item.Key}' exceeds {Constants.Metadata.MaxValueBytes} bytes.");
            }

            totalBytes += item.Key.Length + item.Value.Length;
            if (totalBytes > Constants.Metadata.MaxTotalBytes)
            {
                throw new InvalidDataException($"Metadata exceeds {Constants.Metadata.MaxTotalBytes} bytes.");
            }
        }
    }

    [GeneratedRegex(
        "^[!#$%&'*+\\-.^_`|~0-9a-z]+$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MetadataKeyRegex();
}