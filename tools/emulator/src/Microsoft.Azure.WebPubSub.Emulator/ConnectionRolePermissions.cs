// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class ConnectionRolePermissions
{
    private readonly HashSet<string> _literals = new(StringComparer.Ordinal);
    private readonly List<WildcardPattern> _patterns = [];
    private bool _allowAll;

    public ConnectionRolePermissions(
        IEnumerable<string> roles,
        string role,
        string patternRolePrefix)
    {
        foreach (var value in roles.Order(StringComparer.Ordinal))
        {
            if (value.StartsWith(patternRolePrefix, StringComparison.Ordinal))
            {
                if (WildcardPattern.TryCreate(
                    value[patternRolePrefix.Length..],
                    out var pattern,
                    maximumAsteriskCount: 5))
                {
                    _patterns.Add(pattern!);
                }
            }
            else if (string.Equals(value, role, StringComparison.Ordinal))
            {
                _allowAll = true;
            }
            else if (value.StartsWith(role, StringComparison.Ordinal) &&
                value.Length > role.Length &&
                value[role.Length] == '.')
            {
                _literals.Add(value[(role.Length + 1)..]);
            }
        }
    }

    public bool Check(string group)
    {
        return _allowAll ||
            _literals.Contains(group) ||
            _patterns.Any(pattern => pattern.Matches(group));
    }
}