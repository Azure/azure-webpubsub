// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Data.Common;
using Azure.Messaging.EventHubs;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class EventListenerOptions
{
    public EventNameFilterOptions EventNameFilter { get; set; } = new();
    public EventHubEndpointOptions EventHubEndpoint { get; set; } = new();
}

internal sealed class EventNameFilterOptions
{
    public string[] SystemEvents { get; set; } = [];
    public string? UserEventPattern { get; set; }

    public bool Matches(string eventName, bool userEvent) => userEvent
        ? UserEventPattern?.Split(',').Any(value => value.Trim() == "*" ||
            string.Equals(value.Trim(), eventName, StringComparison.OrdinalIgnoreCase)) == true
        : (string.Equals(eventName, "connected", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventName, "disconnected", StringComparison.OrdinalIgnoreCase)) &&
            SystemEvents.Contains(eventName, StringComparer.OrdinalIgnoreCase);
}

internal sealed record EventHubEndpointOptions
{
    public string FullyQualifiedNamespace { get; init; } = string.Empty;
    public string EventHubName { get; init; } = string.Empty;
    // Local Event Hubs emulator extension; cloud targets use the host's Azure Identity credential.
    public string? ConnectionString { get; init; }

    public bool IsValid()
    {
        if (string.IsNullOrWhiteSpace(EventHubName)) return false;
        if (ConnectionString is null)
            return Uri.CheckHostName(FullyQualifiedNamespace) == UriHostNameType.Dns;
        if (!string.IsNullOrEmpty(FullyQualifiedNamespace)) return false;
        try
        {
            var parsed = EventHubsConnectionStringProperties.Parse(ConnectionString);
            var fields = new DbConnectionStringBuilder { ConnectionString = ConnectionString };
            return fields.TryGetValue("UseDevelopmentEmulator", out var emulator) &&
                bool.TryParse(emulator.ToString(), out var local) && local &&
                (string.IsNullOrEmpty(parsed.EventHubName) || parsed.EventHubName == EventHubName);
        }
        catch (Exception exception) when (exception is ArgumentException or FormatException) { return false; }
    }
}