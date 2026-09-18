// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed partial class WebPubSubEmulatorController
{
    [HttpPost(
        "/api/hubs/{hub}/:closeConnections",
        Name = "WebPubSub_CloseAllConnections")]
    public IActionResult CloseAllConnections(
        [RegularExpression(
            WebPubSubNameValidator.HubNamePattern,
            ErrorMessage = "Invalid hub name.")]
        string hub,
        [FromQuery(Name = "reason")]
        string? reason,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }

        _connections.CloseAllConnections(
            hub.ToLowerInvariant(), GetExcludedConnectionIds(), reason);
        return NoContent();
    }

    [HttpPost(
        "/api/hubs/{hub}/groups/{group}/:closeConnections",
        Name = "WebPubSub_CloseGroupConnections")]
    public IActionResult CloseGroupConnections(
        [RegularExpression(
            WebPubSubNameValidator.HubNamePattern,
            ErrorMessage = "Invalid hub name.")]
        string hub,
        [StringLength(
            WebPubSubNameValidator.MaximumGroupNameLength,
            MinimumLength = 1,
            ErrorMessage = "Invalid group name.")]
        [RegularExpression(
            WebPubSubNameValidator.NotWhitespacePattern,
            ErrorMessage = "Invalid group name.")]
        string group,
        [FromQuery(Name = "reason")]
        string? reason,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }

        _connections.CloseGroupConnections(
            hub.ToLowerInvariant(), group, GetExcludedConnectionIds(), reason);
        return NoContent();
    }

    [HttpPost(
        "/api/hubs/{hub}/users/{userId}/:closeConnections",
        Name = "WebPubSub_CloseUserConnections")]
    public IActionResult CloseUserConnections(
        [RegularExpression(
            WebPubSubNameValidator.HubNamePattern,
            ErrorMessage = "Invalid hub name.")]
        string hub,
        [MinLength(1, ErrorMessage = "Invalid user ID.")]
        string userId,
        [FromQuery(Name = "reason")]
        string? reason,
        CancellationToken cancellationToken = default)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }

        _connections.CloseUserConnections(
            hub.ToLowerInvariant(), userId, GetExcludedConnectionIds(), reason);
        return NoContent();
    }
}