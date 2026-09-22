// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Extensions.Configuration.Json;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class EventRoutingConfiguration : IHostedService, IDisposable
{
    private readonly IOptionsFactory<EmulatorOptions> _factory;
    private readonly ILogger<EventRoutingConfiguration> _logger;
    private readonly object _gate = new();
    private readonly HashSet<IConfigurationProvider> _failedLoads = [];
    private readonly HashSet<IConfigurationProvider> _invalidFiles = [];
    private readonly List<IDisposable> _subscriptions = [];
    private readonly List<Action> _restoreErrorHandlers = [];
    private EmulatorOptions _current;
    private bool _disposed;

    public EventRoutingConfiguration(IConfiguration configuration, IOptions<EmulatorOptions> initial,
        IOptionsFactory<EmulatorOptions> factory, ILogger<EventRoutingConfiguration> logger)
    {
        _factory = factory;
        _logger = logger;
        _current = initial.Value;
        foreach (var provider in ((IConfigurationRoot)configuration).Providers)
        {
            if (provider is JsonConfigurationProvider json)
            {
                var previous = json.Source.OnLoadException;
                json.Source.OnLoadException = context =>
                {
                    lock (_gate) { _failedLoads.Add(provider); }
                    context.Ignore = true;
                    WarnRejected();
                };
                _restoreErrorHandlers.Add(() => json.Source.OnLoadException = previous);
            }
            _subscriptions.Add(ChangeToken.OnChange(provider.GetReloadToken, () => Reload(provider)));
        }
    }

    public EmulatorOptions Current => Volatile.Read(ref _current);

    public event Action? Changed;

    public EventHandlerOptions[] GetHandlers(string hub) =>
        Current.Hubs.TryGetValue(hub, out var settings) ? settings.EventHandlers : [];

    private void Reload(IConfigurationProvider provider)
    {
        lock (_gate)
        {
            if (_disposed) return;
            // A malformed JSON provider clears its data. Keep the last valid event settings
            // until that provider loads successfully, even if another provider changes.
            if (_failedLoads.Remove(provider)) _invalidFiles.Add(provider);
            else _invalidFiles.Remove(provider);
            if (_invalidFiles.Count != 0) return;
            EmulatorOptions updated;
            try
            {
                updated = _factory.Create(Options.DefaultName);
            }
            catch (Exception exception) when (exception is OptionsValidationException or InvalidOperationException or ArgumentException)
            {
                WarnRejected();
                return;
            }
            Volatile.Write(ref _current, updated);
            Changed?.Invoke();
            _logger.LogInformation("Event handler and listener configuration reloaded. Existing connections remain open.");
        }
    }

    private void WarnRejected() => _logger.LogWarning(
        "Could not reload event handler and listener configuration. The last valid configuration is still in use; check the JSON and WebPubSub settings.");

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StopAsync(CancellationToken cancellationToken)
    {
        Dispose();
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed) return;
            _disposed = true;
        }
        foreach (var subscription in _subscriptions) subscription.Dispose();
        foreach (var restore in _restoreErrorHandlers) restore();
    }
}
