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
    var connectionString = app.Services
        .GetRequiredService<IOptions<EmulatorOptions>>()
        .Value
        .ConnectionString;

    Console.WriteLine();
    Console.WriteLine("===================================================");
    Console.WriteLine("Azure Web PubSub Emulator is ready.");
    Console.WriteLine();
    Console.WriteLine("Listening on:");
    foreach (var address in addresses)
    {
        Console.WriteLine($"  {address}");
    }
    Console.WriteLine();
    Console.WriteLine("Health:");
    foreach (var address in addresses)
    {
        Console.WriteLine($"  {address.TrimEnd('/')}/health");
    }
    Console.WriteLine();
    Console.WriteLine("Connection string:");
    Console.WriteLine($"  {connectionString}");
    Console.WriteLine();
    Console.WriteLine("Press Ctrl+C to stop the emulator.");
    Console.WriteLine("===================================================");
    Console.WriteLine();
}

partial class Program;
