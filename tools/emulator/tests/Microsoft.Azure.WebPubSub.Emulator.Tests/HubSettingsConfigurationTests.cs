// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class HubSettingsConfigurationTests
{
    [Fact]
    public void InitializationDoesNotOverwriteAnUpdateReceivedDuringCurrentValueRead()
    {
        var initial = Options.Create(new EmulatorOptions());
        var updated = new EmulatorOptions();
        var monitor = new ControlledMonitor(new EmulatorOptions());
        monitor.BeforeReadReturns = () => monitor.Publish(updated);

        using var configuration = new HubSettingsConfiguration(monitor, initial, NullLogger<HubSettingsConfiguration>.Instance);

        Assert.Same(updated, configuration.Current);
    }

    [Fact]
    public void InitializationReadsAnUpdatePublishedBeforeSubscription()
    {
        var initial = Options.Create(new EmulatorOptions());
        var updated = new EmulatorOptions();
        var monitor = new ControlledMonitor(new EmulatorOptions());
        monitor.BeforeSubscribe = () => monitor.Publish(updated);

        using var configuration = new HubSettingsConfiguration(monitor, initial, NullLogger<HubSettingsConfiguration>.Instance);

        Assert.Same(updated, configuration.Current);
    }

    private sealed class ControlledMonitor(EmulatorOptions initial) : IOptionsMonitor<EmulatorOptions>
    {
        private EmulatorOptions _current = initial;
        private event Action<EmulatorOptions, string?>? Changed;
        public Action? BeforeReadReturns { get; set; }
        public Action? BeforeSubscribe { get; set; }

        public EmulatorOptions CurrentValue
        {
            get
            {
                var captured = _current;
                BeforeReadReturns?.Invoke();
                return captured;
            }
        }

        public EmulatorOptions Get(string? name) => CurrentValue;

        public void Publish(EmulatorOptions options)
        {
            _current = options;
            Changed?.Invoke(options, Options.DefaultName);
        }

        public IDisposable OnChange(Action<EmulatorOptions, string?> listener)
        {
            BeforeSubscribe?.Invoke();
            Changed += listener;
            return new Subscription(() => Changed -= listener);
        }

        private sealed class Subscription(Action unsubscribe) : IDisposable
        {
            public void Dispose() => unsubscribe();
        }
    }
}
