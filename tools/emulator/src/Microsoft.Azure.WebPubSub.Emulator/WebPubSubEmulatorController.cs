// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.AspNetCore.Mvc;

namespace Microsoft.Azure.WebPubSub.Emulator;

[ApiController]
internal sealed class WebPubSubEmulatorController : WebPubSubApiControllerDefinition
{
    public override Task<IActionResult> GetServiceStatus(
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult<IActionResult>(Ok());
    }
}