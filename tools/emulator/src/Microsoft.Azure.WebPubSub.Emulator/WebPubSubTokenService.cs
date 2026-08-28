// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class WebPubSubTokenService
{
    internal const string ClientPathPrefix = "/client/hubs/";

    private readonly JwtSecurityTokenHandler _handler = new();
    private readonly Uri _endpoint;
    private readonly SymmetricSecurityKey _signingKey;
    private readonly ILogger<WebPubSubTokenService> _logger;

    public WebPubSubTokenService(
        IOptions<EmulatorOptions> options,
        ILogger<WebPubSubTokenService> logger)
    {
        (_endpoint, var accessKey) = ParseRequiredConnectionString(options.Value.ConnectionString);
        _signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(accessKey));
        _logger = logger;
    }

    internal Uri Endpoint => _endpoint;

    public ClaimsPrincipal ValidateClientToken(string hub, string token)
    {
        try
        {
            return _handler.ValidateToken(token, CreateValidationParameters(GetClientAudience(hub)), out _);
        }
        catch (Exception exception) when (exception is SecurityTokenException or ArgumentException)
        {
            _logger.LogDebug(exception, "Client access token validation failed for hub {Hub}.", hub);
            throw;
        }
    }

    internal static bool IsValidConnectionString(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return false;
        }

        try
        {
            _ = ParseRequiredConnectionString(connectionString);
            return true;
        }
        catch (Exception exception) when (exception is InvalidOperationException or UriFormatException)
        {
            return false;
        }
    }

    private TokenValidationParameters CreateValidationParameters(string audience)
    {
        return new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = true,
            ValidAudience = audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = _signingKey,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(5),
        };
    }

    private string GetClientAudience(string hub)
    {
        return new Uri(
            _endpoint,
            $"{ClientPathPrefix.TrimStart('/')}{Uri.EscapeDataString(hub)}").AbsoluteUri;
    }

    private static (Uri Endpoint, string AccessKey) ParseRequiredConnectionString(string connectionString)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var part in connectionString.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = part.IndexOf('=');
            if (separator <= 0 || separator == part.Length - 1)
            {
                throw new InvalidOperationException("ConnectionString is invalid.");
            }

            values[part[..separator].Trim()] = part[(separator + 1)..].Trim();
        }

        if (!values.TryGetValue("Endpoint", out var endpoint) || string.IsNullOrWhiteSpace(endpoint))
        {
            throw new InvalidOperationException("ConnectionString must contain Endpoint.");
        }
        if (!values.TryGetValue("AccessKey", out var accessKey) || string.IsNullOrWhiteSpace(accessKey))
        {
            throw new InvalidOperationException("ConnectionString must contain AccessKey.");
        }

        var endpointUri = new Uri(endpoint, UriKind.Absolute);
        if ((!endpointUri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) &&
            !endpointUri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)) ||
            endpointUri.AbsolutePath != "/" ||
            !string.IsNullOrEmpty(endpointUri.Query) ||
            !string.IsNullOrEmpty(endpointUri.Fragment))
        {
            throw new InvalidOperationException(
                "ConnectionString Endpoint must be an HTTP or HTTPS origin without a path, query, or fragment.");
        }

        return (endpointUri, accessKey);
    }
}