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
    var addresses = app.Services
        .GetRequiredService<IServer>()
        .Features
        .Get<IServerAddressesFeature>()?
        .Addresses
        .OrderBy(address => address, StringComparer.Ordinal)
        .ToArray() ?? [];
    if (addresses.Length == 0)
    {
        throw new InvalidOperationException("The emulator server did not report a bound address.");
    }

    var endpoint = new Uri(addresses[0]);
    var options = app.Services.GetRequiredService<IOptions<EmulatorOptions>>().Value;
    StartupMessageWriter.Write(
        Console.Out,
        addresses,
        options.GetConnectionString(endpoint),
        endpoint);
}

partial class Program;
