// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class ConnectionRolePermissionsTests
{
    [Theory]
    [InlineData("*", "room")]
    [InlineData("**", "room.nested")]
    [InlineData("******", "room.nested")]
    [InlineData("*.*.*.*.*", "a.b.c.d.e")]
    [InlineData("room\\*", "room*")]
    public void SupportedWildcardPatternsGrantPermission(string pattern, string group)
    {
        var permissions = new ConnectionRolePermissions(
            [$"webpubsub.sendToGroups.{pattern}"],
            "webpubsub.sendToGroup",
            "webpubsub.sendToGroups.");

        Assert.True(permissions.Check(group));
    }

    [Fact]
    public void ConsecutiveAsterisksCountAsOneWildcardToken()
    {
        var permissions = new ConnectionRolePermissions(
            ["webpubsub.sendToGroups.******"],
            "webpubsub.sendToGroup",
            "webpubsub.sendToGroups.");

        Assert.True(permissions.Check("room.nested"));
    }

    [Fact]
    public void MoreThanFiveWildcardTokensAreIgnored()
    {
        var permissions = new ConnectionRolePermissions(
            ["webpubsub.sendToGroups.*.*.*.*.*.*"],
            "webpubsub.sendToGroup",
            "webpubsub.sendToGroups.");

        Assert.False(permissions.Check("a.b.c.d.e.f"));
    }
}