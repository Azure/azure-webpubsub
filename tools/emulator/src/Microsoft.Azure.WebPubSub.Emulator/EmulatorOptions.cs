// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class EmulatorOptions
{
    public const string SectionName = "WebPubSub";

    public const string DefaultAccessKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH";

    public string AccessKey { get; set; } = DefaultAccessKey;

    public bool AllowUnvalidatedEntraTokens { get; set; }

    public string GetConnectionString(Uri endpoint)
    {
        return $"Endpoint={endpoint.GetLeftPart(UriPartial.Authority)};" +
            $"AccessKey={AccessKey};Version=1.0;";
    }

    internal static bool IsValidAccessKey(string? accessKey)
    {
        return !string.IsNullOrWhiteSpace(accessKey) &&
            accessKey.Length == accessKey.Trim().Length &&
            !accessKey.Any(character => character == ';' || char.IsControl(character)) &&
            System.Text.Encoding.UTF8.GetByteCount(accessKey) >= 32;
    }
}

internal sealed class EmulatorRuntimeOptions
{
    public int MaxMessageSizeBytes { get; init; } = 1024 * 1024;

    public int OutboundQueueCapacity { get; init; } = 1000;

    public long MaxOutboundQueueBytes { get; init; } = 16 * 1024 * 1024;

    public TimeSpan ReconnectTimeout { get; init; } = TimeSpan.FromSeconds(30);

    public TimeSpan ReconnectionTokenLifetime { get; init; } = TimeSpan.FromDays(7);

    public int ReliableMessageBufferCapacity { get; init; } = 1000;

    public long MaxReliableMessageBufferBytes { get; init; } = 16 * 1024 * 1024;
}
