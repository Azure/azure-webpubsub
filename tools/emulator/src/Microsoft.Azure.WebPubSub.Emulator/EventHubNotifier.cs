// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Globalization;
using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Producer;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class EventHubNotifier : IAsyncDisposable
{
    private readonly HubSettingsConfiguration _configuration;
    private readonly Func<EventHubEndpointOptions, EventHubProducerClient> _createProducer;
    private readonly ILogger<EventHubNotifier> _logger;
    private readonly Dictionary<EventHubEndpointOptions, Lazy<EventHubProducerClient>> _producers = [];
    private readonly object _gate = new();
    private readonly CancellationTokenSource _shutdown = new();
    private readonly TaskCompletionSource _drained = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private int _pending;
    private bool _stopping;

    public EventHubNotifier(HubSettingsConfiguration configuration,
        Func<EventHubEndpointOptions, EventHubProducerClient> createProducer, ILogger<EventHubNotifier> logger)
    {
        _configuration = configuration;
        _createProducer = createProducer;
        _logger = logger;
    }

    private Lazy<EventHubProducerClient> GetProducer(EventHubEndpointOptions endpoint)
    {
        if (!_producers.TryGetValue(endpoint, out var producer))
        {
            producer = new Lazy<EventHubProducerClient>(() => _createProducer(endpoint));
            _producers.Add(endpoint, producer);
        }
        return producer;
    }

    public async Task<bool> TryNotifyAsync(UpstreamConnectionContext connection, string eventName, int id,
        MessageData data, bool userEvent)
    {
        Lazy<EventHubProducerClient>[] deliveries;
        lock (_gate)
        {
            if (_stopping) throw new ObjectDisposedException(nameof(EventHubNotifier));
            if (!_configuration.Current.Hubs.TryGetValue(connection.Hub, out var hub)) return false;
            deliveries = hub.EventListeners.Where(listener => listener.EventNameFilter.Matches(eventName, userEvent))
                .Select(listener => GetProducer(listener.EventHubEndpoint)).ToArray();
            if (deliveries.Length == 0) return false;
            _pending++;
        }
        try
        {
            await Task.WhenAll(deliveries.Select(async producer =>
            {
                try
                {
                    var message = CreateMessage(connection, eventName, id, data, userEvent);
                    await producer.Value.SendAsync([message],
                        new SendEventOptions { PartitionKey = connection.ConnectionId }, _shutdown.Token);
                }
                catch (Exception exception)
                {
                    // Never log a target connection string or credential diagnostics.
                    _logger.LogWarning("Listener delivery failed for {EventName}, connection {ConnectionId} ({ErrorType}).",
                        eventName, connection.ConnectionId, exception.GetType().Name);
                }
            }));
            // Runtime reports a matching listener, not successful broker delivery.
            return true;
        }
        finally
        {
            lock (_gate) { if (--_pending == 0 && _stopping) _drained.TrySetResult(); }
        }
    }

    public async ValueTask DisposeAsync()
    {
        lock (_gate)
        {
            if (_stopping) return;
            _stopping = true;
            if (_pending == 0) _drained.TrySetResult();
        }
        try { await _drained.Task.WaitAsync(TimeSpan.FromSeconds(10)); }
        catch (TimeoutException) { _logger.LogWarning("Listener shutdown timed out; remaining deliveries will be canceled."); }
        try
        {
            await _shutdown.CancelAsync();
            await Task.WhenAll(_producers.Values.Where(producer => producer.IsValueCreated)
                .Select(async producer => await producer.Value.DisposeAsync()));
        }
        finally { _shutdown.Dispose(); }
    }

    internal static EventData CreateMessage(UpstreamConnectionContext connection, string eventName, int id,
        MessageData data, bool userEvent)
    {
        var message = new EventData(data.Bytes)
        {
            MessageId = $"{connection.ConnectionId}/{id}",
            ContentType = data.Type switch
            {
                MessageDataType.Text => "text/plain",
                MessageDataType.Binary => "application/octet-stream",
                MessageDataType.Protobuf => "application/x-protobuf",
                _ => "application/json",
            },
        };
        var properties = message.Properties;
        properties["cloudEvents:specversion"] = "1.0";
        properties["cloudEvents:awpsversion"] = "1.0";
        properties["cloudEvents:type"] = $"azure.webpubsub.{(userEvent ? "user" : "sys")}.{eventName}";
        properties["cloudEvents:source"] = $"/hubs/{connection.Hub}/client/{connection.ConnectionId}";
        properties["cloudEvents:id"] = id.ToString(CultureInfo.InvariantCulture);
        properties["cloudEvents:time"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
        properties["cloudEvents:hub"] = connection.Hub;
        properties["cloudEvents:eventname"] = eventName;
        properties["cloudEvents:connectionid"] = connection.ConnectionId;
        SetIfNotEmpty(properties, "cloudEvents:userid", connection.UserId);
        SetIfNotEmpty(properties, "cloudEvents:subprotocol", connection.Subprotocol);
        SetIfNotEmpty(properties, "cloudEvents:connectionstate", connection.ConnectionState);
        if (userEvent && data.Metadata is { } metadata)
        {
            var normalized = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in metadata) normalized[item.Key] = item.Value;
            foreach (var item in normalized)
            {
                properties["x-webpubsub-metadata-" + item.Key.ToLowerInvariant()] = item.Value;
            }
        }
        return message;
    }

    private static void SetIfNotEmpty(IDictionary<string, object> properties, string key, string? value)
    {
        if (!string.IsNullOrEmpty(value)) properties[key] = value;
    }
}