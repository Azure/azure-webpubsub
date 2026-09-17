// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed partial class WebPubSubEmulatorController
{
    [HttpPost("/api/hubs/{hub}/:addToGroups", Name = "WebPubSub_AddConnectionsToGroups")]
    public Task<IActionResult> AddConnectionsToGroups(
        [RegularExpression(WebPubSubNameValidator.HubNamePattern)] string hub,
        CancellationToken cancellationToken = default)
    {
        return UpdateGroupsAsync(hub, add: true, cancellationToken);
    }

    [HttpPost("/api/hubs/{hub}/:removeFromGroups", Name = "WebPubSub_RemoveConnectionsFromGroups")]
    public Task<IActionResult> RemoveConnectionsFromGroups(
        [RegularExpression(WebPubSubNameValidator.HubNamePattern)] string hub,
        CancellationToken cancellationToken = default)
    {
        return UpdateGroupsAsync(hub, add: false, cancellationToken);
    }

    [HttpDelete("/api/hubs/{hub}/connections/{connectionId}/groups", Name = "WebPubSub_RemoveConnectionFromAllGroups")]
    public IActionResult RemoveConnectionFromAllGroups(
        [RegularExpression(WebPubSubNameValidator.HubNamePattern)] string hub,
        [MinLength(1)] string connectionId)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }

        _connections.RemoveConnectionFromAllGroups(hub.ToLowerInvariant(), connectionId);
        return NoContent();
    }

    private async Task<IActionResult> UpdateGroupsAsync(string hub, bool add, CancellationToken cancellationToken)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }
        if (Request.ContentLength is not { } contentLength ||
            contentLength < 0 || contentLength > _runtimeOptions.MaxMessageSizeBytes)
        {
            return CreateBadRequest("Invalid Content-Length header.");
        }
        if (!TryGetDataType(out var dataType, out var encoding) || dataType != MessageDataType.Json)
        {
            return StatusCode(StatusCodes.Status415UnsupportedMediaType);
        }

        var bytes = await ReadBodyAsync(encoding, cancellationToken);
        if (bytes is null)
        {
            return CreateBadRequest("Invalid Content-Length header.");
        }

        GroupsRequest? request;
        try
        {
            request = JsonSerializer.Deserialize<GroupsRequest>(bytes, JsonSerializerOptions.Web);
        }
        catch (JsonException)
        {
            return CreateBadRequest("The request body is not a valid groups request.");
        }
        if (request?.Groups is not { Length: > 0 } groups ||
            groups.Any(group => !WebPubSubNameValidator.IsValidGroupName(group)))
        {
            return CreateBadRequest("A nonempty list of valid group names is required.");
        }

        try
        {
            ODataFilterExecutor.Instance.Validate(request.Filter);
            if (add)
            {
                _connections.AddConnectionsToGroups(hub.ToLowerInvariant(), groups, request.Filter);
            }
            else
            {
                _connections.RemoveConnectionsFromGroups(hub.ToLowerInvariant(), groups, request.Filter);
            }
        }
        catch (InvalidFilterException exception)
        {
            return CreateBadRequest(exception.Message);
        }
        return Ok();
    }

    private sealed record GroupsRequest(string[]? Groups, string? Filter);
}