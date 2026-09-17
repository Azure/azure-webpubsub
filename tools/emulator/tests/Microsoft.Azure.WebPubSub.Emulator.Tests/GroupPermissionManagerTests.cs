// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class GroupPermissionManagerTests
{
    [Theory]
    [InlineData("room", "room")]
    [InlineData(@"room\*", "room*")]
    [InlineData(@"room\?", "room?")]
    [InlineData(@"room\\", @"room\")]
    public void TestPureLiteralPatternUsesLiteralTransitions(string pattern, string literal)
    {
        var manager = new GroupPermissionManager();
        Assert.Equal(0ul, manager.Revision);
        Assert.False(manager.Check(literal));

        Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern(pattern));
        Assert.Equal(1ul, manager.Revision);
        Assert.True(manager.Check(literal));
        Assert.False(manager.Check(literal + "extra"));
        Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern(pattern));
        Assert.Equal(1ul, manager.Revision); // Unlike a duplicate glob, a duplicate literal is a no-op.

        Assert.Equal(PermissionUpdateErrorCode.None, manager.Revoke(literal));
        Assert.Equal(2ul, manager.Revision);
        Assert.False(manager.Check(literal));
        Assert.Equal(PermissionUpdateErrorCode.None, manager.Revoke(literal));
        Assert.Equal(2ul, manager.Revision); // The grant was removed, not replaced with a deny exception.
        Assert.Equal(PermissionUpdateErrorCode.None, manager.Grant(literal));
        Assert.Equal(3ul, manager.Revision);
        Assert.True(manager.Check(literal));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void TestLiteralLimitIsAtomicAndOppositeUpdateReclaimsQuota(bool allowAll)
    {
        var manager = new GroupPermissionManager();
        if (allowAll)
        {
            manager.GrantAll();
        }
        for (var i = 0; i < 1000; i++)
        {
            Assert.Equal(PermissionUpdateErrorCode.None, SetLiteral(manager, $"room{i}", !allowAll));
        }
        var revision = manager.Revision;

        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, SetLiteral(manager, "overflow", !allowAll));
        Assert.Equal(revision, manager.Revision);
        Assert.Equal(allowAll, manager.Check("overflow"));
        for (var i = 0; i < 1000; i++)
        {
            Assert.Equal(!allowAll, manager.Check($"room{i}"));
        }

        Assert.Equal(PermissionUpdateErrorCode.None, SetLiteral(manager, "room0", !allowAll));
        Assert.Equal(PermissionUpdateErrorCode.None, SetLiteral(manager, "overflow", allowAll));
        Assert.Equal(revision, manager.Revision); // Both no-ops succeed at the limit.
        Assert.Equal(PermissionUpdateErrorCode.None, SetLiteral(manager, "room0", allowAll));
        Assert.Equal(allowAll, manager.Check("room0"));
        Assert.Equal(revision + 1, manager.Revision);
        Assert.Equal(PermissionUpdateErrorCode.None, SetLiteral(manager, "overflow", !allowAll));
        Assert.Equal(!allowAll, manager.Check("overflow"));
        Assert.Equal(revision + 2, manager.Revision);
        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, SetLiteral(manager, "another", !allowAll));
        Assert.Equal(revision + 2, manager.Revision);
        Assert.Equal(allowAll, manager.Check("another"));
    }

    [Theory]
    [InlineData("extra", "extra")]
    [InlineData(@"extra\*", "extra*")]
    [InlineData(@"extra\?", "extra?")]
    [InlineData(@"extra\\", @"extra\")]
    public void TestGrantPatternLiteralChecksOnlyPatternLimit(string pattern, string literal)
    {
        var manager = new GroupPermissionManager();
        for (var i = 0; i < 1000; i++)
        {
            Assert.Equal(PermissionUpdateErrorCode.None, manager.Grant($"room{i}"));
        }

        // GrantPattern checks only pattern count, even for literals.
        Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern(pattern));
        Assert.Equal(1001ul, manager.Revision);
        Assert.True(manager.Check(literal));
        Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern(pattern));
        Assert.Equal(1001ul, manager.Revision);
        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, manager.Grant("overflow"));
        Assert.False(manager.Check("overflow"));
        // With 1,001 literals even ordinary no-ops fail their post-update literal-count check.
        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, manager.Grant("room0"));
        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, manager.Revoke("absent"));
        Assert.True(manager.Check("room0"));
        Assert.False(manager.Check("absent"));
        Assert.Equal(1001ul, manager.Revision);

        Assert.Equal(PermissionUpdateErrorCode.None, manager.Revoke(literal));
        Assert.False(manager.Check(literal));
        Assert.Equal(1002ul, manager.Revision);
        Assert.Equal(PermissionUpdateErrorCode.None, manager.Grant("room0"));
        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, manager.Grant("overflow"));
        Assert.Equal(1002ul, manager.Revision);
        Assert.Equal(PermissionUpdateErrorCode.None, manager.Revoke("room0"));
        Assert.Equal(PermissionUpdateErrorCode.None, manager.Grant("overflow"));
        Assert.Equal(1004ul, manager.Revision);
        Assert.True(manager.Check("overflow"));
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public void TestNineExplicitPatternsIncludeDuplicatesAndDefaultInQuota(bool allowAll, bool duplicate)
    {
        var manager = new GroupPermissionManager();
        if (allowAll)
        {
            manager.GrantAll();
        }
        // The implicit default is the tenth rule; redundant patterns are not compressed here.
        for (var i = 0; i < 9; i++)
        {
            var revisionBeforeGrant = manager.Revision;
            Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern(duplicate ? "room0*" : $"room{i}*"));
            Assert.Equal(revisionBeforeGrant + 1, manager.Revision);
        }
        Assert.True(manager.Check("room0"));
        Assert.Equal(PermissionUpdateErrorCode.None, SetLiteral(manager, "target", !allowAll));
        var revision = manager.Revision;

        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, manager.GrantPattern("target*"));
        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, manager.GrantPattern("room0*"));
        Assert.Equal(revision, manager.Revision);
        Assert.Equal(!allowAll, manager.Check("target")); // Failed pattern insertion must not remove the literal.
        Assert.Equal(allowAll, manager.Check("targetExtra"));
        Assert.True(manager.Check("room0"));

        Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern("plain"));
        Assert.True(manager.Check("plain")); // Pure literals still fit when all nine pattern slots are used.
        Assert.Equal(revision + (allowAll ? 0ul : 1ul), manager.Revision);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("**")]
    [InlineData("******")]
    public void TestGrantAllClearsLiteralsAndPatternCount(string? pattern)
    {
        var manager = new GroupPermissionManager();
        for (var i = 0; i < 9; i++)
        {
            Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern("room*"));
        }
        for (var i = 0; i < 1000; i++)
        {
            Assert.Equal(PermissionUpdateErrorCode.None, manager.Revoke($"room{i}"));
        }
        Assert.False(manager.Check("room0"));
        Assert.False(manager.Check("unmatched.nested"));
        var revision = manager.Revision;

        for (var reset = 1; reset <= 2; reset++)
        {
            if (pattern is null)
            {
                manager.GrantAll();
            }
            else
            {
                Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern(pattern));
            }
            Assert.Equal(revision + (ulong)reset, manager.Revision); // Even an already-allowed reset advances revision.
        }
        for (var i = 0; i < 1000; i++)
        {
            Assert.True(manager.Check($"room{i}"));
        }
        Assert.True(manager.Check("unmatched.nested"));

        for (var i = 0; i < 9; i++)
        {
            Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern("new*"));
        }
        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, manager.GrantPattern("tenth*"));
        for (var i = 0; i < 1000; i++)
        {
            Assert.Equal(PermissionUpdateErrorCode.None, manager.Revoke($"new{i}"));
            Assert.False(manager.Check($"new{i}"));
        }
        Assert.Equal(PermissionUpdateErrorCode.ExceededMaxPermissions, manager.Revoke("overflow"));
        Assert.True(manager.Check("overflow"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void TestAddingPatternRemovesMatchingLiteralsAndReclaimsQuota(bool allowAll)
    {
        var manager = new GroupPermissionManager();
        if (allowAll)
        {
            manager.GrantAll();
        }
        for (var i = 0; i < 1000; i++)
        {
            Assert.Equal(PermissionUpdateErrorCode.None, SetLiteral(manager, i == 999 ? "other" : $"room{i}", !allowAll));
        }
        Assert.Equal(!allowAll, manager.Check("room0"));
        var revision = manager.Revision;

        Assert.Equal(PermissionUpdateErrorCode.None, manager.GrantPattern("room*"));
        Assert.Equal(revision + 1, manager.Revision);
        Assert.True(manager.Check("room0"));
        Assert.True(manager.Check("roomNew"));
        Assert.Equal(!allowAll, manager.Check("other")); // Nonmatching exceptions survive.
        Assert.Equal(PermissionUpdateErrorCode.None, manager.Grant("room0"));
        Assert.Equal(revision + 1, manager.Revision);
        Assert.Equal(PermissionUpdateErrorCode.None, manager.Revoke("room0"));
        Assert.False(manager.Check("room0")); // A stale positive literal would remove itself and expose the allow pattern.
        Assert.Equal(revision + 2, manager.Revision);
        Assert.Equal(PermissionUpdateErrorCode.None, manager.Grant("room0"));
        Assert.True(manager.Check("room0"));
        Assert.Equal(revision + 3, manager.Revision);
        Assert.Equal(PermissionUpdateErrorCode.None, SetLiteral(manager, "outside", !allowAll));
        Assert.Equal(!allowAll, manager.Check("outside"));
    }

    private static PermissionUpdateErrorCode SetLiteral(GroupPermissionManager manager, string group, bool allowed) =>
        allowed ? manager.Grant(group) : manager.Revoke(group);
}