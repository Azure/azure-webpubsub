// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed partial class WebPubSubEmulatorController
{
    private const int MaximumGroupMemberPageSize = 200;
    // An emulator-specific opaque cursor; the ephemeral key is lost on process restart.
    private static readonly EphemeralDataProtectionProvider GroupMemberTokenProvider = new();

    [HttpGet("/api/hubs/{hub}/groups/{group}/connections", Name = "WebPubSub_ListConnectionsInGroup")]
    public IActionResult ListConnectionsInGroup(
        [RegularExpression(WebPubSubNameValidator.HubNamePattern, ErrorMessage = "Invalid hub name.")]
        string hub,
        [StringLength(WebPubSubNameValidator.MaximumGroupNameLength, MinimumLength = 1, ErrorMessage = "Invalid group name.")]
        [RegularExpression(WebPubSubNameValidator.NotWhitespacePattern, ErrorMessage = "Invalid group name.")]
        string group,
        [FromQuery, Range(1, MaximumGroupMemberPageSize, ErrorMessage = "Invalid maxpagesize.")]
        int maxpagesize = MaximumGroupMemberPageSize,
        [FromQuery, Range(1, int.MaxValue, ErrorMessage = "Invalid top.")]
        int? top = null,
        [FromQuery, StringLength(2048, MinimumLength = 1, ErrorMessage = "Invalid continuationToken.")]
        string? continuationToken = null)
    {
        if (!Authorize())
        {
            return Unauthorized();
        }

        foreach (var name in new[] { "maxpagesize", "top", "continuationToken" })
        {
            if (Request.Query.TryGetValue(name, out var values) &&
                (values.Count != 1 || string.IsNullOrWhiteSpace(values[0])))
            {
                return CreateBadRequest($"Invalid {name}.", name);
            }
        }

        var normalizedHub = hub.ToLowerInvariant();
        var protector = GroupMemberTokenProvider.CreateProtector(
            "WebPubSub.GroupMembers.v1", normalizedHub, group);
        string? afterConnectionId = null;
        if (continuationToken is not null)
        {
            try
            {
                afterConnectionId = protector.Unprotect(continuationToken);
            }
            catch (Exception exception) when (exception is CryptographicException or FormatException)
            {
                return CreateBadRequest("Invalid continuationToken.", "continuationToken");
            }
        }

        var pageSize = Math.Min(maxpagesize, top ?? MaximumGroupMemberPageSize);
        var members = _connections.GetGroupMembers(normalizedHub, group, afterConnectionId, pageSize + 1);
        var value = members.Take(pageSize).Select(member => new { member.ConnectionId, member.UserId }).ToArray();
        string? nextLink = null;
        if (members.Length > pageSize && (top is null || top > pageSize))
        {
            var query = new Dictionary<string, string?>
            {
                ["api-version"] = ApiVersion,
                ["maxpagesize"] = maxpagesize.ToString(CultureInfo.InvariantCulture),
                ["continuationToken"] = protector.Protect(value[^1].ConnectionId),
            };
            if (top.HasValue)
            {
                query["top"] = (top.Value - value.Length).ToString(CultureInfo.InvariantCulture);
            }

            var nextLinkUriBuilder = new UriBuilder(Request.Scheme, Request.Host.Host)
            {
                Path = Request.PathBase + Request.Path,
                Query = QueryString.Create(query).ToUriComponent(),
            };
            if (Request.Host.Port.HasValue)
            {
                nextLinkUriBuilder.Port = Request.Host.Port.Value;
            }
            nextLink = nextLinkUriBuilder.Uri.AbsoluteUri;
        }

        return Ok(new { value, nextLink });
    }
}