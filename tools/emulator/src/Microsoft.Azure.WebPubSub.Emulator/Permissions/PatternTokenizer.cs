// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Diagnostics.CodeAnalysis;
using System.Text;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class PatternTokenizer
{
    public static PatternTokenString Tokenize(string pattern)
    {
        var tokens = new List<PatternToken>();
        for (int i = 0; i < pattern.Length;)
        {
            if (pattern[i] is '?')
            {
                tokens.Add(new PatternToken(PatternTokenType.QuestionMark));
                i += 1;
                continue;
            }
            if (pattern[i] is '\\')
            {
                if (i + 1 >= pattern.Length)
                {
                    throw new ArgumentException("Pattern ends with a single backslash escape.", nameof(pattern));
                }
                char next = pattern[i + 1];
                if (next is '*' or '\\' or '?')
                {
                    tokens.Add(new PatternToken(PatternTokenType.Literal, next));
                    i += 2;
                    continue;
                }
                else
                {
                    throw new ArgumentException($"Invalid escape sequence: \\{next}", nameof(pattern));
                }
            }
            if (pattern[i] is '*')
            {
                int start = i;
                while (i < pattern.Length && pattern[i] is '*')
                {
                    i++;
                }
                int count = i - start;
                if (count >= 2)
                {
                    tokens.Add(new PatternToken(PatternTokenType.DoubleAsterisk));
                }
                else
                {
                    tokens.Add(new PatternToken(PatternTokenType.Asterisk));
                }
            }
            else
            {
                tokens.Add(new PatternToken(PatternTokenType.Literal, pattern[i]));
                i += 1;
            }
        }
        return new([.. tokens]);
    }
}

internal readonly struct PatternTokenString(PatternToken[] tokens)
{
    private readonly PatternToken[] _tokens = tokens;

    public bool IsLiteral => Array.TrueForAll(_tokens, x => x.Type is PatternTokenType.Literal);

    public bool IsAll => _tokens.Length == 1 && _tokens[0].Type is PatternTokenType.DoubleAsterisk;

    public int GetComplexity() => _tokens.Count(x => x.Type is not PatternTokenType.Literal or PatternTokenType.QuestionMark);

    public bool GetLiteralValue([NotNullWhen(true)] out string? value)
    {
        if (IsLiteral)
        {
            var sb = new StringBuilder();
            foreach (var token in _tokens)
            {
                if (token.Type is PatternTokenType.Literal)
                {
                    sb.Append(token.Value!.Value);
                }
            }
            value = sb.ToString();
            return true;
        }
        value = null;
        return false;
    }

    public PatternMatcher CreateMatcher()
    {
        if (GetComplexity() > 5)
        {
            throw new NotSupportedException("Pattern contains too many wildcards to create a matcher. Consider simplifying the pattern.");
        }
        return new(this);
    }

    public PatternToken this[int index] => _tokens[index];

    public int Count => _tokens.Length;
}

internal enum PatternTokenType
{
    Literal,
    Asterisk,
    DoubleAsterisk,
    QuestionMark,
}

internal static class EscapableTokens
{
    public static readonly char[] All = ['*', '?', '\\'];
}

internal readonly struct PatternToken(PatternTokenType type, char? value = null)
{
    public PatternTokenType Type => type;
    public char? Value => value;
}