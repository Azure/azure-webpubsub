// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Reflection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc;
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
                options => EmulatorOptions.IsValidAccessKey(options.AccessKey),
                "WebPubSub:AccessKey must be at least 32 UTF-8 bytes and cannot contain " +
                    "leading or trailing whitespace, semicolons, or control characters.")
            .ValidateOnStart();
        builder.Services.AddSingleton(runtimeOptions ?? new EmulatorRuntimeOptions());
        builder.Services.AddSingleton<WebPubSubTokenService>();
        builder.Services.AddSingleton<ConnectionManager>();
        builder.Services.AddSingleton<SimpleWebSocketPayloadProcessor>();
        builder.Services.AddSingleton<WebPubSubJsonV1Protocol>();
        builder.Services.AddSingleton<
            IWebPubSubConnectionLifetimeHandler,
            WebPubSubClientConnectionLifetimeHandler>();
        builder.Services.AddSingleton<WebPubSubJsonV1PayloadProcessor>();
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
        builder.Services.Configure<ApiBehaviorOptions>(options =>
        {
            options.InvalidModelStateResponseFactory = context =>
            {
                var error = context.ModelState.Values
                    .SelectMany(value => value.Errors)
                    .Select(value => value.ErrorMessage)
                    .FirstOrDefault(message => !string.IsNullOrEmpty(message)) ??
                    "The request parameters are invalid.";
                return new BadRequestObjectResult(new
                {
                    code = "Error.BadRequest",
                    message = error,
                    target = "Request",
                });
            };
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
