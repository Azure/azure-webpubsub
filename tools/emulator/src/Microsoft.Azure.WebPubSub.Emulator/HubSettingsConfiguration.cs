// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Extensions.Options;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class HubSettingsConfiguration : IHostedService, IDisposable
{
    private readonly IDisposable? _subscription;
    private EmulatorOptions _current;

    public HubSettingsConfiguration(IOptionsMonitor<EmulatorOptions> monitor, IOptions<EmulatorOptions> initial,
        ILogger<HubSettingsConfiguration> logger)
    {
        // Initialize the restart-only options before any configuration changes.
        _current = initial.Value;
        _subscription = monitor.OnChange(updated =>
        {
            Volatile.Write(ref _current, updated);
            Changed?.Invoke();
            logger.LogInformation("Event handler and listener configuration reloaded. Existing connections remain open.");
        });
        _current = monitor.CurrentValue;
    }

    public EmulatorOptions Current => Volatile.Read(ref _current);

    public event Action? Changed;

    public EventHandlerOptions[] GetHandlers(string hub) =>
        Current.Hubs.TryGetValue(hub, out var settings) ? settings.EventHandlers : [];

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StopAsync(CancellationToken cancellationToken)
    {
        Dispose();
        return Task.CompletedTask;
    }

    public void Dispose() => _subscription?.Dispose();
}
