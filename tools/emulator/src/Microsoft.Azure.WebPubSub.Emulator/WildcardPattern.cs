// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class WildcardPattern
{
    private const int MaxLength = 1024;
    private readonly PatternToken[] _tokens;

    private WildcardPattern(PatternToken[] tokens)
    {
        _tokens = tokens;
    }

    public static bool TryCreate(
        string pattern,
        out WildcardPattern? result,
        int? maximumAsteriskCount = null)
    {
        result = null;
        if (string.IsNullOrEmpty(pattern) || pattern.Length > MaxLength)
        {
            return false;
        }

        var tokens = new List<PatternToken>();
        var complexity = 0;
        for (var index = 0; index < pattern.Length;)
        {
            switch (pattern[index])
            {
                case '?':
                    tokens.Add(new(PatternTokenType.QuestionMark));
                    index++;
                    break;
                case '\\':
                    if (index + 1 >= pattern.Length ||
                        pattern[index + 1] is not ('*' or '?' or '\\'))
                    {
                        return false;
                    }
                    tokens.Add(new(PatternTokenType.Literal, pattern[index + 1]));
                    index += 2;
                    break;
                case '*':
                    var start = index;
                    while (index < pattern.Length && pattern[index] == '*')
                    {
                        index++;
                    }
                    complexity++;
                    if (complexity > maximumAsteriskCount)
                    {
                        return false;
                    }
                    tokens.Add(new(
                        index - start >= 2
                            ? PatternTokenType.DoubleAsterisk
                            : PatternTokenType.Asterisk));
                    break;
                default:
                    tokens.Add(new(PatternTokenType.Literal, pattern[index]));
                    index++;
                    break;
            }
        }

        result = new([.. tokens]);
        return true;
    }

    public bool Matches(string input, bool ignoreCase = false)
    {
        var matches = new bool[_tokens.Length + 1, input.Length + 1];
        matches[0, 0] = true;

        for (var patternIndex = 0; patternIndex < _tokens.Length; patternIndex++)
        {
            for (var inputIndex = 0; inputIndex <= input.Length; inputIndex++)
            {
                if (!matches[patternIndex, inputIndex])
                {
                    continue;
                }

                var token = _tokens[patternIndex];
                if (token.Type is PatternTokenType.Asterisk or PatternTokenType.DoubleAsterisk)
                {
                    matches[patternIndex + 1, inputIndex] = true;
                    if (inputIndex < input.Length &&
                        (token.Type == PatternTokenType.DoubleAsterisk || input[inputIndex] != '.'))
                    {
                        matches[patternIndex, inputIndex + 1] = true;
                    }
                }
                else if (inputIndex < input.Length &&
                    (token.Type == PatternTokenType.QuestionMark && input[inputIndex] != '.' ||
                        token.Type == PatternTokenType.Literal && CharactersEqual(
                            token.Value,
                            input[inputIndex],
                            ignoreCase)))
                {
                    matches[patternIndex + 1, inputIndex + 1] = true;
                }
            }
        }

        return matches[_tokens.Length, input.Length];
    }

    private static bool CharactersEqual(char left, char right, bool ignoreCase)
    {
        return left == right || ignoreCase &&
            char.ToUpperInvariant(left) == char.ToUpperInvariant(right);
    }

    private enum PatternTokenType
    {
        Literal,
        QuestionMark,
        Asterisk,
        DoubleAsterisk,
    }

    private readonly record struct PatternToken(PatternTokenType Type, char Value = default);
}