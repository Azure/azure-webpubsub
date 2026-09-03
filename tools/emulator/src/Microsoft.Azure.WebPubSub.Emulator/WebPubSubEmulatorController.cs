// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.ComponentModel.DataAnnotations;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Microsoft.Azure.WebPubSub.Emulator;

[ApiController]
internal sealed class WebPubSubEmulatorController : WebPubSubApiControllerDefinition
{
    private const int MaximumMessageTtlSeconds = 300;
    private const string MetadataHeaderPrefix = "X-WebPubSub-Metadata-";
    private readonly ConnectionManager _connections;
    private readonly EmulatorRuntimeOptions _runtimeOptions;
    private readonly WebPubSubTokenService _tokenService;

    public WebPubSubEmulatorController(
        ConnectionManager connections,
        EmulatorRuntimeOptions runtimeOptions,
        WebPubSubTokenService tokenService)
    {
        _connections = connections;
        _runtimeOptions = runtimeOptions;
        _tokenService = tokenService;
    }

    public override Task<IActionResult> GetServiceStatus(
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult<IActionResult>(Ok());
    }

    [HttpHead(
        "/api/hubs/{hub}/connections/{connectionId}",
        Name = "WebPubSub_ConnectionExists")]
    public Task<IActionResult> ConnectionExists(
        [RegularExpression(
            WebPubSubNameValidator.HubNamePattern,
            ErrorMessage = "Invalid hub name.")]
        string hub,
        [MinLength(1, ErrorMessage = "Invalid connection ID.")]
        string connectionId,
        CancellationToken cancellationToken = default)
    {
        IActionResult result;
        if (!Authorize())
        {
            result = Unauthorized();
        }
        else
        {
            result = _connections.ConnectionExists(hub.ToLowerInvariant(), connectionId)
                ? Ok()
                : NotFound();
        }

        return Task.FromResult(result);
    }

    [HttpPost(
        "/api/hubs/{hub}/connections/{connectionId}/:send",
        Name = "WebPubSub_SendToConnection")]
    public async Task<IActionResult> SendToConnection(
        [RegularExpression(
            WebPubSubNameValidator.HubNamePattern,
            ErrorMessage = "Invalid hub name.")]
        string hub,
        [MinLength(1, ErrorMessage = "Invalid connection ID.")]
        string connectionId,
        [Range(0, MaximumMessageTtlSeconds, ErrorMessage = "Invalid messageTtlSeconds.")]
        [FromQuery(Name = "messageTtlSeconds")]
        uint? messageTtlSeconds,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }
        if (Request.ContentLength is not { } contentLength ||
            contentLength < 0 ||
            contentLength > _runtimeOptions.MaxMessageSizeBytes)
        {
            return CreateBadRequest("Invalid Content-Length header.");
        }
        if (!TryGetDataType(out var dataType, out var encoding))
        {
            return StatusCode(StatusCodes.Status415UnsupportedMediaType);
        }

        var bytes = await ReadBodyAsync(encoding, cancellationToken);
        if (bytes is null)
        {
            return CreateBadRequest("Invalid Content-Length header.");
        }
        if (dataType == MessageDataType.Json && !IsValidJson(bytes))
        {
            return CreateBadRequest("The request body is not a valid JSON.");
        }

        IReadOnlyDictionary<string, string>? metadata;
        try
        {
            metadata = GetMetadata();
            WebPubSubMetadataValidator.Validate(metadata);
        }
        catch (InvalidDataException exception)
        {
            return CreateBadRequest(exception.Message);
        }

        _connections.SendToConnection(
            hub.ToLowerInvariant(),
            connectionId,
            new MessageData(dataType, bytes, metadata));
        return Accepted();
    }

    private bool Authorize()
    {
        var authorization = Request.Headers.Authorization.ToString();
        const string bearerPrefix = "Bearer ";
        if (!authorization.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var token = authorization[bearerPrefix.Length..].Trim();
        var requestUri = new Uri(
            $"{Request.Scheme}://{Request.Host}{Request.PathBase}" +
            $"{Request.Path}{Request.QueryString}");
        return _tokenService.ValidateRestToken(requestUri, token);
    }

    private IReadOnlyDictionary<string, string>? GetMetadata()
    {
        Dictionary<string, string>? metadata = null;
        foreach (var header in Request.Headers)
        {
            if (!header.Key.StartsWith(MetadataHeaderPrefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var key = header.Key[MetadataHeaderPrefix.Length..].ToLowerInvariant();
            var value = header.Value.Count == 0 ? string.Empty : header.Value[^1] ?? string.Empty;
            var lastComma = value.LastIndexOf(',');
            metadata ??= new(StringComparer.Ordinal);
            metadata[key] = lastComma < 0 ? value.Trim() : value[(lastComma + 1)..].Trim();
        }
        return metadata;
    }

    private bool TryGetDataType(out MessageDataType dataType, out Encoding? encoding)
    {
        dataType = MessageDataType.Binary;
        encoding = null;
        if (string.IsNullOrEmpty(Request.ContentType))
        {
            return true;
        }

        Microsoft.Net.Http.Headers.MediaTypeHeaderValue? contentType;
        try
        {
            contentType = Request.GetTypedHeaders().ContentType;
        }
        catch (FormatException)
        {
            return false;
        }
        if (contentType is null)
        {
            return false;
        }

        var mediaType = contentType.MediaType.Value;
        if (string.Equals(mediaType, "application/octet-stream", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        if (string.Equals(mediaType, "application/json", StringComparison.OrdinalIgnoreCase))
        {
            dataType = MessageDataType.Json;
        }
        else if (string.Equals(mediaType, "text/plain", StringComparison.OrdinalIgnoreCase))
        {
            dataType = MessageDataType.Text;
        }
        else
        {
            return false;
        }

        try
        {
            encoding = string.IsNullOrEmpty(contentType.Charset.Value)
                ? Encoding.UTF8
                : Encoding.GetEncoding(contentType.Charset.Value);
            return true;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private async Task<byte[]?> ReadBodyAsync(
        Encoding? encoding,
        CancellationToken cancellationToken)
    {
        using var stream = new MemoryStream();
        var buffer = new byte[81920];
        while (true)
        {
            var count = await Request.Body.ReadAsync(buffer, cancellationToken);
            if (count == 0)
            {
                break;
            }
            if (stream.Length + count > _runtimeOptions.MaxMessageSizeBytes)
            {
                return null;
            }
            await stream.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
        }

        var bytes = stream.ToArray();
        return encoding is null || encoding.CodePage == Encoding.UTF8.CodePage
            ? bytes
            : Encoding.Convert(encoding, Encoding.UTF8, bytes);
    }

    private static bool IsValidJson(byte[] payload)
    {
        var reader = new Utf8JsonReader(payload, isFinalBlock: true, state: default);
        try
        {
            while (reader.Read())
            {
            }
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}