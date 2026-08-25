// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class GroupStateStore
{
    private readonly object _lock = new();
    private readonly Dictionary<string, GroupStateEntry> _entries = [];
    private long _lastTimestamp;

    public long SetState(string group, Dictionary<string, string> state)
    {
        lock (_lock)
        {
            var updatedAt = GetMonotonicTimestamp();
            _entries[group] = new GroupStateEntry(state, updatedAt);
            return updatedAt;
        }
    }

    public long ClearState(string group)
    {
        lock (_lock)
        {
            var updatedAt = GetMonotonicTimestamp();
            _entries.Remove(group);
            return updatedAt;
        }
    }

    public GroupStateEntry? GetState(string group)
    {
        lock (_lock)
        {
            return _entries.TryGetValue(group, out var entry) ? entry : null;
        }
    }

    public string[] GetAllGroupsWithState()
    {
        lock (_lock)
        {
            return [.. _entries.Keys];
        }
    }

    private long GetMonotonicTimestamp()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _lastTimestamp = Math.Max(now, _lastTimestamp + 1);
        return _lastTimestamp;
    }
}

internal sealed record GroupStateEntry(
    IReadOnlyDictionary<string, string> State,
    long UpdatedAt);

internal sealed class GroupStateSubscriptionSet
{
    private readonly object _lock = new();
    private readonly HashSet<string> _subscriptions = new(StringComparer.Ordinal);

    public void Subscribe(string group)
    {
        lock (_lock)
        {
            _subscriptions.Add(group);
        }
    }

    public void Unsubscribe(string group)
    {
        lock (_lock)
        {
            _subscriptions.Remove(group);
        }
    }

    public bool IsSubscribed(string group)
    {
        lock (_lock)
        {
            return _subscriptions.Contains(group);
        }
    }
}