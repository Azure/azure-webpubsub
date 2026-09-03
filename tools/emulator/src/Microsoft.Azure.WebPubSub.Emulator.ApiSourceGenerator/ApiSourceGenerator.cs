// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;

namespace Microsoft.Azure.WebPubSub.Emulator.ApiSourceGenerator;

[Generator(LanguageNames.CSharp)]
public sealed class ApiSourceGenerator : IIncrementalGenerator
{
    private const string ApiAttributeName =
        "Microsoft.Azure.WebPubSub.Emulator.WebPubSubApiAttribute";
    private const string OperationAttributeName =
        "Microsoft.Azure.WebPubSub.Emulator.WebPubSubApiOperationAttribute";
    private static readonly HashSet<string> CSharpKeywords = new(StringComparer.Ordinal)
    {
        "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char",
        "checked", "class", "const", "continue", "decimal", "default", "delegate", "do",
        "double", "else", "enum", "event", "explicit", "extern", "false", "finally",
        "fixed", "float", "for", "foreach", "goto", "if", "implicit", "in", "int",
        "interface", "internal", "is", "lock", "long", "namespace", "new", "null",
        "object", "operator", "out", "override", "params", "private", "protected",
        "public", "readonly", "ref", "return", "sbyte", "sealed", "short", "sizeof",
        "stackalloc", "static", "string", "struct", "switch", "this", "throw", "true",
        "try", "typeof", "uint", "ulong", "unchecked", "unsafe", "ushort", "using",
        "virtual", "void", "volatile", "while",
    };
    private static readonly DiagnosticDescriptor InvalidDefinition = new(
        "AWPS001",
        "Invalid Web PubSub API definition",
        "{0}",
        "SourceGeneration",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        var definitions = context.SyntaxProvider.ForAttributeWithMetadataName(
            ApiAttributeName,
            static (node, _) => node is ClassDeclarationSyntax,
            static (attributeContext, cancellationToken) => Transform(attributeContext, cancellationToken));

        context.RegisterSourceOutput(definitions, static (context, definition) => Emit(context, definition));
    }

    private static ApiDefinition Transform(
        GeneratorAttributeSyntaxContext context,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (context.TargetSymbol is not INamedTypeSymbol type ||
            context.TargetNode is not ClassDeclarationSyntax declaration)
        {
            return ApiDefinition.Empty;
        }

        var location = LocationInfo.From(declaration.Identifier);
        var diagnostics = new List<DiagnosticInfo>();
        var attributes = type.GetAttributes();
        var api = attributes.SingleOrDefault(attribute =>
            attribute.AttributeClass?.ToDisplayString() == ApiAttributeName);
        if (api is null)
        {
            return ApiDefinition.Empty;
        }

        if (!TryGetString(api, 0, out var apiVersion))
        {
            diagnostics.Add(new DiagnosticInfo(location, "The WebPubSubApi attribute requires an API version."));
            return ApiDefinition.Invalid(diagnostics);
        }

        var operations = new List<ApiOperation>();
        var valid = true;
        foreach (var attribute in attributes
            .Where(attribute => attribute.AttributeClass?.ToDisplayString() == OperationAttributeName)
            .OrderBy(attribute => attribute.ApplicationSyntaxReference?.Span.Start))
        {
            cancellationToken.ThrowIfCancellationRequested();

            ApiOperation? operation = null;
            string? error = null;
            if (!TryGetString(attribute, 0, out var method) ||
                !TryGetString(attribute, 1, out var path) ||
                !TryGetString(attribute, 2, out var operationId) ||
                !TryCreateOperation(method, path, operationId, out operation, out error))
            {
                diagnostics.Add(new DiagnosticInfo(
                    location,
                    error ?? "A WebPubSubApiOperation attribute is invalid."));
                valid = false;
                continue;
            }

            operations.Add(operation!);
        }

        if (!valid || operations.Count == 0 || !ValidateOperations(diagnostics, location, operations))
        {
            return ApiDefinition.Invalid(diagnostics);
        }

        return new ApiDefinition(
            type.Name,
            type.ContainingNamespace.ToDisplayString(),
            apiVersion,
            new EquatableArray<ApiOperation>(operations.ToArray()),
            new EquatableArray<DiagnosticInfo>(diagnostics.ToArray()));
    }

    private static void Emit(SourceProductionContext context, ApiDefinition definition)
    {
        foreach (var diagnostic in definition.Diagnostics)
        {
            context.ReportDiagnostic(Diagnostic.Create(
                InvalidDefinition,
                diagnostic.Location?.ToLocation(),
                diagnostic.Message));
        }

        if (!definition.HasSource)
        {
            return;
        }

        context.AddSource(
            $"{definition.TypeName}.g.cs",
            SourceText.From(Generate(definition), Encoding.UTF8));
    }

    private static bool ValidateOperations(
        List<DiagnosticInfo> diagnostics,
        LocationInfo? location,
        IReadOnlyCollection<ApiOperation> operations)
    {
        var valid = true;
        foreach (var duplicate in operations.GroupBy(operation => operation.ActionName)
            .Where(group => group.Count() > 1))
        {
            diagnostics.Add(new DiagnosticInfo(location, $"Action name '{duplicate.Key}' is duplicated."));
            valid = false;
        }
        foreach (var duplicate in operations.GroupBy(operation => (operation.Method, operation.Path))
            .Where(group => group.Count() > 1))
        {
            diagnostics.Add(new DiagnosticInfo(
                location,
                $"Route '{duplicate.Key.Method} {duplicate.Key.Path}' is duplicated."));
            valid = false;
        }

        return valid;
    }

    private static bool TryCreateOperation(
        string method,
        string path,
        string operationId,
        out ApiOperation? operation,
        out string? error)
    {
        var attributeName = method.ToUpperInvariant() switch
        {
            "DELETE" => "HttpDelete",
            "GET" => "HttpGet",
            "HEAD" => "HttpHead",
            "OPTIONS" => "HttpOptions",
            "PATCH" => "HttpPatch",
            "POST" => "HttpPost",
            "PUT" => "HttpPut",
            _ => null,
        };
        if (attributeName is null)
        {
            operation = null;
            error = $"HTTP method '{method}' is not supported.";
            return false;
        }
        if (string.IsNullOrWhiteSpace(path) || !path.StartsWith("/", StringComparison.Ordinal))
        {
            operation = null;
            error = $"Route '{path}' must start with '/'.";
            return false;
        }

        var separator = operationId.IndexOf('_');
        var actionName = separator < 0 ? operationId : operationId.Substring(separator + 1);
        if (string.IsNullOrWhiteSpace(actionName))
        {
            operation = null;
            error = $"Operation ID '{operationId}' does not produce an action name.";
            return false;
        }

        var parameters = Regex.Matches(path, "\\{([^}]+)\\}")
            .Cast<Match>()
            .Select(match => GetParameterName(match.Groups[1].Value))
            .ToArray();
        operation = new(
            attributeName,
            method.ToUpperInvariant(),
            path,
            operationId,
            actionName,
            new EquatableArray<string>(parameters));
        error = null;
        return true;
    }

    private static string Generate(ApiDefinition definition)
    {
        var builder = new StringBuilder();
        builder.AppendLine("// <auto-generated />");
        builder.AppendLine();
        builder.AppendLine("using Microsoft.AspNetCore.Mvc;");
        builder.AppendLine("using Microsoft.AspNetCore.Mvc.Filters;");
        builder.AppendLine();
        builder.Append("namespace ").Append(definition.Namespace).AppendLine(";");
        builder.AppendLine();
        builder.AppendLine("[ApiController]");
        builder.Append("internal abstract partial class ").Append(definition.TypeName)
            .AppendLine(" : ControllerBase, IAsyncActionFilter");
        builder.AppendLine("{");
        builder.Append("    public const string ApiVersion = \"").Append(Escape(definition.ApiVersion!)).AppendLine("\";");

        foreach (var operation in definition.Operations)
        {
            builder.AppendLine();
            builder.Append("    [").Append(operation.AttributeName).Append("(\"")
                .Append(Escape(operation.Path)).Append("\", Name = \"")
                .Append(Escape(operation.OperationId)).AppendLine("\")]");
            builder.Append("    public virtual Task<IActionResult> ").Append(operation.ActionName).AppendLine("(");
            foreach (var parameter in operation.Parameters)
            {
                builder.Append("        string ").Append(parameter).AppendLine(",");
            }
            builder.AppendLine("        CancellationToken cancellationToken = default)");
            builder.AppendLine("    {");
            builder.Append("        return NotImplementedAsync(\"").Append(Escape(operation.OperationId)).AppendLine("\");");
            builder.AppendLine("    }");
        }

        builder.AppendLine("}");
        return builder.ToString();
    }

    private static bool TryGetString(AttributeData attribute, int index, out string value)
    {
        value = string.Empty;
        if (attribute.ConstructorArguments.Length <= index ||
            attribute.ConstructorArguments[index].Value is not string text ||
            string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        value = text;
        return true;
    }

    private static string GetParameterName(string value)
    {
        var identifier = Regex.Replace(value, "[^a-zA-Z0-9_]", "_");
        if (identifier.Length == 0 || char.IsDigit(identifier[0]))
        {
            identifier = $"_{identifier}";
        }
        return CSharpKeywords.Contains(identifier) ? $"@{identifier}" : identifier;
    }

    private static string Escape(string value) =>
        value.Replace("\\", "\\\\").Replace("\"", "\\\"");

    /// <summary>
    /// The model that flows through the incremental pipeline. It carries only
    /// value-equatable data so successive runs can be compared without rooting a
    /// compilation.
    /// </summary>
    private sealed class ApiDefinition : IEquatable<ApiDefinition>
    {
        public static readonly ApiDefinition Empty = new(null, null, null, default, default);

        public ApiDefinition(
            string? typeName,
            string? containingNamespace,
            string? apiVersion,
            EquatableArray<ApiOperation> operations,
            EquatableArray<DiagnosticInfo> diagnostics)
        {
            TypeName = typeName;
            Namespace = containingNamespace;
            ApiVersion = apiVersion;
            Operations = operations;
            Diagnostics = diagnostics;
        }

        public static ApiDefinition Invalid(List<DiagnosticInfo> diagnostics) =>
            new(null, null, null, default, new EquatableArray<DiagnosticInfo>(diagnostics.ToArray()));

        public string? TypeName { get; }

        public string? Namespace { get; }

        public string? ApiVersion { get; }

        public EquatableArray<ApiOperation> Operations { get; }

        public EquatableArray<DiagnosticInfo> Diagnostics { get; }

        public bool HasSource => TypeName is not null && ApiVersion is not null;

        public bool Equals(ApiDefinition? other) =>
            other is not null &&
            TypeName == other.TypeName &&
            Namespace == other.Namespace &&
            ApiVersion == other.ApiVersion &&
            Operations.Equals(other.Operations) &&
            Diagnostics.Equals(other.Diagnostics);

        public override bool Equals(object? obj) => Equals(obj as ApiDefinition);

        public override int GetHashCode()
        {
            unchecked
            {
                var hash = 17;
                hash = (hash * 31) + (TypeName?.GetHashCode() ?? 0);
                hash = (hash * 31) + (Namespace?.GetHashCode() ?? 0);
                hash = (hash * 31) + (ApiVersion?.GetHashCode() ?? 0);
                hash = (hash * 31) + Operations.GetHashCode();
                hash = (hash * 31) + Diagnostics.GetHashCode();
                return hash;
            }
        }
    }

    private sealed class ApiOperation : IEquatable<ApiOperation>
    {
        public ApiOperation(
            string attributeName,
            string method,
            string path,
            string operationId,
            string actionName,
            EquatableArray<string> parameters)
        {
            AttributeName = attributeName;
            Method = method;
            Path = path;
            OperationId = operationId;
            ActionName = actionName;
            Parameters = parameters;
        }

        public string AttributeName { get; }

        public string Method { get; }

        public string Path { get; }

        public string OperationId { get; }

        public string ActionName { get; }

        public EquatableArray<string> Parameters { get; }

        public bool Equals(ApiOperation? other) =>
            other is not null &&
            AttributeName == other.AttributeName &&
            Method == other.Method &&
            Path == other.Path &&
            OperationId == other.OperationId &&
            ActionName == other.ActionName &&
            Parameters.Equals(other.Parameters);

        public override bool Equals(object? obj) => Equals(obj as ApiOperation);

        public override int GetHashCode()
        {
            unchecked
            {
                var hash = 17;
                hash = (hash * 31) + AttributeName.GetHashCode();
                hash = (hash * 31) + Method.GetHashCode();
                hash = (hash * 31) + Path.GetHashCode();
                hash = (hash * 31) + OperationId.GetHashCode();
                hash = (hash * 31) + ActionName.GetHashCode();
                hash = (hash * 31) + Parameters.GetHashCode();
                return hash;
            }
        }
    }

    private readonly struct DiagnosticInfo : IEquatable<DiagnosticInfo>
    {
        public DiagnosticInfo(LocationInfo? location, string message)
        {
            Location = location;
            Message = message;
        }

        public LocationInfo? Location { get; }

        public string Message { get; }

        public bool Equals(DiagnosticInfo other) =>
            Nullable.Equals(Location, other.Location) && Message == other.Message;

        public override bool Equals(object? obj) => obj is DiagnosticInfo other && Equals(other);

        public override int GetHashCode()
        {
            unchecked
            {
                return ((Location?.GetHashCode() ?? 0) * 31) + Message.GetHashCode();
            }
        }
    }

    /// <summary>
    /// A value-equatable stand-in for <see cref="Microsoft.CodeAnalysis.Location"/>.
    /// Carrying a <c>Location</c> through the pipeline would root a syntax tree and defeat
    /// caching, because structurally identical trees from different compilations never
    /// compare equal.
    /// </summary>
    private readonly struct LocationInfo : IEquatable<LocationInfo>
    {
        public LocationInfo(string filePath, TextSpan textSpan, LinePositionSpan lineSpan)
        {
            FilePath = filePath;
            TextSpan = textSpan;
            LineSpan = lineSpan;
        }

        public string FilePath { get; }

        public TextSpan TextSpan { get; }

        public LinePositionSpan LineSpan { get; }

        public static LocationInfo? From(SyntaxToken token)
        {
            var location = token.GetLocation();
            if (location?.SourceTree is null)
            {
                return null;
            }

            return new LocationInfo(
                location.SourceTree.FilePath,
                location.SourceSpan,
                location.GetLineSpan().Span);
        }

        public Location ToLocation() => Location.Create(FilePath, TextSpan, LineSpan);

        public bool Equals(LocationInfo other) =>
            FilePath == other.FilePath &&
            TextSpan.Equals(other.TextSpan) &&
            LineSpan.Equals(other.LineSpan);

        public override bool Equals(object? obj) => obj is LocationInfo other && Equals(other);

        public override int GetHashCode()
        {
            unchecked
            {
                var hash = 17;
                hash = (hash * 31) + FilePath.GetHashCode();
                hash = (hash * 31) + TextSpan.GetHashCode();
                hash = (hash * 31) + LineSpan.GetHashCode();
                return hash;
            }
        }
    }

    /// <summary>
    /// Arrays compare by reference, which would make every pipeline comparison a cache
    /// miss. This wrapper gives sequence equality instead.
    /// </summary>
    private readonly struct EquatableArray<T> : IEquatable<EquatableArray<T>>, IReadOnlyList<T>
        where T : IEquatable<T>
    {
        private readonly T[]? _values;

        public EquatableArray(T[] values)
        {
            _values = values;
        }

        public int Count => _values?.Length ?? 0;

        public T this[int index] => _values![index];

        public bool Equals(EquatableArray<T> other)
        {
            var left = _values ?? Array.Empty<T>();
            var right = other._values ?? Array.Empty<T>();
            if (left.Length != right.Length)
            {
                return false;
            }

            for (var i = 0; i < left.Length; i++)
            {
                if (!EqualityComparer<T>.Default.Equals(left[i], right[i]))
                {
                    return false;
                }
            }

            return true;
        }

        public override bool Equals(object? obj) => obj is EquatableArray<T> other && Equals(other);

        public override int GetHashCode()
        {
            unchecked
            {
                var hash = 17;
                foreach (var value in _values ?? Array.Empty<T>())
                {
                    hash = (hash * 31) + (value?.GetHashCode() ?? 0);
                }
                return hash;
            }
        }

        public IEnumerator<T> GetEnumerator() =>
            ((IEnumerable<T>)(_values ?? Array.Empty<T>())).GetEnumerator();

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
