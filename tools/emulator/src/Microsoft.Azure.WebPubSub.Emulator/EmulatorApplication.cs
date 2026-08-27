// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class EmulatorApplication
{
    internal static WebApplicationBuilder CreateBuilder(
        string[]? args = null)
    {
        var builder = WebApplication.CreateBuilder(args ?? []);
        builder.Configuration[WebHostDefaults.ServerUrlsKey] ??= "http://localhost:8080";
        return builder;
    }

    internal static WebApplication Build(string[]? args = null)
    {
        return Build(CreateBuilder(args));
    }

    internal static WebApplication Build(WebApplicationBuilder builder)
    {
        var app = builder.Build();

        app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));

        return app;
    }
}
