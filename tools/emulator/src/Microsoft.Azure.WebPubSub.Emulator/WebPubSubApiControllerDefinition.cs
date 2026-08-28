// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Microsoft.Azure.WebPubSub.Emulator;

[WebPubSubApi("2024-12-01")]
[WebPubSubApiOperation("HEAD", "/api/health", "HealthApi_GetServiceStatus")]
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