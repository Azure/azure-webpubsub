// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Extensions.Logging;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class ConnectionRolePermissions
{
    public const int MaximumLiteralCount = Constants.Permission.MaxLiteralCount;
    private readonly GroupPermissionManager _permissions = new();

    public ConnectionRolePermissions(
        IEnumerable<string> roles,
        string role,
        string patternRolePrefix,
        ILogger? logger = null)
    {
        // Use current-culture ordering/prefix comparisons, preserving duplicates
        // and untrimmed values. Permission literals and matching remain case-sensitive.
        foreach (var value in roles.OrderBy(k => k))
        {
            if (value.StartsWith(patternRolePrefix))
            {
                var pattern = value[patternRolePrefix.Length..];
                if (WebPubSubNameValidator.IsValidPattern(pattern, out var errorMessage))
                {
                    if (_permissions.GrantPattern(pattern) != PermissionUpdateErrorCode.None)
                    {
                        logger?.LogError(
                            "The count of group name patterns exceeds {MaxPatternCount}. Skipped '{groupNamePattern}'.",
                            Constants.Permission.MaxPatternCount,
                            pattern);
                    }
                }
                else
                {
                    logger?.LogError("Invalid group name pattern: {groupNamePattern}. {reason}", pattern, errorMessage);
                    continue;
                }
            }
            else if (value == role)
            {
                _permissions.GrantAll();
            }
            else if (value.StartsWith(role))
            {
                if (value.Length == role.Length)
                {
                    _permissions.GrantAll();
                }
                else if (value[role.Length] == '.')
                {
                    var group = value[(role.Length + 1)..];
                    if (WebPubSubNameValidator.IsValidGroupName(group))
                    {
                        // Ignore literal quota failures during role initialization.
                        _permissions.Grant(group);
                    }
                }
            }
        }
    }

    public bool Check(string group) => _permissions.Check(group);

    public bool TryGrant(string group) => _permissions.Grant(group) == PermissionUpdateErrorCode.None;

    public bool TryRevoke(string group) => _permissions.Revoke(group) == PermissionUpdateErrorCode.None;
}