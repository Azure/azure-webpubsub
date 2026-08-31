// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class AckCacheTests
{
    [Fact]
    public void CacheRetainsMostRecentThousandAckIds()
    {
        var cache = new AckCache();

        for (ulong ackId = 1; ackId <= 1001; ackId++)
        {
            cache.Add(ackId);
        }

        Assert.False(cache.Contains(1));
        Assert.True(cache.Contains(2));
        Assert.True(cache.Contains(1001));
    }

}
