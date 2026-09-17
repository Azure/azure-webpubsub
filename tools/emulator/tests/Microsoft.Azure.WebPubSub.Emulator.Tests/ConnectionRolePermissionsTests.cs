// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class ConnectionRolePermissionsTests
{
    [Theory]
    [InlineData("webpubsub.sendToGroup")]
    [InlineData("webpubsub.sendToGroups.room*")]
    [InlineData("webpubsub.sendToGroup.room")]
    public void LiteralUpdatesOverrideTokenRolesWithoutTreatingTargetsAsPatterns(string role)
    {
        var permissions = new ConnectionRolePermissions(
            [role, "webpubsub.sendToGroup.room"], "webpubsub.sendToGroup", "webpubsub.sendToGroups.");
        Assert.True(permissions.Check("room"));
        Assert.True(permissions.TryRevoke("room"));
        Assert.True(permissions.TryRevoke("room"));
        Assert.False(permissions.Check("room"));
        Assert.True(permissions.TryGrant("room"));
        Assert.True(permissions.Check("room"));
        Assert.True(permissions.TryRevoke("*"));
        Assert.True(permissions.Check("room"));
        Assert.False(permissions.Check("*"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ConcurrentLiteralUpdatesRespectLimitAndReclaimExceptions(bool allowAll)
    {
        var permissions = new ConnectionRolePermissions(
            allowAll ? ["webpubsub.sendToGroup"] : [], "webpubsub.sendToGroup", "webpubsub.sendToGroups.");
        Parallel.For(0, ConnectionRolePermissions.MaximumLiteralCount, i =>
        {
            Assert.True(allowAll ? permissions.TryRevoke($"room{i}") : permissions.TryGrant($"room{i}"));
            Assert.Equal(!allowAll, permissions.Check($"room{i}"));
        });
        Assert.False(allowAll ? permissions.TryRevoke("overflow") : permissions.TryGrant("overflow"));
        Assert.Equal(allowAll, permissions.Check("overflow"));
        Assert.True(allowAll ? permissions.TryRevoke("room0") : permissions.TryGrant("room0"));
        Assert.True(allowAll ? permissions.TryGrant("room0") : permissions.TryRevoke("room0"));
        Assert.Equal(allowAll, permissions.Check("room0"));
        Assert.True(allowAll ? permissions.TryRevoke("overflow") : permissions.TryGrant("overflow"));
    }

    [Theory]
    [InlineData("*", "room")]
    [InlineData("**", "room.nested")]
    [InlineData("*****", "room.nested")]
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

    [Theory]
    [InlineData("******", "room.nested", false)]
    [InlineData("*.*.*.*.*.*", "a.b.c.d.e.f", false)]
    [InlineData(@"\******", "*room.nested", true)]
    [InlineData(@"\*******", "*room.nested", false)]
    public void TestRoleValidationCountsUnescapedAsterisksBeforeTokenization(string pattern, string group, bool expected)
    {
        var permissions = new ConnectionRolePermissions(
            [$"webpubsub.sendToGroups.{pattern}"],
            "webpubsub.sendToGroup",
            "webpubsub.sendToGroups.");

        Assert.Equal(expected, permissions.Check(group));
    }

    [Theory]
    [InlineData("webpubsub.sendToGroup", false)]
    [InlineData("webpubsub.sendToGroup", true)]
    [InlineData("webpubsub.joinLeaveGroup", false)]
    [InlineData("webpubsub.joinLeaveGroup", true)]
    public void TestNineTokenPatternsIncludingDuplicatesExhaustQuota(string role, bool duplicate)
    {
        var prefix = $"{role}s.";
        var patterns = Enumerable.Range(0, 9).Select(i => duplicate ? "a0*" : $"a{i}*").ToArray();
        // Put the last-sorting role first to distinguish sorted order from input order.
        var permissions = new ConnectionRolePermissions(
            patterns.Select(pattern => prefix + pattern).Prepend(prefix + "z*"), role, prefix);

        foreach (var pattern in patterns)
        {
            Assert.True(permissions.Check(pattern[..^1]));
        }
        Assert.False(permissions.Check("z"));
        Assert.True(permissions.TryGrant("z"));
        Assert.True(permissions.Check("z"));
        Assert.True(permissions.TryRevoke("z"));
        Assert.False(permissions.Check("z"));
    }

    [Theory]
    [InlineData("room", "room")]
    [InlineData(@"room\*", "room*")]
    [InlineData(@"room\?", "room?")]
    [InlineData(@"room\\", @"room\")]
    public void TestLiteralPatternRolesCanExceedLiteralLimit(string pattern, string literal)
    {
        var roles = Enumerable.Range(0, 1000).Select(i => $"webpubsub.sendToGroup.group{i}")
            .Append($"webpubsub.sendToGroups.{pattern}");
        var permissions = new ConnectionRolePermissions(roles,
            "webpubsub.sendToGroup",
            "webpubsub.sendToGroups.");

        Assert.True(permissions.Check(literal));
        Assert.False(permissions.Check(literal + "extra"));
        Assert.False(permissions.TryGrant("overflow"));
        Assert.False(permissions.Check("overflow"));
        Assert.True(permissions.TryRevoke(literal));
        Assert.False(permissions.Check(literal));
        Assert.False(permissions.TryGrant("overflow")); // The original 1,000 literals still occupy the quota.
        Assert.True(permissions.TryRevoke("group0"));
        Assert.True(permissions.TryGrant("overflow"));
        Assert.True(permissions.Check("overflow"));
    }

    [Theory]
    [InlineData("de-DE", true)]
    [InlineData("sv-SE", false)]
    public void TestRoleOrderUsesCurrentCultureAtPatternLimit(string culture, bool umlautAllowed)
    {
        var previousCulture = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(culture);
            const string prefix = "webpubsub.sendToGroups.";
            var roles = Enumerable.Range(0, 8).Select(i => $"{prefix}a{i}*")
                .Prepend(prefix + "ä*").Prepend(prefix + "z*");
            var permissions = new ConnectionRolePermissions(roles, "webpubsub.sendToGroup", prefix);

            // German sorts ä before z; Swedish sorts it after z (unlike ordinal in German).
            Assert.Equal(umlautAllowed, permissions.Check("ä"));
            Assert.Equal(!umlautAllowed, permissions.Check("z"));
            for (var i = 0; i < 8; i++)
            {
                Assert.True(permissions.Check($"a{i}"));
            }
        }
        finally
        {
            CultureInfo.CurrentCulture = previousCulture;
        }
    }
}