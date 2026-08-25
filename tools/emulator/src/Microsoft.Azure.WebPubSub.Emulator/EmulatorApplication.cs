// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Reflection;
using Azure.Core;
using Azure.Identity;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
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
                options => !string.IsNullOrWhiteSpace(options.ConnectionString),
                $"{EmulatorOptions.SectionName}:ConnectionString is required.")
            .Validate(
                ValidateEventConfiguration,
                $"{EmulatorOptions.SectionName} event handler or event listener configuration is invalid.")
            .ValidateOnStart();

        builder.Services.AddSingleton(runtimeOptions ?? new EmulatorRuntimeOptions());
        builder.Services.AddSingleton<TokenCredential>(services =>
        {
            var options = services.GetRequiredService<IOptions<EmulatorOptions>>().Value;
            return new DefaultAzureCredential(new DefaultAzureCredentialOptions
            {
                ManagedIdentityClientId = options.ManagedIdentityClientId,
            });
        });
        builder.Services.AddSingleton<WebPubSubTokenService>();
        builder.Services.AddSingleton<ConnectionManager>();
        builder.Services.AddSingleton<IEventHubPublisher, EventHubPublisher>();
        builder.Services.AddSingleton<UpstreamEventDispatcher>();
        builder.Services.AddSingleton<WebSocketEndpoint>();
        builder.Services.AddHttpClient(UpstreamEventDispatcher.HttpClientName, client =>
        {
            client.Timeout = Timeout.InfiniteTimeSpan;
        });
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
        app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));
        app.Map("/client/hubs/{hub}", async context =>
        {
            await context.RequestServices.GetRequiredService<WebSocketEndpoint>().HandleAsync(context);
        });
        app.MapControllers();

        return app;
    }

    private static bool ValidateEventConfiguration(EmulatorOptions options)
    {
        if (options.EventHandlerTimeout <= TimeSpan.Zero)
        {
            return false;
        }

        foreach (var hub in options.Hubs.Values)
        {
            foreach (var handler in hub.EventHandlers)
            {
                var resolvedUrl = handler.UrlTemplate
                    .Replace("{hub}", "hub", StringComparison.OrdinalIgnoreCase)
                    .Replace("{event}", "event", StringComparison.OrdinalIgnoreCase);
                if (!Uri.TryCreate(resolvedUrl, UriKind.Absolute, out var uri) ||
                    uri.Scheme is not ("http" or "https") ||
                    handler.EventPattern?.Split(',')
                        .Select(pattern => pattern.Trim())
                        .Any(pattern => !WildcardPattern.TryCreate(pattern, out _)) == true)
                {
                    return false;
                }

                var auth = handler.Auth;
                if (auth is not null &&
                    !string.Equals(auth.Type, "None", StringComparison.OrdinalIgnoreCase) &&
                    (!string.Equals(auth.Type, "ManagedIdentity", StringComparison.OrdinalIgnoreCase) ||
                        string.IsNullOrWhiteSpace(auth.ManagedIdentity?.Resource)))
                {
                    return false;
                }
            }

            foreach (var listener in hub.EventListeners)
            {
                var endpoint = listener.EventHubEndpoint;
                if (string.IsNullOrWhiteSpace(endpoint.FullyQualifiedNamespace) ||
                    string.IsNullOrWhiteSpace(endpoint.EventHubName))
                {
                    return false;
                }
            }
        }
        return true;
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
