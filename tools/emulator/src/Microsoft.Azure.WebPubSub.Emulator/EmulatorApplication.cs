// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Reflection;
using Azure.Core;
using Azure.Identity;
using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Producer;
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
        builder.Services.AddOptions<EmulatorOptions>()
            .Configure<ILogger<HubSettingsConfiguration>>((options, logger) =>
            {
                try
                {
                    builder.Configuration.GetSection(EmulatorOptions.SectionName).Bind(options,
                        binder => binder.ErrorOnUnknownConfiguration = true);
                    options.Validate();
                }
                catch (Exception exception) when (exception is OptionsValidationException or InvalidOperationException or ArgumentException)
                {
                    var reason = exception is OptionsValidationException validation
                        ? string.Join(" ", validation.Failures)
                        : "Check configuration property names and value types.";
                    logger.LogWarning("Invalid WebPubSub configuration: {Reason} New settings were not applied.", reason);
                    throw;
                }
            })
            .ValidateOnStart();
        builder.Services.AddSingleton<IOptionsChangeTokenSource<EmulatorOptions>>(
            new ConfigurationChangeTokenSource<EmulatorOptions>(builder.Configuration));
        builder.Services.AddSingleton<HubSettingsConfiguration>();
        builder.Services.AddHostedService(services => services.GetRequiredService<HubSettingsConfiguration>());
        builder.Services.AddSingleton<TokenCredential>(_ => new DefaultAzureCredential());
        builder.Services.AddSingleton<Func<EventHubEndpointOptions, EventHubProducerClient>>(services => endpoint =>
            endpoint.ConnectionString is { } local
                ? new EventHubProducerClient(local, endpoint.EventHubName)
                : new EventHubProducerClient(endpoint.FullyQualifiedNamespace, endpoint.EventHubName,
                    services.GetRequiredService<TokenCredential>(), new EventHubProducerClientOptions
                    {
                        ConnectionOptions = new EventHubConnectionOptions { TransportType = EventHubsTransportType.AmqpWebSockets },
                    }));
        builder.Services.AddSingleton<EventHubNotifier>();
        builder.Services.AddSingleton(runtimeOptions ?? new EmulatorRuntimeOptions());
        builder.Services.AddSingleton<WebPubSubTokenService>();
        builder.Services.AddSingleton<ConnectionManager>();
        builder.Services.AddSingleton<SimpleWebSocketPayloadProcessor>();
        builder.Services.AddSingleton<WebPubSubJsonV1Protocol>();
        builder.Services.AddSingleton<WebPubSubProtobufV1Protocol>();
        builder.Services.AddSingleton<HttpUpstreamTrigger>();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<AbuseProtector>();
        builder.Services.AddSingleton<UpstreamEventDispatcher>();
        builder.Services.AddHttpClient(HttpUpstreamTrigger.HttpClientName)
            .AddPolicyHandler(CustomerOutboundConfiguration.CreateRetryPolicy())
            .ConfigurePrimaryHttpMessageHandler(CustomerOutboundConfiguration.ConfigureHttpMessageHandler);
        builder.Services.AddSingleton<
            IWebPubSubConnectionLifetimeHandler,
            WebPubSubClientConnectionLifetimeHandler>();
        builder.Services.AddSingleton<WebPubSubJsonV1PayloadProcessor>();
        builder.Services.AddSingleton<WebPubSubProtobufV1PayloadProcessor>();
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
