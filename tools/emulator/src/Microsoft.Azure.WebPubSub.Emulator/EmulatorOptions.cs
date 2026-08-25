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

    public bool AllowUnvalidatedEntraTokens { get; set; }

    public string? ManagedIdentityClientId { get; set; }

    public TimeSpan EventHandlerTimeout { get; set; } = TimeSpan.FromSeconds(30);

    public Dictionary<string, HubOptions> Hubs { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
}

internal sealed class HubOptions
{
    public EventHandlerOptions[] EventHandlers { get; set; } = [];

    public EventListenerOptions[] EventListeners { get; set; } = [];
}

internal sealed class EventHandlerOptions
{
    public string UrlTemplate { get; set; } = string.Empty;

    public string? EventPattern { get; set; }

    public string[] SystemEvents { get; set; } = [];

    public EventHandlerAuthOptions? Auth { get; set; }
}

internal sealed class EventHandlerAuthOptions
{
    public string Type { get; set; } = "None";

    public ManagedIdentityAuthOptions? ManagedIdentity { get; set; }
}

internal sealed class ManagedIdentityAuthOptions
{
    public string Resource { get; set; } = string.Empty;
}

internal sealed class EventListenerOptions
{
    public EventNameFilterOptions EventNameFilter { get; set; } = new();

    public EventHubEndpointOptions EventHubEndpoint { get; set; } = new();
}

internal sealed class EventNameFilterOptions
{
    public string? UserEventPattern { get; set; }

    public string[] SystemEvents { get; set; } = [];
}

internal sealed record EventHubEndpointOptions
{
    public string FullyQualifiedNamespace { get; set; } = string.Empty;

    public string EventHubName { get; set; } = string.Empty;
}

internal sealed class EmulatorRuntimeOptions
{
    public TimeSpan ReconnectTimeout { get; init; } = TimeSpan.FromMinutes(1);

    public TimeSpan ReconnectionTokenLifetime { get; init; } = TimeSpan.FromHours(1);

    public int MaxMessageSizeBytes { get; init; } = 1024 * 1024;

    public int ReliableMessageBufferCapacity { get; init; } = 1000;
}
