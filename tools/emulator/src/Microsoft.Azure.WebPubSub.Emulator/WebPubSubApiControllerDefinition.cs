// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Microsoft.Azure.WebPubSub.Emulator;

[WebPubSubApi("2024-12-01")]
[WebPubSubApiOperation("HEAD", "/api/health", "HealthApi_GetServiceStatus")]
[WebPubSubApiOperation(
    "HEAD",
    "/api/hubs/{hub}/connections/{connectionId}",
    "WebPubSub_ConnectionExists")]
[WebPubSubApiOperation(
    "POST",
    "/api/hubs/{hub}/connections/{connectionId}/:send",
    "WebPubSub_SendToConnection")]
internal abstract partial class WebPubSubApiControllerDefinition
{
    private const string SupportedApiVersionsHeader =
        "2021-10-01, 2022-11-01, 2023-07-01, 2024-01-01, 2024-12-01";
    private static readonly HashSet<string> SupportedApiVersions = new(StringComparer.Ordinal)
    {
        "2021-10-01",
        "2022-11-01",
        "2023-07-01",
        "2024-01-01",
        "2024-12-01",
    };

    [NonAction]
    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        Response.Headers["api-supported-versions"] = SupportedApiVersionsHeader;
        if (Request.Query.TryGetValue("api-version", out var versions) &&
            (versions.Count != 1 || !SupportedApiVersions.Contains(versions[0]!)))
        {
            context.Result = CreateBadRequest(
                "The specified API version is not supported.",
                "api-version");
            return;
        }

        await next();
    }

    protected IActionResult CreateBadRequest(string message, string target = "Request")
    {
        return BadRequest(new
        {
            code = "Error.BadRequest",
            message,
            target,
        });
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