// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Microsoft.Azure.WebPubSub.Emulator;

[WebPubSubApi("2024-12-01")]
[WebPubSubApiOperation("HEAD", "/api/health", "HealthApi_GetServiceStatus")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/:addToGroups", "WebPubSub_AddConnectionsToGroups")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/:closeConnections", "WebPubSub_CloseAllConnections")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/:generateToken", "WebPubSub_GenerateClientToken")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/:removeFromGroups", "WebPubSub_RemoveConnectionsFromGroups")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/:send", "WebPubSub_SendToAll")]
[WebPubSubApiOperation("DELETE", "/api/hubs/{hub}/connections/{connectionId}", "WebPubSub_CloseConnection")]
[WebPubSubApiOperation("HEAD", "/api/hubs/{hub}/connections/{connectionId}", "WebPubSub_ConnectionExists")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/connections/{connectionId}/:send", "WebPubSub_SendToConnection")]
[WebPubSubApiOperation("DELETE", "/api/hubs/{hub}/connections/{connectionId}/groups", "WebPubSub_RemoveConnectionFromAllGroups")]
[WebPubSubApiOperation("HEAD", "/api/hubs/{hub}/groups/{group}", "WebPubSub_GroupExists")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/groups/{group}/:closeConnections", "WebPubSub_CloseGroupConnections")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/groups/{group}/:send", "WebPubSub_SendToGroup")]
[WebPubSubApiOperation("GET", "/api/hubs/{hub}/groups/{group}/connections", "WebPubSub_ListConnectionsInGroup")]
[WebPubSubApiOperation("DELETE", "/api/hubs/{hub}/groups/{group}/connections/{connectionId}", "WebPubSub_RemoveConnectionFromGroup")]
[WebPubSubApiOperation("PUT", "/api/hubs/{hub}/groups/{group}/connections/{connectionId}", "WebPubSub_AddConnectionToGroup")]
[WebPubSubApiOperation("DELETE", "/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}", "WebPubSub_RevokePermission")]
[WebPubSubApiOperation("HEAD", "/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}", "WebPubSub_CheckPermission")]
[WebPubSubApiOperation("PUT", "/api/hubs/{hub}/permissions/{permission}/connections/{connectionId}", "WebPubSub_GrantPermission")]
[WebPubSubApiOperation("HEAD", "/api/hubs/{hub}/users/{userId}", "WebPubSub_UserExists")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/users/{userId}/:closeConnections", "WebPubSub_CloseUserConnections")]
[WebPubSubApiOperation("POST", "/api/hubs/{hub}/users/{userId}/:send", "WebPubSub_SendToUser")]
[WebPubSubApiOperation("DELETE", "/api/hubs/{hub}/users/{userId}/groups", "WebPubSub_RemoveUserFromAllGroups")]
[WebPubSubApiOperation("DELETE", "/api/hubs/{hub}/users/{userId}/groups/{group}", "WebPubSub_RemoveUserFromGroup")]
[WebPubSubApiOperation("PUT", "/api/hubs/{hub}/users/{userId}/groups/{group}", "WebPubSub_AddUserToGroup")]
internal abstract partial class WebPubSubApiControllerDefinition
{
    private const string SupportedApiVersions =
        "2021-10-01, 2022-11-01, 2023-07-01, 2024-01-01, 2024-12-01";

    [NonAction]
    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        Response.Headers["api-supported-versions"] = SupportedApiVersions;
        await next();
    }

    protected Task<IActionResult> NotImplementedAsync(string operationId)
    {
        return Task.FromResult<IActionResult>(StatusCode(
            StatusCodes.Status501NotImplemented,
            new
            {
                code = "NotImplemented",
                message = $"Operation '{operationId}' is not implemented by the emulator.",
            }));
    }
}
