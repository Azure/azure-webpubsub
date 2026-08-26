// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;

namespace Microsoft.Azure.WebPubSub.Emulator;

[ApiController]
internal sealed class WebPubSubEmulatorController : WebPubSubApiControllerDefinition
{
    private static readonly TimeSpan DefaultClientTokenLifetime = TimeSpan.FromHours(1);
    private readonly ConnectionManager _connections;
    private readonly int _maxMessageSizeBytes;
    private readonly WebPubSubTokenService _tokenService;

    public WebPubSubEmulatorController(
        ConnectionManager connections,
        WebPubSubTokenService tokenService,
        EmulatorRuntimeOptions runtimeOptions)
    {
        _connections = connections;
        _tokenService = tokenService;
        _maxMessageSizeBytes = runtimeOptions.MaxMessageSizeBytes;
    }

    public override Task<IActionResult> GetServiceStatus(
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult<IActionResult>(Ok());
    }

    public override async Task<IActionResult> AddConnectionsToGroups(
        string hub,
        CancellationToken cancellationToken = default)
    {
        return await UpdateConnectionsInGroupsAsync(hub, add: true, cancellationToken);
    }

    public override Task<IActionResult> CloseAllConnections(
        string hub,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }

        var reason = GetCloseReason();
        _connections.CloseAllConnections(
            hub,
            reason,
            GetExcludedConnectionIds(Request));
        return Task.FromResult<IActionResult>(NoContent());
    }

    public override Task<IActionResult> GenerateClientToken(
        string hub,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }

        var clientType = Request.Query["clientType"].ToString();
        if (string.Equals(clientType, "MQTT", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(UnsupportedFeature(
                "MQTT client tokens are not supported by the emulator."));
        }
        if (!string.IsNullOrEmpty(clientType) &&
            !string.Equals(clientType, "Default", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult<IActionResult>(BadRequest());
        }

        var lifetime = DefaultClientTokenLifetime;
        var minutesToExpire = Request.Query["minutesToExpire"].ToString();
        if (!string.IsNullOrEmpty(minutesToExpire))
        {
            if (!int.TryParse(minutesToExpire, out var minutes) || minutes < 1)
            {
                return Task.FromResult<IActionResult>(BadRequest());
            }
            lifetime = TimeSpan.FromMinutes(minutes);
        }

        var token = _tokenService.IssueClientToken(
            hub,
            Request.Query["userId"].ToString(),
            Request.Query["role"],
            Request.Query["group"],
            lifetime);
        return Task.FromResult<IActionResult>(Ok(new { token }));
    }

    public override async Task<IActionResult> RemoveConnectionsFromGroups(
        string hub,
        CancellationToken cancellationToken = default)
    {
        return await UpdateConnectionsInGroupsAsync(hub, add: false, cancellationToken);
    }

    public override async Task<IActionResult> SendToAll(
        string hub,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }
        if (!HasValidMessageTtl())
        {
            return BadRequest();
        }

        var filter = Request.Query["filter"].ToString();
        try
        {
            ODataFilterExecutor.Instance.Validate(filter);
        }
        catch (InvalidFilterException exception)
        {
            return InvalidFilter(exception);
        }

        if (!HasSupportedContentType(Request))
        {
            return UnsupportedContentType();
        }

        var readResult = await ReadDataAsync(Request, _maxMessageSizeBytes, cancellationToken);
        if (readResult.IsTooLarge)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge);
        }
        if (readResult.Data is null)
        {
            return BadRequest();
        }

        _connections.SendToAll(
            hub,
            readResult.Data,
            GetExcludedConnectionIds(Request),
            filter);
        return Accepted();
    }

    public override async Task<IActionResult> SendToGroup(
        string hub,
        string group,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }
        if (!HasValidMessageTtl())
        {
            return BadRequest();
        }

        var filter = Request.Query["filter"].ToString();
        try
        {
            ODataFilterExecutor.Instance.Validate(filter);
        }
        catch (InvalidFilterException exception)
        {
            return InvalidFilter(exception);
        }

        if (!HasSupportedContentType(Request))
        {
            return UnsupportedContentType();
        }

        var readResult = await ReadDataAsync(Request, _maxMessageSizeBytes, cancellationToken);
        if (readResult.IsTooLarge)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge);
        }
        if (readResult.Data is null)
        {
            return BadRequest();
        }

        _connections.SendToGroup(
            hub,
            group,
            readResult.Data,
            sender: null,
            noEcho: false,
            GetExcludedConnectionIds(Request),
            filter);
        return Accepted();
    }

    public override async Task<IActionResult> SendToConnection(
        string hub,
        string connectionId,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }
        if (!HasValidMessageTtl())
        {
            return BadRequest();
        }
        if (!HasSupportedContentType(Request))
        {
            return UnsupportedContentType();
        }

        var readResult = await ReadDataAsync(Request, _maxMessageSizeBytes, cancellationToken);
        if (readResult.IsTooLarge)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge);
        }
        if (readResult.Data is null)
        {
            return BadRequest();
        }

        var found = _connections.SendToConnection(hub, connectionId, readResult.Data);
        return found ? Accepted() : NotFound();
    }

    public override Task<IActionResult> ConnectionExists(
        string hub,
        string connectionId,
        CancellationToken cancellationToken = default)
    {
        IActionResult result = Authorize()
            ? _connections.ConnectionExists(hub, connectionId)
                ? Ok()
                : NotFound()
            : Unauthorized();
        return Task.FromResult(result);
    }

    public override Task<IActionResult> CloseConnection(
        string hub,
        string connectionId,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }

        var reason = Request.Query["reason"].ToString();
        _connections.CloseConnection(
            hub,
            connectionId,
            string.IsNullOrEmpty(reason) ? "Closed by REST API." : reason);
        return Task.FromResult<IActionResult>(NoContent());
    }

    public override Task<IActionResult> GroupExists(
        string hub,
        string group,
        CancellationToken cancellationToken = default)
    {
        IActionResult result = Authorize()
            ? _connections.GroupExists(hub, group)
                ? Ok()
                : NotFound()
            : Unauthorized();
        return Task.FromResult(result);
    }

    public override Task<IActionResult> AddConnectionToGroup(
        string hub,
        string group,
        string connectionId,
        CancellationToken cancellationToken = default)
    {
        IActionResult result = Authorize()
            ? _connections.AddConnectionToGroup(hub, connectionId, group)
                ? Ok()
                : NotFound()
            : Unauthorized();
        return Task.FromResult(result);
    }

    public override Task<IActionResult> RemoveConnectionFromGroup(
        string hub,
        string group,
        string connectionId,
        CancellationToken cancellationToken = default)
    {
        IActionResult result = Authorize()
            ? _connections.RemoveConnectionFromGroup(hub, connectionId, group)
                ? NoContent()
                : NotFound()
            : Unauthorized();
        return Task.FromResult(result);
    }

    public override Task<IActionResult> RemoveConnectionFromAllGroups(
        string hub,
        string connectionId,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }

        _connections.RemoveConnectionFromAllGroups(hub, connectionId);
        return Task.FromResult<IActionResult>(NoContent());
    }

    public override Task<IActionResult> CloseGroupConnections(
        string hub,
        string group,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }

        _connections.CloseGroupConnections(
            hub,
            group,
            GetCloseReason(),
            GetExcludedConnectionIds(Request));
        return Task.FromResult<IActionResult>(NoContent());
    }

    public override Task<IActionResult> ListConnectionsInGroup(
        string hub,
        string group,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }
        if (!TryGetPositiveQueryValue("maxpagesize", 200, out var maxPageSize) ||
            maxPageSize > 200 ||
            !TryGetOptionalPositiveQueryValue("top", out var top))
        {
            return Task.FromResult<IActionResult>(BadRequest());
        }

        var page = _connections.ListConnectionsInGroup(
            hub,
            group,
            maxPageSize,
            top,
            Request.Query["continuationToken"].ToString());
        Uri? nextLink = null;
        if (page.HasMore)
        {
            int? remaining = top.HasValue ? top.Value - page.Value.Count : null;
            var query = new Dictionary<string, string?>
            {
                ["maxpagesize"] = maxPageSize.ToString(CultureInfo.InvariantCulture),
                ["continuationToken"] = page.ContinuationToken,
                ["api-version"] = WebPubSubApiControllerDefinition.ApiVersion,
            };
            if (remaining.HasValue)
            {
                query["top"] = remaining.Value.ToString(CultureInfo.InvariantCulture);
            }
            var path = $"{Request.Scheme}://{Request.Host}{Request.PathBase}{Request.Path}";
            nextLink = new Uri(QueryHelpers.AddQueryString(path, query));
        }

        return Task.FromResult<IActionResult>(Ok(new GroupMemberPageResponse(page.Value)
        {
            NextLink = nextLink,
        }));
    }

    public override Task<IActionResult> UserExists(
        string hub,
        string userId,
        CancellationToken cancellationToken = default)
    {
        userId = DecodeUserId(Request, userId);
        IActionResult result = Authorize()
            ? _connections.UserExists(hub, userId)
                ? Ok()
                : NotFound()
            : Unauthorized();
        return Task.FromResult(result);
    }

    public override Task<IActionResult> CloseUserConnections(
        string hub,
        string userId,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }

        userId = DecodeUserId(Request, userId);
        var reason = Request.Query["reason"].ToString();
        _connections.CloseUserConnections(
            hub,
            userId,
            string.IsNullOrEmpty(reason) ? "Closed by REST API." : reason,
            GetExcludedConnectionIds(Request));
        return Task.FromResult<IActionResult>(NoContent());
    }

    public override async Task<IActionResult> SendToUser(
        string hub,
        string userId,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }
        if (!HasValidMessageTtl())
        {
            return BadRequest();
        }

        userId = DecodeUserId(Request, userId);
        var filter = Request.Query["filter"].ToString();
        try
        {
            ODataFilterExecutor.Instance.Validate(filter);
        }
        catch (InvalidFilterException exception)
        {
            return InvalidFilter(exception);
        }

        if (!HasSupportedContentType(Request))
        {
            return UnsupportedContentType();
        }

        var readResult = await ReadDataAsync(Request, _maxMessageSizeBytes, cancellationToken);
        if (readResult.IsTooLarge)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge);
        }
        if (readResult.Data is null)
        {
            return BadRequest();
        }

        _connections.SendToUser(hub, userId, readResult.Data, filter);
        return Accepted();
    }

    public override Task<IActionResult> AddUserToGroup(
        string hub,
        string userId,
        string group,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }

        userId = DecodeUserId(Request, userId);
        IActionResult result = _connections.AddUserToGroup(hub, userId, group)
            ? Ok()
            : NotFound();
        return Task.FromResult(result);
    }

    public override Task<IActionResult> RemoveUserFromGroup(
        string hub,
        string userId,
        string group,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }

        userId = DecodeUserId(Request, userId);
        _connections.RemoveUserFromGroup(hub, userId, group);
        return Task.FromResult<IActionResult>(NoContent());
    }

    public override Task<IActionResult> RemoveUserFromAllGroups(
        string hub,
        string userId,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Task.FromResult<IActionResult>(Unauthorized());
        }

        userId = DecodeUserId(Request, userId);
        _connections.RemoveUserFromAllGroups(hub, userId);
        return Task.FromResult<IActionResult>(NoContent());
    }

    private async Task<IActionResult> UpdateConnectionsInGroupsAsync(
        string hub,
        bool add,
        CancellationToken cancellationToken)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }
        if (!Request.HasJsonContentType())
        {
            return UnsupportedContentType();
        }

        BulkGroupRequest? operation;
        try
        {
            operation = await Request.ReadFromJsonAsync<BulkGroupRequest>(cancellationToken);
        }
        catch (JsonException)
        {
            return BadRequest();
        }
        if (operation?.Groups is not { Length: > 0 } groups ||
            groups.Any(group => string.IsNullOrWhiteSpace(group) || group.Length > 1024))
        {
            return BadRequest();
        }

        try
        {
            ODataFilterExecutor.Instance.Validate(operation.Filter);
        }
        catch (InvalidFilterException exception)
        {
            return InvalidFilter(exception);
        }

        if (add)
        {
            _connections.AddConnectionsToGroups(hub, groups, operation.Filter);
        }
        else
        {
            _connections.RemoveConnectionsFromGroups(hub, groups, operation.Filter);
        }
        return Ok();
    }

    private string GetCloseReason()
    {
        var reason = Request.Query["reason"].ToString();
        return string.IsNullOrEmpty(reason) ? "Closed by REST API." : reason;
    }

    private bool TryGetPositiveQueryValue(string name, int defaultValue, out int value)
    {
        if (!Request.Query.TryGetValue(name, out var values))
        {
            value = defaultValue;
            return true;
        }

        value = default;
        return values.Count == 1 &&
            int.TryParse(values[0], NumberStyles.None, CultureInfo.InvariantCulture, out value) &&
            value > 0;
    }

    private bool TryGetOptionalPositiveQueryValue(string name, out int? value)
    {
        if (!Request.Query.TryGetValue(name, out var values))
        {
            value = null;
            return true;
        }

        if (values.Count == 1 &&
            int.TryParse(values[0], NumberStyles.None, CultureInfo.InvariantCulture, out var parsed) &&
            parsed > 0)
        {
            value = parsed;
            return true;
        }

        value = null;
        return false;
    }

    private bool HasValidMessageTtl()
    {
        if (!Request.Query.TryGetValue("messageTtlSeconds", out var values))
        {
            return true;
        }

        return values.Count == 1 &&
            int.TryParse(
                values[0],
                NumberStyles.None,
                CultureInfo.InvariantCulture,
                out var value) &&
            value is >= 0 and <= 300;
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
        var rawTarget = Request.HttpContext.Features.Get<IHttpRequestFeature>()?.RawTarget;
        var requestTarget = rawTarget?.StartsWith('/') == true
            ? rawTarget
            : $"{Request.PathBase}{Request.Path}{Request.QueryString}";
        var requestUri = new Uri($"{Request.Scheme}://{Request.Host}{requestTarget}");
        return _tokenService.ValidateRestToken(requestUri, token);
    }

    private static IReadOnlySet<string> GetExcludedConnectionIds(HttpRequest request)
    {
        return request.Query["excluded"]
            .Where(value => value is not null)
            .Select(value => value!)
            .ToHashSet(StringComparer.Ordinal);
    }

    private static string DecodeUserId(HttpRequest request, string userId)
    {
        var rawTarget = request.HttpContext.Features.Get<IHttpRequestFeature>()?.RawTarget;
        if (string.IsNullOrEmpty(rawTarget))
        {
            return userId.Replace("%2F", "/", StringComparison.OrdinalIgnoreCase);
        }

        const string userSegment = "/users/";
        var userStart = rawTarget.IndexOf(userSegment, StringComparison.OrdinalIgnoreCase);
        if (userStart < 0)
        {
            return userId;
        }

        userStart += userSegment.Length;
        var userEnd = rawTarget.IndexOfAny(['/', '?'], userStart);
        var rawUserId = userEnd < 0
            ? rawTarget[userStart..]
            : rawTarget[userStart..userEnd];
        return Uri.UnescapeDataString(rawUserId);
    }

    private static bool HasSupportedContentType(HttpRequest request)
    {
        var mediaType = request.GetTypedHeaders().ContentType?.MediaType.Value;
        return string.Equals(mediaType, "application/json", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(mediaType, "application/octet-stream", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(mediaType, "text/plain", StringComparison.OrdinalIgnoreCase);
    }

    private IActionResult InvalidFilter(InvalidFilterException exception)
    {
        return BadRequest(new
        {
            code = "Error.BadRequest",
            message = exception.Message,
            target = "Request",
        });
    }

    private IActionResult UnsupportedContentType()
    {
        return StatusCode(StatusCodes.Status415UnsupportedMediaType);
    }

    private IActionResult UnsupportedFeature(string message)
    {
        return BadRequest(new { code = "NotSupported", message });
    }

    private static async Task<MessageDataReadResult> ReadDataAsync(
        HttpRequest request,
        int maxMessageSizeBytes,
        CancellationToken cancellationToken)
    {
        if (maxMessageSizeBytes < 0 || request.ContentLength > maxMessageSizeBytes)
        {
            return new(null, true);
        }

        IReadOnlyDictionary<string, string>? metadata;
        try
        {
            metadata = GetMetadata(request);
            WebPubSubMetadata.Validate(metadata);
        }
        catch (InvalidDataException)
        {
            return new(null, false);
        }

        using var stream = new MemoryStream();
        var buffer = new byte[Math.Min(81920, Math.Max(maxMessageSizeBytes, 1))];
        while (true)
        {
            var remaining = maxMessageSizeBytes - stream.Length;
            var read = await request.Body.ReadAsync(
                buffer.AsMemory(0, (int)Math.Min(buffer.Length, remaining + 1)),
                cancellationToken);
            if (read == 0)
            {
                break;
            }
            if (read > remaining)
            {
                return new(null, true);
            }
            stream.Write(buffer, 0, read);
        }
        var bytes = stream.ToArray();

        if (request.ContentType?.StartsWith("application/octet-stream", StringComparison.OrdinalIgnoreCase) == true)
        {
            return new(new MessageData(MessageDataType.Binary, bytes, metadata), false);
        }

        if (request.ContentType?.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) == true)
        {
            try
            {
                using var document = JsonDocument.Parse(bytes);
            }
            catch (JsonException)
            {
                return new(null, false);
            }

            return new(new MessageData(MessageDataType.Json, bytes, metadata), false);
        }

        return new(
            new MessageData(
                MessageDataType.Text,
                bytes.Length == 0 ? Encoding.UTF8.GetBytes(string.Empty) : bytes,
                metadata),
            false);
    }

    private readonly record struct MessageDataReadResult(MessageData? Data, bool IsTooLarge);

    private static IReadOnlyDictionary<string, string>? GetMetadata(HttpRequest request)
    {
        Dictionary<string, string>? metadata = null;
        foreach (var header in request.Headers)
        {
            if (!header.Key.StartsWith(WebPubSubMetadata.HeaderPrefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var key = header.Key[WebPubSubMetadata.HeaderPrefix.Length..].ToLowerInvariant();
            var value = header.Value.Count == 0 ? string.Empty : header.Value[^1] ?? string.Empty;
            metadata ??= new Dictionary<string, string>(StringComparer.Ordinal);
            metadata[key] = value;
        }
        return metadata;
    }
}