// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed partial class WebPubSubEmulatorController
{
    [HttpPost("/api/hubs/{hub}/:generateToken", Name = "WebPubSub_GenerateClientToken")]
    public IActionResult GenerateClientToken(
        [RegularExpression(WebPubSubNameValidator.HubNamePattern)] string hub,
        [FromQuery] string? userId = null,
        [FromQuery(Name = "role")] string[]? roles = null,
        [FromQuery(Name = "group")] string[]? groups = null,
        [FromQuery, Range(1, int.MaxValue)] int minutesToExpire = 60,
        [FromQuery] string clientType = "Default")
    {
        if (!Authorize(requireEntraAudience: true))
        {
            return Unauthorized();
        }
        if (string.Equals(clientType, "MQTT", StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new
            {
                code = "NotImplemented", message = "MQTT client tokens are not supported by the emulator.",
            });
        }
        if (!string.Equals(clientType, "Default", StringComparison.OrdinalIgnoreCase))
        {
            return CreateBadRequest("Invalid clientType.", "clientType");
        }
        if (groups?.Any(group => !WebPubSubNameValidator.IsValidGroupName(group)) == true)
        {
            return CreateBadRequest("Invalid group name.", "group");
        }

        var endpoint = new Uri($"{Request.Scheme}://{Request.Host}");
        var token = _tokenService.IssueClientToken(
            endpoint, hub.ToLowerInvariant(), userId, roles ?? [], groups ?? [], minutesToExpire);
        return Ok(new { token });
    }
}