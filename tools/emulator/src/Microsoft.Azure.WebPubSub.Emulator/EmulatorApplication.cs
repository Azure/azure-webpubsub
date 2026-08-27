// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Reflection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class EmulatorApplication
{
    internal static WebApplicationBuilder CreateBuilder(
        string[]? args = null)
    {
        var builder = WebApplication.CreateBuilder(args ?? []);
        builder.Configuration[WebHostDefaults.ServerUrlsKey] ??= "http://localhost:8080";
        builder.Services
            .AddControllers()
            .AddApplicationPart(typeof(WebPubSubEmulatorController).Assembly)
            .ConfigureApplicationPartManager(manager =>
            {
                manager.FeatureProviders.Add(new EmulatorControllerFeatureProvider());
            });
        return builder;
    }

    internal static WebApplication Build(string[]? args = null)
    {
        return Build(CreateBuilder(args));
    }

    internal static WebApplication Build(WebApplicationBuilder builder)
    {
        var app = builder.Build();

        app.MapControllers();

        return app;
    }

    private sealed class EmulatorControllerFeatureProvider : ControllerFeatureProvider
    {
        protected override bool IsController(TypeInfo typeInfo)
        {
            var isEmulatorController = !typeInfo.IsAbstract &&
                typeof(WebPubSubEmulatorController).IsAssignableFrom(typeInfo);
            return isEmulatorController || base.IsController(typeInfo);
        }
    }
}
