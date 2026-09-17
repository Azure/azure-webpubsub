// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Immutable;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class GroupPermissionManager
{
    private readonly object _lock = new();
    private PermissionSet _permissions = new(0, PermissionRuleSet.DenyAll, ImmutableDictionary<string, PermissionType>.Empty);

    public ulong Revision => Volatile.Read(ref _permissions).Revision;

    public GroupPermissionManager() { }

    public bool Check(string group)
    {
        ArgumentException.ThrowIfNullOrEmpty(group);
        return Volatile.Read(ref _permissions).Check(group) == PermissionType.Allowed;
    }

    public PermissionUpdateErrorCode Grant(string group)
    {
        ArgumentException.ThrowIfNullOrEmpty(group);
        lock (_lock)
        {
            var updated = _permissions.AddLiteral(PermissionType.Allowed, group);
            if (updated.Literals.Count <= Constants.Permission.MaxLiteralCount)
            {
                _permissions = updated;
                return PermissionUpdateErrorCode.None;
            }
            return PermissionUpdateErrorCode.ExceededMaxPermissions;
        }
    }

    public PermissionUpdateErrorCode GrantPattern(string pattern)
    {
        ArgumentException.ThrowIfNullOrEmpty(pattern);
        lock (_lock)
        {
            var updated = _permissions.AddPattern(PermissionType.Allowed, pattern);
            // The updated.RuleSet.Rules doesn't include the default rule, so we use Count < MaxPatternCount
            // Check only the pattern count here, even when AddPattern produces a literal.
            if (updated.RuleSet.Rules.Count < Constants.Permission.MaxPatternCount)
            {
                _permissions = updated;
                return PermissionUpdateErrorCode.None;
            }
            return PermissionUpdateErrorCode.ExceededMaxPermissions;
        }
    }

    public void GrantAll()
    {
        lock (_lock)
        {
            _permissions = _permissions.SetAll(PermissionType.Allowed);
        }
    }

    public PermissionUpdateErrorCode Revoke(string group)
    {
        ArgumentException.ThrowIfNullOrEmpty(group);
        lock (_lock)
        {
            var updated = _permissions.AddLiteral(PermissionType.Denied, group);
            if (updated.Literals.Count <= Constants.Permission.MaxLiteralCount)
            {
                _permissions = updated;
                return PermissionUpdateErrorCode.None;
            }
            return PermissionUpdateErrorCode.ExceededMaxPermissions;
        }
    }

    private sealed class PermissionSet(ulong revision, PermissionRuleSet ruleSet, ImmutableDictionary<string, PermissionType> literals)
    {
        public ulong Revision { get; } = revision;
        public ImmutableDictionary<string, PermissionType> Literals => literals;
        public PermissionRuleSet RuleSet => ruleSet;

        public PermissionType Check(string group)
        {
            if (Literals.TryGetValue(group, out var permission))
            {
                return permission;
            }
            return ruleSet.Check(group);
        }

        public PermissionSet AddLiteral(PermissionType permission, string literal)
        {
            if (Literals.TryGetValue(literal, out var s))
            {
                // If the literal already exists, check if it matches the permission
                if (s == permission)
                {
                    // No change needed
                    return this;
                }
                // If the literal exists but with a different permission, just remove it
                return new PermissionSet(Revision + 1, RuleSet, Literals.Remove(literal));
            }
            if (RuleSet.Check(literal) == permission)
            {
                // If the literal matches an existing pattern, no change needed
                return this;
            }
            return new PermissionSet(Revision + 1, RuleSet, Literals.Add(literal, permission));
        }

        public PermissionSet AddPattern(PermissionType permission, string pattern)
        {
            var tokens = PatternTokenizer.Tokenize(pattern);
            if (tokens.GetLiteralValue(out var literal))
            {
                return AddLiteral(permission, literal);
            }
            if (tokens.IsAll)
            {
                return SetAll(permission);
            }

            var matcher = tokens.CreateMatcher();
            var newRuleSet = RuleSet.AddPattern(permission, matcher);

            // Apply the new matcher to all literal groups
            var updatedLiterals = RemoveMatchingLiterals(matcher, Literals);
            return new PermissionSet(Revision + 1, newRuleSet, updatedLiterals);

            static ImmutableDictionary<string, PermissionType> RemoveMatchingLiterals(PatternMatcher matcher, ImmutableDictionary<string, PermissionType> literals)
            {
                ImmutableDictionary<string, PermissionType>.Builder? builder = null;
                foreach (var key in literals.Keys)
                {
                    if (matcher.Matches(key))
                    {
                        builder ??= literals.ToBuilder();
                        builder.Remove(key);
                    }
                }
                return builder?.ToImmutable() ?? literals;
            }
        }

        public PermissionSet SetAll(PermissionType permission) =>
            permission switch
            {
                PermissionType.Allowed => new(Revision + 1, PermissionRuleSet.AllowAll, ImmutableDictionary<string, PermissionType>.Empty),
                PermissionType.Denied => new(Revision + 1, PermissionRuleSet.DenyAll, ImmutableDictionary<string, PermissionType>.Empty),
                _ => throw new ArgumentOutOfRangeException(nameof(permission), permission, null)
            };
    }

    private sealed class PermissionRuleSet(PermissionType defaultPermission, ImmutableList<(PermissionType, PatternMatcher)> rules)
    {
        public static readonly PermissionRuleSet DenyAll =
            new(PermissionType.Denied, []);
        public static readonly PermissionRuleSet AllowAll =
            new(PermissionType.Allowed, []);

        private readonly Dictionary<string, PermissionType> _cache = [];

        public ImmutableList<(PermissionType Type, PatternMatcher Matcher)> Rules { get; } = rules;

        public PermissionType Default => defaultPermission;

        public PermissionType Check(string group)
        {
            if (this == DenyAll)
            {
                return PermissionType.Denied;
            }
            if (this == AllowAll)
            {
                return PermissionType.Allowed;
            }
            lock (_cache)
            {
                if (_cache.TryGetValue(group, out var cachedResult))
                {
                    return cachedResult;
                }
            }
            var result = CheckWithoutCache(group);
            lock (_cache)
            {
                if (_cache.Count >= Constants.Permission.MaxLiteralCount)
                {
                    // If cache is full, clear it to avoid memory issues
                    _cache.Clear();
                }
                _cache[group] = result;
            }
            return result;

            PermissionType CheckWithoutCache(string group)
            {
                foreach (var (type, matcher) in Rules)
                {
                    if (matcher.Matches(group))
                    {
                        return type;
                    }
                }
                return Default;
            }
        }

        public PermissionRuleSet AddPattern(PermissionType permission, PatternMatcher matcher)
        {
            var patterns = Rules.ToBuilder();

            // Prepend the new matcher
            patterns.Insert(0, (permission, matcher));
            return new PermissionRuleSet(defaultPermission, patterns.ToImmutable());
        }
    }
}

internal enum PermissionType
{
    Allowed,
    Denied,
}

internal enum PermissionUpdateErrorCode
{
    None,
    RevisionMismatch,
    ExceededMaxPermissions,
    UnsupportedAction,
}