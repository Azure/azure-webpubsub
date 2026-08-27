// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class EmulatorOptions
{
    public const string SectionName = "WebPubSub";

    public const string DefaultConnectionString =
        "Endpoint=http://localhost:8080;" +
        "AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;" +
        "Version=1.0;";

    public string ConnectionString { get; set; } = DefaultConnectionString;
}

internal sealed class EmulatorRuntimeOptions
{
    public int MaxMessageSizeBytes { get; init; } = 1024 * 1024;

    public int OutboundQueueCapacity { get; init; } = 1000;

    public long MaxOutboundQueueBytes { get; init; } = 16 * 1024 * 1024;
}
