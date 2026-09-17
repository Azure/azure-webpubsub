// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class PatternMatcherTests
{
    [Theory]
    [InlineData("ab*", "ab", true)]
    [InlineData("ab*", "abcd", true)]
    [InlineData("ab*", "ab.cd", false)]
    [InlineData("ab*", "bcd", false)]
    [InlineData("*", "", true)]
    [InlineData("*", ".", false)]
    [InlineData("a*c", "a123c", true)]
    [InlineData("a*c", "a123cd", false)]
    [InlineData("a*c", "a1.3c", false)]
    [InlineData("ab**", "ab", true)]
    [InlineData("ab**", "ab.cd.ef", true)]
    [InlineData("**ab", "cd.ef.ab", true)]
    [InlineData("**ab", "cd.ef.abc", false)]
    [InlineData("**", "", true)]
    [InlineData("**", "....", true)]
    [InlineData("a?c", "abc", true)]
    [InlineData("a?c", "a.c", false)]
    [InlineData("a?c", "ac", false)]
    [InlineData("a?c", "abbc", false)]
    [InlineData("?", "", false)]
    [InlineData("a.**.b", "a..b", true)]
    [InlineData("a*.**.*b", "ab.cd.ef.ab", true)]
    [InlineData("a*.**.*b", "b.cd.ef.b", false)]
    [InlineData(@"a\*.***b", "a*.ab", true)]
    [InlineData(@"a\*.***b", "aa.ab", false)]
    [InlineData(@"a\\.***b", @"a\.ab", true)]
    [InlineData(@"a\\.***b", "aa.ab", false)]
    [InlineData(@"a\?*", "a?bc", true)]
    [InlineData(@"a\?*", "abc", false)]
    [InlineData("Room*", "Room1", true)]
    [InlineData("Room*", "room1", false)]
    [InlineData("Room**", "room.nested", false)]
    [InlineData("Ä?", "äb", false)]
    public void TestMatches(string pattern, string input, bool expected)
    {
        var matcher = PatternTokenizer.Tokenize(pattern).CreateMatcher();

        Assert.Equal(expected, matcher.Matches(input));
    }

    [Theory]
    [InlineData("room", "room")]
    [InlineData(@"room\*", "room*")]
    [InlineData(@"room\?", "room?")]
    [InlineData(@"room\\", @"room\")]
    public void TestEscapedTokensProduceLiteralValue(string pattern, string literal)
    {
        var tokens = PatternTokenizer.Tokenize(pattern);

        Assert.True(tokens.IsLiteral);
        Assert.False(tokens.IsAll);
        Assert.True(tokens.GetLiteralValue(out var value));
        Assert.Equal(literal, value);
        Assert.Equal(0, tokens.GetComplexity());
        var matcher = tokens.CreateMatcher();
        Assert.True(matcher.Matches(literal));
        Assert.False(matcher.Matches(literal + "extra"));
    }

    [Theory]
    [InlineData("**")]
    [InlineData("******")]
    public void TestConsecutiveAsterisksBecomeOneAllToken(string pattern)
    {
        var tokens = PatternTokenizer.Tokenize(pattern);

        Assert.Equal(1, tokens.Count);
        Assert.Equal(1, tokens.GetComplexity());
        Assert.True(tokens.IsAll);
        Assert.False(tokens.GetLiteralValue(out var literal));
        Assert.Null(literal);
        Assert.True(tokens.CreateMatcher().Matches("room.nested"));
    }

    [Theory]
    [InlineData(@"a\")]
    [InlineData(@"a\b")]
    public void TestInvalidEscapesAreRejected(string pattern)
    {
        Assert.Throws<ArgumentException>(() => PatternTokenizer.Tokenize(pattern));
    }
}