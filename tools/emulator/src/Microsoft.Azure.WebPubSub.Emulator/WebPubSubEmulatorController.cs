// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Microsoft.Azure.WebPubSub.Emulator;

[ApiController]
internal sealed class WebPubSubEmulatorController : WebPubSubApiControllerDefinition
{
    private static readonly TimeSpan DefaultClientTokenLifetime = TimeSpan.FromHours(1);
    private readonly ConnectionManager _connections;
    private readonly WebPubSubTokenService _tokenService;

    public WebPubSubEmulatorController(
        ConnectionManager connections,
        WebPubSubTokenService tokenService)
    {
        _connections = connections;
        _tokenService = tokenService;
    }

    public override Task<IActionResult> GetServiceStatus(
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult<IActionResult>(Ok());
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

        var data = await ReadDataAsync(Request, cancellationToken);
        if (data is null)
        {
            return BadRequest();
        }

        _connections.SendToAll(
            hub,
            data,
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

        var data = await ReadDataAsync(Request, cancellationToken);
        if (data is null)
        {
            return BadRequest();
        }

        _connections.SendToGroup(
            hub,
            group,
            data,
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

        var data = await ReadDataAsync(Request, cancellationToken);
        if (data is null)
        {
            return BadRequest();
        }

        var found = _connections.SendToConnection(hub, connectionId, data);
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

    public override Task<IActionResult> UserExists(
        string hub,
        string userId,
        CancellationToken cancellationToken = default)
    {
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

        var data = await ReadDataAsync(Request, cancellationToken);
        if (data is null)
        {
            return BadRequest();
        }

        _connections.SendToUser(hub, userId, data, filter);
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

        _connections.AddUserToGroup(hub, userId, group);
        return Task.FromResult<IActionResult>(Ok());
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

        _connections.RemoveUserFromAllGroups(hub, userId);
        return Task.FromResult<IActionResult>(NoContent());
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
        var requestUri = new Uri(
            $"{Request.Scheme}://{Request.Host}{Request.PathBase}" +
            $"{Request.Path}{Request.QueryString}");
        return _tokenService.ValidateRestToken(requestUri, token);
    }

    private static IReadOnlySet<string> GetExcludedConnectionIds(HttpRequest request)
    {
        return request.Query["excluded"]
            .Where(value => value is not null)
            .Select(value => value!)
            .ToHashSet(StringComparer.Ordinal);
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

    private static async Task<MessageData?> ReadDataAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        using var stream = new MemoryStream();
        await request.Body.CopyToAsync(stream, cancellationToken);
        var bytes = stream.ToArray();

        if (request.ContentType?.StartsWith("application/octet-stream", StringComparison.OrdinalIgnoreCase) == true)
        {
            return new MessageData(MessageDataType.Binary, bytes);
        }

        if (request.ContentType?.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) == true)
        {
            try
            {
                using var document = JsonDocument.Parse(bytes);
            }
            catch (JsonException)
            {
                return null;
            }

            return new MessageData(MessageDataType.Json, bytes);
        }

        return new MessageData(
            MessageDataType.Text,
            bytes.Length == 0 ? Encoding.UTF8.GetBytes(string.Empty) : bytes);
    }
}