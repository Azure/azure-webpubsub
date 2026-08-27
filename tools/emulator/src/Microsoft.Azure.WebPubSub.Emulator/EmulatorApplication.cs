// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Reflection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class EmulatorApplication
{
    internal static WebApplicationBuilder CreateBuilder(
        string[]? args = null,
        EmulatorRuntimeOptions? runtimeOptions = null)
    {
        var builder = WebApplication.CreateBuilder(args ?? []);
        builder.Configuration[WebHostDefaults.ServerUrlsKey] ??= "http://localhost:8080";
        builder.Services
            .AddOptions<EmulatorOptions>()
            .Bind(builder.Configuration.GetSection(EmulatorOptions.SectionName))
            .Validate(
                options => WebPubSubTokenService.IsValidConnectionString(options.ConnectionString),
                "WebPubSub:ConnectionString must contain a valid Endpoint and AccessKey.")
            .ValidateOnStart();
        builder.Services.AddSingleton(runtimeOptions ?? new EmulatorRuntimeOptions());
        builder.Services.AddSingleton<WebPubSubTokenService>();
        builder.Services.AddSingleton<ConnectionManager>();
        builder.Services.AddSingleton<SimpleWebSocketPayloadProcessor>();
        builder.Services.AddSingleton<ClientPayloadProcessorFactory>();
        builder.Services.AddSingleton<ClientConnectionHandler>();
        builder.Services.AddSingleton<ClientWebSocketEndpoint>();
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

        app.UseWebSockets();
        app.MapControllers();
        app.Map(
            $"{WebPubSubTokenService.ClientPathPrefix}{{hub}}",
            (HttpContext context, ClientWebSocketEndpoint endpoint) => endpoint.HandleAsync(context));

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
