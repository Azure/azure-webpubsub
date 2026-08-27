// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Azure.WebPubSub.Emulator;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

var app = EmulatorApplication.Build(args);
app.Lifetime.ApplicationStarted.Register(() => WriteStartupMessage(app));
await app.RunAsync();

static void WriteStartupMessage(WebApplication app)
{
    var server = app.Services.GetRequiredService<IServer>();
    var addresses = server.Features
        .Get<IServerAddressesFeature>()?
        .Addresses
        .OrderBy(address => address, StringComparer.Ordinal)
        .ToArray() ?? [];

    var options = app.Services.GetRequiredService<IOptions<EmulatorOptions>>().Value;
    var tokenService = app.Services.GetRequiredService<WebPubSubTokenService>();
    StartupMessageWriter.Write(
        Console.Out,
        addresses,
        options.ConnectionString,
        tokenService.Endpoint,
        string.Equals(
            options.ConnectionString,
            EmulatorOptions.DefaultConnectionString,
            StringComparison.Ordinal));
}

partial class Program;
