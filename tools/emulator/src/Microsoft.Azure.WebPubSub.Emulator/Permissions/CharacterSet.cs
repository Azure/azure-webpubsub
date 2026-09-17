// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal readonly struct CharacterSet(bool defaultAllow, IEnumerable<char> excepts) : IEquatable<CharacterSet>
{
    public static readonly CharacterSet All = new(true, []);
    public static readonly CharacterSet ExceptDot = new(true, ['.']);

    public bool DefaultAllow { get; } = defaultAllow;

    public HashSet<char> Excepts { get; } = [.. excepts];

    public bool Contains(char c) =>
        DefaultAllow ^ Excepts.Contains(c);

    public bool Equals(CharacterSet other) =>
        DefaultAllow == other.DefaultAllow &&
        Excepts.SetEquals(other.Excepts);

    public override bool Equals(object? obj) =>
        obj is CharacterSet other &&
        Equals(other);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.Add(DefaultAllow);

        foreach (var c in Excepts.OrderBy(c => c))
        {
            hash.Add(c);
        }

        return hash.ToHashCode();
    }
}