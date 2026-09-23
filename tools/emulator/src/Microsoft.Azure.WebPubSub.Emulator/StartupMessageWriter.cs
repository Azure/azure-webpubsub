// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class StartupMessageWriter
{
    public static void Write(
        TextWriter writer,
        IReadOnlyList<string> addresses,
        string connectionString,
        Uri endpoint)
    {
        writer.WriteLine();
        writer.WriteLine("===================================================");
        writer.WriteLine("Azure Web PubSub Emulator is ready.");
        writer.WriteLine();
        writer.WriteLine("Listening on:");
        foreach (var address in addresses)
        {
            writer.WriteLine($"  {address}");
        }
        writer.WriteLine();
        writer.WriteLine("Connection string:");
        writer.WriteLine($"  {connectionString}");
        writer.WriteLine();
        writer.WriteLine("Client endpoint:");
        writer.WriteLine($"  {GetClientEndpoint(endpoint)}");
        writer.WriteLine();
        writer.WriteLine("Health:");
        foreach (var address in addresses)
        {
            writer.WriteLine($"  {GetConnectableEndpoint(new Uri(address)).GetLeftPart(UriPartial.Authority)}/api/health");
        }
        writer.WriteLine();
        if (addresses.Any(address => GetConnectableEndpoint(new Uri(address)) != new Uri(address)))
        {
            writer.WriteLine("For remote clients or containers, use the reachable host and published port instead of localhost.");
            writer.WriteLine();
        }
        writer.WriteLine("Press Ctrl+C to stop the emulator.");
        writer.WriteLine("===================================================");
        writer.WriteLine();
    }

    internal static Uri GetConnectableEndpoint(Uri endpoint)
    {
        return endpoint.Host is "0.0.0.0" or "[::]"
            ? new UriBuilder(endpoint) { Host = "localhost" }.Uri
            : endpoint;
    }

    private static string GetClientEndpoint(Uri endpoint)
    {
        var scheme = endpoint.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            ? "wss"
            : "ws";
        return $"{scheme}://{endpoint.Authority}" +
            $"{WebPubSubTokenService.ClientPathPrefix}{{hub}}?access_token={{token}}";
    }
}