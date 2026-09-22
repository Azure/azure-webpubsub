// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Extensions.Options;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class EmulatorOptions
{
    public const string SectionName = "WebPubSub";

    public const string DefaultAccessKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH";

    public string AccessKey { get; set; } = DefaultAccessKey;

    public bool AllowUnvalidatedEntraTokens { get; set; }

    public Dictionary<string, HubOptions> Hubs { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public string GetConnectionString(Uri endpoint)
    {
        return $"Endpoint={endpoint.GetLeftPart(UriPartial.Authority)};" +
            $"AccessKey={AccessKey};Version=1.0;";
    }

    internal void Validate()
    {
        var failures = new List<string>();
        if (!IsValidAccessKey(AccessKey))
            failures.Add("WebPubSub:AccessKey must be at least 32 UTF-8 bytes and cannot contain leading or trailing whitespace, semicolons, or control characters.");
        if (Hubs?.Values.All(hub => hub?.EventHandlers?.All(handler =>
            handler?.SystemEvents is not null &&
            EventHandlerUrlTemplate.TryResolve(handler.UrlTemplate, "hub", "event", out _) &&
            handler.SystemEvents.All(name =>
                string.Equals(name, "connect", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(name, "connected", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(name, "disconnected", StringComparison.OrdinalIgnoreCase))) == true) != true)
            failures.Add("Event handlers require an HTTP(S) URL without Key Vault references; supported system events are connect/connected/disconnected.");
        if (Hubs?.Values.All(hub => hub?.EventHandlers?.All(handler =>
            handler is not null && (handler.EventPattern?.Split(',').All(pattern =>
                pattern.Trim() == "*" || pattern.IndexOfAny(['*', '?', '\\']) < 0) != false)) == true) != true)
            failures.Add("EventPattern must contain a single event name, comma-separated event names, or a standalone *. Other wildcard and escape syntax is not supported.");
        if (Hubs?.Values.All(hub => hub?.EventListeners?.All(listener =>
            listener?.EventNameFilter?.SystemEvents is not null &&
            listener.EventHubEndpoint?.IsValid() == true) == true) != true)
            failures.Add("Event listeners require an EventNameFilter, EventHubName and a namespace, or a local Event Hubs emulator connection string (not both).");
        if (failures.Count != 0)
            throw new OptionsValidationException(Options.DefaultName, typeof(EmulatorOptions), failures);
    }

    internal static bool IsValidAccessKey(string? accessKey)
    {
        return !string.IsNullOrWhiteSpace(accessKey) &&
            accessKey.Length == accessKey.Trim().Length &&
            !accessKey.Any(character => character == ';' || char.IsControl(character)) &&
            System.Text.Encoding.UTF8.GetByteCount(accessKey) >= 32;
    }
}

internal sealed class HubOptions
{
    public EventHandlerOptions[] EventHandlers { get; set; } = [];

    public EventListenerOptions[] EventListeners { get; set; } = [];
}

internal sealed class EventHandlerOptions
{
    public string UrlTemplate { get; set; } = string.Empty;

    public string[] SystemEvents { get; set; } = [];

    public string? EventPattern { get; set; }

    public bool MatchesUserEvent(string eventName) => EventPattern?.Split(',').Any(value =>
    {
        var pattern = value.Trim();
        // Unlike a wildcard within a pattern, a standalone * also matches dots.
        return pattern == "*" || WildcardPattern.TryCreate(pattern, out var matcher, maximumLength: null) &&
            // EventHandlerTemplateItem retains the original string for its literal fast path.
            (matcher!.IsLiteral ? string.Equals(pattern, eventName, StringComparison.OrdinalIgnoreCase) :
                matcher.Matches(eventName, ignoreCase: true));
    }) == true;
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
