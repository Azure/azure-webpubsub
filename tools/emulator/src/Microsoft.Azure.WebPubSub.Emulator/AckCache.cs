// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class AckCache
{
    private const int Capacity = 1000;

    private readonly object _lock = new();
    private readonly HashSet<ulong> _ackIds = new(Capacity);
    private readonly Queue<ulong> _insertionOrder = new(Capacity);

    public bool Contains(ulong ackId)
    {
        lock (_lock)
        {
            return _ackIds.Contains(ackId);
        }
    }

    public void Add(ulong ackId)
    {
        lock (_lock)
        {
            if (!_ackIds.Add(ackId))
            {
                return;
            }

            _insertionOrder.Enqueue(ackId);
            if (_ackIds.Count > Capacity)
            {
                _ackIds.Remove(_insertionOrder.Dequeue());
            }
        }
    }
}
