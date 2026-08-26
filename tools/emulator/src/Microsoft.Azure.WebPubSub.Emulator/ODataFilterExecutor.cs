// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections;
using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using Microsoft.OData;
using Microsoft.OData.UriParser;
using Microsoft.OData.UriParser.Aggregation;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal interface IODataFilterModel
{
    string ConnectionId { get; }

    string? UserId { get; }

    string[] Groups { get; }

    string? Protocol { get; }
}

internal sealed class ODataFilterExecutor
{
    private const int MaxDepth = 100;
    private readonly ConcurrentDictionary<string, QueryToken> _cache = [];

    public static ODataFilterExecutor Instance { get; } = new();

    public void Validate(string? filter)
    {
        if (string.IsNullOrEmpty(filter))
        {
            return;
        }

        try
        {
            FilterNodeVisitor.Validate(GetToken(filter));
        }
        catch (Exception exception) when (
            exception is InvalidFilterTokenException or
            FilterTokenNotSupportedException or
            ODataException)
        {
            throw new InvalidFilterException(filter, exception);
        }
    }

    public bool Matches(string? filter, IODataFilterModel model)
    {
        if (string.IsNullOrEmpty(filter))
        {
            return true;
        }

        try
        {
            return FilterNodeVisitor.Matches(GetToken(filter), model);
        }
        catch (Exception exception) when (
            exception is InvalidFilterTokenException or
            FilterTokenNotSupportedException or
            ODataException)
        {
            throw new InvalidFilterException(filter, exception);
        }
    }

    private QueryToken GetToken(string filter)
    {
        return _cache.GetOrAdd(
            filter,
            static value => new UriQueryExpressionParser(MaxDepth).ParseFilter(value));
    }

    private sealed class Node
    {
        public static Node Null { get; } = new(NodeValueType.Null, null);

        public NodeValueType NodeType { get; }

        public object? Value { get; }

        public Node(int value) : this(NodeValueType.Int, value)
        {
        }

        public Node(string? value) : this(NodeValueType.String, value)
        {
        }

        public Node(bool value) : this(NodeValueType.Bool, value)
        {
        }

        public Node(ICollection value) : this(NodeValueType.Collection, value)
        {
        }

        public Node(LiteralToken token)
        {
            NodeType = token.Value switch
            {
                null => NodeValueType.Null,
                bool => NodeValueType.Bool,
                int => NodeValueType.Int,
                string => NodeValueType.String,
                ICollection => NodeValueType.Collection,
                _ => throw new FilterTokenNotSupportedException(token),
            };
            Value = token.Value;
        }

        private Node(NodeValueType nodeType, object? value)
        {
            NodeType = nodeType;
            Value = value;
        }

        public bool IsNull() => NodeType == NodeValueType.Null;

        [MemberNotNullWhen(false, nameof(Value))]
        public bool IsNullOrStringNull() =>
            NodeType == NodeValueType.Null ||
            NodeType == NodeValueType.String && Value is null;

        [MemberNotNullWhen(true, nameof(Value))]
        public bool IsCollection() => NodeType == NodeValueType.Collection;

        public bool IsString() => NodeType == NodeValueType.String;

        [MemberNotNullWhen(true, nameof(Value))]
        public bool IsInt() => NodeType == NodeValueType.Int;

        [MemberNotNullWhen(true, nameof(Value))]
        public bool IsBoolean() => NodeType == NodeValueType.Bool;

        public int AsInt(QueryToken token)
        {
            if (!IsInt())
            {
                throw new InvalidFilterException(token, GetExpectedMessage(NodeType, NodeValueType.Int));
            }

            return (int)Value;
        }

        public bool AsBoolean(QueryToken token)
        {
            if (!IsBoolean())
            {
                throw new InvalidFilterException(token, GetExpectedMessage(NodeType, NodeValueType.Bool));
            }

            return (bool)Value;
        }

        public string? AsString(QueryToken token)
        {
            if (!IsString())
            {
                throw new InvalidFilterException(token, GetExpectedMessage(NodeType, NodeValueType.String));
            }

            return (string?)Value;
        }

        public ICollection AsCollection(QueryToken token)
        {
            if (!IsCollection())
            {
                throw new InvalidFilterException(token, GetExpectedMessage(NodeType, NodeValueType.Collection));
            }

            return (ICollection)Value;
        }

        private static string GetExpectedMessage(NodeValueType actual, NodeValueType expected) =>
            $"Type '{ToText(actual)}', expect '{ToText(expected)}'.";

        private static string ToText(NodeValueType type) => type switch
        {
            NodeValueType.Null => "null",
            NodeValueType.Bool => "bool",
            NodeValueType.String => "string",
            NodeValueType.Int => "int",
            NodeValueType.Collection => "collection",
            _ => throw new NotSupportedException(type.ToString()),
        };

        public enum NodeValueType
        {
            Null,
            Bool,
            String,
            Int,
            Collection,
        }
    }

    private sealed class FilterNodeVisitor(IODataFilterModel model) : ISyntacticTreeVisitor<Node>
    {
        private readonly UriQueryExpressionParser _parser = new(MaxDepth);
        private readonly bool _isValidation = ReferenceEquals(model, ValidationModel.Instance);

        public static bool Matches(QueryToken token, IODataFilterModel model) =>
            token.Accept(new FilterNodeVisitor(model)).AsBoolean(token);

        public static void Validate(QueryToken token) =>
            token.Accept(new FilterNodeVisitor(ValidationModel.Instance)).AsBoolean(token);

        public Node Visit(BinaryOperatorToken token)
        {
            try
            {
                var left = Parse(token.Left);
                var right = Parse(token.Right);
                return token.OperatorKind switch
                {
                    BinaryOperatorKind.Or => new(left.AsBoolean(token) || right.AsBoolean(token)),
                    BinaryOperatorKind.And => new(left.AsBoolean(token) && right.AsBoolean(token)),
                    BinaryOperatorKind.Equal => new(Equals(left.Value, right.Value)),
                    BinaryOperatorKind.NotEqual => new(!Equals(left.Value, right.Value)),
                    BinaryOperatorKind.GreaterThan => Compare(left, right, token, value => value > 0),
                    BinaryOperatorKind.GreaterThanOrEqual => Compare(left, right, token, value => value >= 0),
                    BinaryOperatorKind.LessThan => Compare(left, right, token, value => value < 0),
                    BinaryOperatorKind.LessThanOrEqual => Compare(left, right, token, value => value <= 0),
                    _ => throw new FilterTokenNotSupportedException(token),
                };
            }
            catch (Exception exception) when (
                exception is InvalidFilterTokenException or FilterTokenNotSupportedException)
            {
                throw new InvalidFilterException(token, exception);
            }
        }

        public Node Visit(UnaryOperatorToken token) => token.OperatorKind switch
        {
            UnaryOperatorKind.Not => new(!Parse(token.Operand).AsBoolean(token)),
            _ => throw new FilterTokenNotSupportedException(token),
        };

        public Node Visit(InToken token)
        {
            try
            {
                var left = Parse(token.Left).Value;
                var right = Parse(token.Right);
                IEnumerable collection = right.IsCollection()
                    ? right.AsCollection(token)
                    : ParseInCollection(right.AsString(token)!);
                return new(Contains(collection, left));
            }
            catch (Exception exception) when (
                exception is InvalidFilterTokenException or FilterTokenNotSupportedException)
            {
                throw new InvalidFilterException(token, exception);
            }
        }

        public Node Visit(FunctionCallToken token)
        {
            try
            {
                var arguments = token.Arguments.Select(argument => argument.ValueToken).ToArray();
                return token.Name switch
                {
                    "length" when arguments.Length == 1 => Length(Parse(arguments[0]), token),
                    "tolower" when arguments.Length == 1 => Transform(Parse(arguments[0]), token, value => value.ToLowerInvariant()),
                    "toupper" when arguments.Length == 1 => Transform(Parse(arguments[0]), token, value => value.ToUpperInvariant()),
                    "trim" when arguments.Length == 1 => Transform(Parse(arguments[0]), token, value => value.Trim()),
                    "contains" when arguments.Length == 2 => StringPredicate(arguments, token, (value, argument) => value.Contains(argument)),
                    "startswith" when arguments.Length == 2 => StringPredicate(arguments, token, (value, argument) => value.StartsWith(argument)),
                    "endswith" when arguments.Length == 2 => StringPredicate(arguments, token, (value, argument) => value.EndsWith(argument)),
                    "indexof" when arguments.Length == 2 => IndexOf(arguments, token),
                    "concat" when arguments.Length == 2 => Concat(arguments, token),
                    "substring" when arguments.Length == 2 => Substring(arguments, token),
                    "substring" when arguments.Length == 3 => Substring(arguments, token),
                    "length" or "tolower" or "toupper" or "trim" or
                    "contains" or "startswith" or "endswith" or "indexof" or
                    "concat" or "substring" => throw new InvalidFilterTokenException(token),
                    _ => throw new FilterTokenNotSupportedException(token),
                };
            }
            catch (Exception exception) when (
                exception is InvalidFilterTokenException or FilterTokenNotSupportedException)
            {
                throw new InvalidFilterException(token, exception);
            }
        }

        public Node Visit(LiteralToken token) => new(token);

        public Node Visit(EndPathToken token)
        {
            if (token.Identifier.Equals(nameof(IODataFilterModel.UserId), StringComparison.OrdinalIgnoreCase))
            {
                return new(model.UserId);
            }
            if (token.Identifier.Equals(nameof(IODataFilterModel.ConnectionId), StringComparison.OrdinalIgnoreCase))
            {
                return new(model.ConnectionId);
            }
            if (token.Identifier.Equals(nameof(IODataFilterModel.Groups), StringComparison.OrdinalIgnoreCase))
            {
                return new(model.Groups);
            }
            if (token.Identifier.Equals(nameof(IODataFilterModel.Protocol), StringComparison.OrdinalIgnoreCase))
            {
                return new(model.Protocol);
            }

            throw new FilterTokenNotSupportedException(token);
        }

        public Node Visit(AllToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(AnyToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(LambdaToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(InnerPathToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(OrderByToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(CustomQueryOptionToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(RangeVariableToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(DottedIdentifierToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(CountSegmentToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(ExpandToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(ExpandTermToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(SelectToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(SelectTermToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(StarToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(FunctionParameterToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(AggregateToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(AggregateExpressionToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(EntitySetAggregateToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(GroupByToken token) => throw new FilterTokenNotSupportedException(token);
        public Node Visit(RootPathToken token) => throw new FilterTokenNotSupportedException(token);

        private Node Parse(QueryToken token) => token.Accept(this);

        private static Node Compare(Node left, Node right, QueryToken token, Func<int, bool> predicate)
        {
            if (left.IsNull() || right.IsNull())
            {
                return new(false);
            }

            return new(predicate(left.AsInt(token).CompareTo(right.AsInt(token))));
        }

        private static Node Length(Node value, QueryToken token)
        {
            if (value.IsNullOrStringNull())
            {
                return Node.Null;
            }
            if (value.IsString())
            {
                return new(value.AsString(token)!.Length);
            }
            if (value.IsCollection())
            {
                return new(value.AsCollection(token).Count);
            }

            throw new InvalidFilterTokenException(token);
        }

        private static Node Transform(Node value, QueryToken token, Func<string, string> transform)
        {
            return value.IsNullOrStringNull()
                ? Node.Null
                : new(transform(value.AsString(token)!));
        }

        private Node StringPredicate(
            QueryToken[] arguments,
            QueryToken token,
            Func<string, string, bool> predicate)
        {
            var value = Parse(arguments[0]);
            var argument = Parse(arguments[1]);
            return value.IsNullOrStringNull() || argument.IsNullOrStringNull()
                ? new(false)
                : new(predicate(value.AsString(token)!, argument.AsString(token)!));
        }

        private Node IndexOf(QueryToken[] arguments, QueryToken token)
        {
            var value = Parse(arguments[0]);
            var argument = Parse(arguments[1]);
            return value.IsNullOrStringNull() || argument.IsNullOrStringNull()
                ? new(-1)
                : new(value.AsString(token)!.IndexOf(argument.AsString(token)!));
        }

        private Node Concat(QueryToken[] arguments, QueryToken token)
        {
            var left = Parse(arguments[0]);
            var right = Parse(arguments[1]);
            if (left.IsNullOrStringNull() && right.IsNullOrStringNull())
            {
                return Node.Null;
            }
            if (left.IsNullOrStringNull() && right.IsString())
            {
                return right;
            }
            if (right.IsNullOrStringNull() && left.IsString())
            {
                return left;
            }

            return new(string.Concat(left.AsString(token), right.AsString(token)));
        }

        private Node Substring(QueryToken[] arguments, QueryToken token)
        {
            var value = Parse(arguments[0]);
            var start = Parse(arguments[1]).AsInt(token);
            var length = arguments.Length == 3
                ? Parse(arguments[2]).AsInt(token)
                : (int?)null;
            if (value.IsNullOrStringNull())
            {
                return Node.Null;
            }

            var text = value.AsString(token)!;
            if (_isValidation)
            {
                return new(string.Empty);
            }
            if (start < 0 || start > text.Length ||
                length < 0 || length > text.Length - start)
            {
                return Node.Null;
            }

            return length is null
                ? new(text.Substring(start))
                : new(text.Substring(start, length.Value));
        }

        private IEnumerable<object?> ParseInCollection(string literal)
        {
            if (literal.Length < 2 || literal[0] != '(' || literal[^1] != ')')
            {
                throw new InvalidFilterTokenException(literal);
            }

            foreach (var item in SplitCollectionItems(literal))
            {
                yield return Parse(_parser.ParseFilter(item)).Value;
            }
        }

        private static IEnumerable<string> SplitCollectionItems(string literal)
        {
            var start = 1;
            var quoted = false;
            for (var index = 1; index < literal.Length - 1; index++)
            {
                if (literal[index] == '\'')
                {
                    if (quoted && index + 1 < literal.Length - 1 && literal[index + 1] == '\'')
                    {
                        index++;
                    }
                    else
                    {
                        quoted = !quoted;
                    }
                }
                else if (literal[index] == ',' && !quoted)
                {
                    var item = literal[start..index].Trim();
                    if (item.Length > 0)
                    {
                        yield return item;
                    }
                    start = index + 1;
                }
            }

            if (quoted)
            {
                throw new InvalidFilterTokenException(literal);
            }

            var last = literal[start..^1].Trim();
            if (last.Length > 0)
            {
                yield return last;
            }
        }

        private static bool Contains(IEnumerable collection, object? value)
        {
            foreach (var item in collection)
            {
                if (Equals(item, value))
                {
                    return true;
                }
            }

            return false;
        }

        private sealed class ValidationModel : IODataFilterModel
        {
            public static ValidationModel Instance { get; } = new();

            public string ConnectionId => string.Empty;
            public string? UserId => null;
            public string[] Groups => [];
            public string? Protocol => null;
        }
    }
}

internal sealed class InvalidFilterException : ArgumentException
{
    public InvalidFilterException(string filter, Exception innerException)
        : base($"Invalid syntax for '{filter}': {innerException.Message}", "filter", innerException)
    {
    }

    public InvalidFilterException(QueryToken token, string detail)
        : base($"Invalid syntax for '{FilterTokenPrinter.Print(token)}': {detail}", "filter")
    {
    }

    public InvalidFilterException(QueryToken token, Exception innerException)
        : base(
            $"Invalid syntax for '{FilterTokenPrinter.Print(token)}': {innerException.Message}",
            "filter",
            innerException)
    {
    }
}

internal sealed class InvalidFilterTokenException : Exception
{
    public InvalidFilterTokenException(string token) : base($"Invalid token '{token}'.")
    {
    }

    public InvalidFilterTokenException(QueryToken token)
        : this(FilterTokenPrinter.Print(token))
    {
    }
}

internal sealed class FilterTokenNotSupportedException : Exception
{
    [ThreadStatic]
    private static bool _isPrinting;

    public FilterTokenNotSupportedException(QueryToken token)
        : base(GetErrorMessage(token))
    {
    }

    private static string GetErrorMessage(QueryToken token)
    {
        if (!_isPrinting)
        {
            _isPrinting = true;
            try
            {
                return $"Token '{FilterTokenPrinter.Print(token)}' is not supported.";
            }
            catch
            {
                // Fall back to the OData token kind when the printer cannot describe it.
            }
            finally
            {
                _isPrinting = false;
            }
        }

        return $"Token '{token.Kind}' is not supported.";
    }
}

internal sealed class FilterTokenPrinter : ISyntacticTreeVisitor<string>
{
    public static string Print(QueryToken token) => token.Accept(new FilterTokenPrinter());

    public string Visit(BinaryOperatorToken token) => token.OperatorKind switch
    {
        BinaryOperatorKind.Or => $"{Wrap(token.Left)} or {Wrap(token.Right)}",
        BinaryOperatorKind.And => $"{Wrap(token.Left)} and {Wrap(token.Right)}",
        BinaryOperatorKind.Equal => $"{Wrap(token.Left)} eq {Wrap(token.Right)}",
        BinaryOperatorKind.NotEqual => $"{Wrap(token.Left)} ne {Wrap(token.Right)}",
        BinaryOperatorKind.GreaterThan => $"{Wrap(token.Left)} gt {Wrap(token.Right)}",
        BinaryOperatorKind.GreaterThanOrEqual => $"{Wrap(token.Left)} ge {Wrap(token.Right)}",
        BinaryOperatorKind.LessThan => $"{Wrap(token.Left)} lt {Wrap(token.Right)}",
        BinaryOperatorKind.LessThanOrEqual => $"{Wrap(token.Left)} le {Wrap(token.Right)}",
        _ => throw new FilterTokenNotSupportedException(token),
    };

    public string Visit(UnaryOperatorToken token) =>
        token.OperatorKind == UnaryOperatorKind.Not
            ? $"not {Wrap(token.Operand)}"
            : throw new FilterTokenNotSupportedException(token);

    public string Visit(InToken token) => $"{Print(token.Left)} in {Print(token.Right)}";

    public string Visit(FunctionCallToken token) =>
        $"{token.Name}({string.Join(',', token.Arguments.Select(argument => Print(argument.ValueToken)))})";

    public string Visit(LiteralToken token)
    {
        if (token.Value is null)
        {
            return "null";
        }
        if (token.Value is string value)
        {
            return value.Length > 2 && value[0] == '(' && value[^1] == ')'
                ? value
                : $"'{value}'";
        }
        return token.Value.ToString()!;
    }

    public string Visit(EndPathToken token) => token.Identifier;
    public string Visit(AllToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(AnyToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(LambdaToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(InnerPathToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(OrderByToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(CustomQueryOptionToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(RangeVariableToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(DottedIdentifierToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(CountSegmentToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(ExpandToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(ExpandTermToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(SelectToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(SelectTermToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(StarToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(FunctionParameterToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(AggregateToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(AggregateExpressionToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(EntitySetAggregateToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(GroupByToken token) => throw new FilterTokenNotSupportedException(token);
    public string Visit(RootPathToken token) => throw new FilterTokenNotSupportedException(token);

    private static string Wrap(QueryToken token) =>
        token.Kind is QueryTokenKind.BinaryOperator or QueryTokenKind.UnaryOperator or QueryTokenKind.In
            ? $"({Print(token)})"
            : Print(token);
}