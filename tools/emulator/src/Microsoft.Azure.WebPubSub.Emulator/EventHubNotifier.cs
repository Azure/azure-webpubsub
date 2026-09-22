// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Globalization;
using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Producer;
using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class EventHubNotifier : IAsyncDisposable
{
    private readonly EventRoutingConfiguration _configuration;
    private readonly Func<EventHubEndpointOptions, EventHubProducerClient> _createProducer;
    private readonly ILogger<EventHubNotifier> _logger;
    private readonly Dictionary<EventHubEndpointOptions, ProducerEntry> _producers = [];
    private readonly HashSet<ProducerEntry> _retired = [];
    private readonly object _gate = new();
    private readonly CancellationTokenSource _shutdown = new();
    private readonly TaskCompletionSource _drained = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private EmulatorOptions _options;
    private int _pending;
    private bool _stopping;

    public EventHubNotifier(EventRoutingConfiguration configuration,
        Func<EventHubEndpointOptions, EventHubProducerClient> createProducer, ILogger<EventHubNotifier> logger)
    {
        _configuration = configuration;
        _createProducer = createProducer;
        _logger = logger;
        lock (_gate)
        {
            _configuration.Changed += Reload;
            _options = configuration.Current;
            UpdateProducers();
        }
    }

    private void Reload()
    {
        lock (_gate)
        {
            if (_stopping) return;
            _options = _configuration.Current;
            UpdateProducers();
        }
    }

    private void UpdateProducers()
    {
        var endpoints = _options.Hubs.Values.SelectMany(hub => hub.EventListeners)
            .Select(listener => listener.EventHubEndpoint).ToHashSet();
        foreach (var endpoint in _producers.Keys.Where(endpoint => !endpoints.Contains(endpoint)).ToArray())
        {
            var entry = _producers[endpoint];
            _producers.Remove(endpoint);
            Retire(entry);
        }
        foreach (var endpoint in endpoints)
        {
            if (!_producers.ContainsKey(endpoint))
                _producers.Add(endpoint, new ProducerEntry(() => _createProducer(endpoint)));
        }
    }

    public async Task<bool> TryNotifyAsync(UpstreamConnectionContext connection, string eventName, int id,
        MessageData data, bool userEvent)
    {
        ProducerEntry[] deliveries;
        lock (_gate)
        {
            if (_stopping) throw new ObjectDisposedException(nameof(EventHubNotifier));
            if (!_options.Hubs.TryGetValue(connection.Hub, out var hub)) return false;
            deliveries = hub.EventListeners.Where(listener => listener.EventNameFilter.Matches(eventName, userEvent))
                .Select(listener => _producers[listener.EventHubEndpoint]).ToArray();
            if (deliveries.Length == 0) return false;
            foreach (var entry in deliveries) entry.Pending++;
            _pending++;
        }
        try
        {
            await Task.WhenAll(deliveries.Select(async entry =>
            {
                try
                {
                    var message = CreateMessage(connection, eventName, id, data, userEvent);
                    await entry.Client.Value.SendAsync([message],
                        new SendEventOptions { PartitionKey = connection.ConnectionId }, _shutdown.Token);
                }
                catch (Exception exception)
                {
                    // Never log a target connection string or credential diagnostics.
                    _logger.LogWarning("Listener delivery failed for {EventName}, connection {ConnectionId} ({ErrorType}).",
                        eventName, connection.ConnectionId, exception.GetType().Name);
                }
                finally
                {
                    lock (_gate)
                    {
                        if (--entry.Pending == 0 && entry.Retired) _ = StartDisposal(entry);
                    }
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

    private void Retire(ProducerEntry entry)
    {
        entry.Retired = true;
        _retired.Add(entry);
        if (entry.Pending == 0) StartDisposal(entry);
    }

    private Task StartDisposal(ProducerEntry entry) => entry.Disposal ??= DisposeProducerAsync(entry);

    private async Task DisposeProducerAsync(ProducerEntry entry)
    {
        try
        {
            if (entry.Client.IsValueCreated) await entry.Client.Value.DisposeAsync();
        }
        catch (Exception exception)
        {
            _logger.LogWarning("Closing a removed event listener failed ({ErrorType}).", exception.GetType().Name);
        }
        finally
        {
            lock (_gate) { _retired.Remove(entry); }
        }
    }

    public async ValueTask DisposeAsync()
    {
        lock (_gate)
        {
            if (_stopping) return;
            _stopping = true;
            _configuration.Changed -= Reload;
            foreach (var entry in _producers.Values) Retire(entry);
            _producers.Clear();
            if (_pending == 0) _drained.TrySetResult();
        }
        try { await _drained.Task.WaitAsync(TimeSpan.FromSeconds(10)); }
        catch (TimeoutException) { _logger.LogWarning("Listener shutdown timed out; remaining deliveries will be canceled."); }
        await _shutdown.CancelAsync();
        Task[] disposals;
        lock (_gate) { disposals = _retired.ToArray().Select(StartDisposal).ToArray(); }
        await Task.WhenAll(disposals);
        _shutdown.Dispose();
    }

    private sealed class ProducerEntry(Func<EventHubProducerClient> create)
    {
        public Lazy<EventHubProducerClient> Client { get; } = new(create);
        public int Pending { get; set; }
        public bool Retired { get; set; }
        public Task? Disposal { get; set; }
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