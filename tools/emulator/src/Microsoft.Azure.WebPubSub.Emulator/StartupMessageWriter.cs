// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class StartupMessageWriter
{
    public static void Write(
        TextWriter writer,
        IReadOnlyList<string> addresses,
        string connectionString,
        Uri endpoint,
        bool showConnectionString)
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
        writer.WriteLine(showConnectionString
            ? $"  {connectionString}"
            : "  Configured (AccessKey hidden).");
        writer.WriteLine();
        writer.WriteLine("Client endpoint:");
        writer.WriteLine($"  {GetClientEndpoint(endpoint)}");
        writer.WriteLine();
        writer.WriteLine("Health:");
        foreach (var address in addresses)
        {
            writer.WriteLine($"  {address.TrimEnd('/')}/api/health");
        }
        writer.WriteLine();
        writer.WriteLine("Press Ctrl+C to stop the emulator.");
        writer.WriteLine("===================================================");
        writer.WriteLine();
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