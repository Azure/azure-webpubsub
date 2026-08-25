// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class ConnectionRolePermissionsTests
{
    [Theory]
    [InlineData("webpubsub.sendToGroup", "any.group", true)]
    [InlineData("webpubsub.sendToGroup.room", "room", true)]
    [InlineData("webpubsub.sendToGroup.room", "Room", false)]
    [InlineData("webpubsub.sendToGroup.*", "*", true)]
    [InlineData("webpubsub.sendToGroup.*", "room", false)]
    [InlineData("webpubsub.sendToGroups.client-*", "client-device", true)]
    [InlineData("webpubsub.sendToGroups.client-*", "client", false)]
    [InlineData("webpubsub.sendToGroups.client-*", "client-device.child", false)]
    [InlineData("webpubsub.sendToGroups.client-**", "client-device.child", true)]
    [InlineData("webpubsub.sendToGroups.client-?", "client-a", true)]
    [InlineData("webpubsub.sendToGroups.client-?", "client-ab", false)]
    [InlineData(@"webpubsub.sendToGroups.literal-\*", "literal-*", true)]
    [InlineData(@"webpubsub.sendToGroups.invalid-\a", "invalid-a", false)]
    [InlineData("webpubsub.sendToGroups.******", "anything", false)]
    public void Check_SendToGroupRoles_MatchesRuntimeGrammar(
        string role,
        string group,
        bool expected)
    {
        var permissions = new ConnectionRolePermissions(
            [role],
            "webpubsub.sendToGroup",
            "webpubsub.sendToGroups.");

        Assert.Equal(expected, permissions.Check(group));
    }

    [Theory]
    [InlineData("webpubsub.joinLeaveGroup", "any.group", true)]
    [InlineData("webpubsub.joinLeaveGroup.room", "room", true)]
    [InlineData("webpubsub.joinLeaveGroups.team-*", "team-a", true)]
    [InlineData("webpubsub.joinLeaveGroups.team-*", "team-a.child", false)]
    public void Check_JoinLeaveRoles_MatchesRuntimeGrammar(
        string role,
        string group,
        bool expected)
    {
        var permissions = new ConnectionRolePermissions(
            [role],
            "webpubsub.joinLeaveGroup",
            "webpubsub.joinLeaveGroups.");

        Assert.Equal(expected, permissions.Check(group));
    }
}
