// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;

namespace Microsoft.Azure.WebPubSub.Emulator.ApiSourceGenerator;

[Generator]
public sealed class ApiSourceGenerator : ISourceGenerator
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

    public void Initialize(GeneratorInitializationContext context)
    {
        context.RegisterForSyntaxNotifications(static () => new SyntaxReceiver());
    }

    public void Execute(GeneratorExecutionContext context)
    {
        if (context.SyntaxReceiver is not SyntaxReceiver receiver)
        {
            return;
        }

        foreach (var declaration in receiver.Candidates)
        {
            var model = context.Compilation.GetSemanticModel(declaration.SyntaxTree);
            if (model.GetDeclaredSymbol(declaration) is not INamedTypeSymbol type)
            {
                continue;
            }

            var attributes = type.GetAttributes();
            var api = attributes.SingleOrDefault(attribute =>
                attribute.AttributeClass?.ToDisplayString() == ApiAttributeName);
            if (api is null)
            {
                continue;
            }

            if (!TryGetString(api, 0, out var apiVersion))
            {
                Report(context, declaration, "The WebPubSubApi attribute requires an API version.");
                continue;
            }

            var operations = new List<ApiOperation>();
            var valid = true;
            foreach (var attribute in attributes
                .Where(attribute => attribute.AttributeClass?.ToDisplayString() == OperationAttributeName)
                .OrderBy(attribute => attribute.ApplicationSyntaxReference?.Span.Start))
            {
                ApiOperation? operation = null;
                string? error = null;
                if (!TryGetString(attribute, 0, out var method) ||
                    !TryGetString(attribute, 1, out var path) ||
                    !TryGetString(attribute, 2, out var operationId) ||
                    !TryCreateOperation(method, path, operationId, out operation, out error))
                {
                    Report(context, declaration, error ?? "A WebPubSubApiOperation attribute is invalid.");
                    valid = false;
                    continue;
                }

                operations.Add(operation!);
            }

            if (!valid || operations.Count == 0 || !ValidateOperations(context, declaration, operations))
            {
                continue;
            }

            context.AddSource(
                $"{type.Name}.g.cs",
                SourceText.From(Generate(type, apiVersion, operations), Encoding.UTF8));
        }
    }

    private static bool ValidateOperations(
        GeneratorExecutionContext context,
        ClassDeclarationSyntax declaration,
        IReadOnlyCollection<ApiOperation> operations)
    {
        var valid = true;
        foreach (var duplicate in operations.GroupBy(operation => operation.ActionName)
            .Where(group => group.Count() > 1))
        {
            Report(context, declaration, $"Action name '{duplicate.Key}' is duplicated.");
            valid = false;
        }
        foreach (var duplicate in operations.GroupBy(operation => (operation.Method, operation.Path))
            .Where(group => group.Count() > 1))
        {
            Report(
                context,
                declaration,
                $"Route '{duplicate.Key.Method} {duplicate.Key.Path}' is duplicated.");
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
        operation = new(attributeName, method.ToUpperInvariant(), path, operationId, actionName, parameters);
        error = null;
        return true;
    }

    private static string Generate(
        INamedTypeSymbol type,
        string apiVersion,
        IReadOnlyCollection<ApiOperation> operations)
    {
        var builder = new StringBuilder();
        builder.AppendLine("// <auto-generated />");
        builder.AppendLine();
        builder.AppendLine("using Microsoft.AspNetCore.Mvc;");
        builder.AppendLine("using Microsoft.AspNetCore.Mvc.Filters;");
        builder.AppendLine();
        builder.Append("namespace ").Append(type.ContainingNamespace.ToDisplayString()).AppendLine(";");
        builder.AppendLine();
        builder.AppendLine("[ApiController]");
        builder.Append("internal abstract partial class ").Append(type.Name)
            .AppendLine(" : ControllerBase, IAsyncActionFilter");
        builder.AppendLine("{");
        builder.Append("    public const string ApiVersion = \"").Append(Escape(apiVersion)).AppendLine("\";");

        foreach (var operation in operations)
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

    private static void Report(
        GeneratorExecutionContext context,
        ClassDeclarationSyntax declaration,
        string message)
    {
        context.ReportDiagnostic(Diagnostic.Create(
            InvalidDefinition,
            declaration.Identifier.GetLocation(),
            message));
    }

    private sealed class SyntaxReceiver : ISyntaxReceiver
    {
        public List<ClassDeclarationSyntax> Candidates { get; } = new();

        public void OnVisitSyntaxNode(SyntaxNode syntaxNode)
        {
            if (syntaxNode is ClassDeclarationSyntax declaration && declaration.AttributeLists.Count > 0)
            {
                Candidates.Add(declaration);
            }
        }
    }

    private sealed class ApiOperation
    {
        public ApiOperation(
            string attributeName,
            string method,
            string path,
            string operationId,
            string actionName,
            string[] parameters)
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

        public string[] Parameters { get; }
    }
}