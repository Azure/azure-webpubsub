// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal sealed class WebPubSubTokenService
{
    private const string ReconnectIssuer = "azure-webpubsub-emulator";
    private const string WebPubSubAudience = "https://webpubsub.azure.com";

    private readonly JwtSecurityTokenHandler _handler = new();
    private readonly Uri _endpoint;
    private readonly SymmetricSecurityKey _signingKey;
    private readonly bool _allowUnvalidatedEntraTokens;
    private readonly TimeSpan _reconnectionTokenLifetime;
    private readonly ILogger<WebPubSubTokenService> _logger;

    public WebPubSubTokenService(
        IOptions<EmulatorOptions> options,
        EmulatorRuntimeOptions runtimeOptions,
        ILogger<WebPubSubTokenService> logger)
    {
        (_endpoint, var accessKey) = ParseRequiredConnectionString(options.Value.ConnectionString);
        _signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(accessKey))
        {
            KeyId = accessKey.GetHashCode().ToString(),
        };
        _allowUnvalidatedEntraTokens = options.Value.AllowUnvalidatedEntraTokens;
        _reconnectionTokenLifetime = runtimeOptions.ReconnectionTokenLifetime;
        _logger = logger;

        if (_allowUnvalidatedEntraTokens)
        {
            _logger.LogWarning(
                "WebPubSub:AllowUnvalidatedEntraTokens is enabled. Azure Web PubSub audience tokens " +
                "will be accepted without validating their signature, algorithm, issuer, tenant, " +
                "identity, or RBAC assignments. Use this setting only for trusted local development.");
        }
    }

    public ClaimsPrincipal ValidateClientToken(string hub, string token)
    {
        try
        {
            return _handler.ValidateToken(token, CreateValidationParameters(GetClientAudience(hub)), out _);
        }
        catch (Exception exception) when (
            exception is SecurityTokenException or ArgumentException)
        {
            _logger.LogDebug(exception, "Client access token validation failed for hub {Hub}.", hub);
            throw;
        }
    }

    public bool ValidateRestToken(Uri requestUri, string token)
    {
        JwtSecurityToken jwt;
        try
        {
            jwt = _handler.ReadJwtToken(token);
        }
        catch (ArgumentException exception)
        {
            _logger.LogDebug(exception, "REST access token could not be parsed for {Path}.", requestUri.AbsolutePath);
            return false;
        }

        if (HasWebPubSubAudience(jwt))
        {
            if (!_allowUnvalidatedEntraTokens)
            {
                _logger.LogDebug(
                    "Rejected an Azure Web PubSub audience token because unvalidated Entra token " +
                    "compatibility is disabled.");
                return false;
            }

            return ValidateUntrustedWebPubSubToken(jwt);
        }

        try
        {
            _handler.ValidateToken(token, CreateValidationParameters(GetRestAudience(requestUri)), out _);
            return true;
        }
        catch (SecurityTokenInvalidAudienceException exception)
        {
            var audiences = _handler.ReadJwtToken(token).Audiences;
            _logger.LogDebug(
                exception,
                "REST access token audience {Audience} did not match {ExpectedAudience}.",
                string.Join(",", audiences),
                GetRestAudience(requestUri));
        }
        catch (SecurityTokenException exception)
        {
            _logger.LogDebug(exception, "REST access token validation failed for {Path}.", requestUri.AbsolutePath);
        }
        catch (ArgumentException exception)
        {
            _logger.LogDebug(exception, "REST access token validation failed for {Path}.", requestUri.AbsolutePath);
        }

        return false;
    }

    public string IssueClientToken(
        string hub,
        string? userId,
        IEnumerable<string> roles,
        IEnumerable<string> groups,
        TimeSpan lifetime)
    {
        var now = DateTime.UtcNow;
        var claims = new List<Claim>();
        if (!string.IsNullOrEmpty(userId))
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Sub, userId));
        }
        claims.AddRange(roles.Select(role => new Claim("role", role)));
        claims.AddRange(groups.Select(group => new Claim("webpubsub.group", group)));

        var token = new JwtSecurityToken(
            audience: GetClientAudience(hub),
            claims: claims,
            notBefore: now,
            expires: now.Add(lifetime),
            signingCredentials: new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256));
        return _handler.WriteToken(token);
    }

    public string IssueReconnectionToken(string connectionId)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: ReconnectIssuer,
            audience: connectionId,
            notBefore: now,
            expires: now.Add(_reconnectionTokenLifetime),
            signingCredentials: new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256));
        return _handler.WriteToken(token);
    }

    public bool ValidateReconnectionToken(string connectionId, string token)
    {
        try
        {
            var parameters = CreateValidationParameters(connectionId);
            parameters.ValidateIssuer = true;
            parameters.ValidIssuer = ReconnectIssuer;
            _handler.ValidateToken(token, parameters, out _);
            return true;
        }
        catch (SecurityTokenException)
        {
            return false;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    internal static string GetRequiredConnectionStringValue(string connectionString, string name)
    {
        return GetRequiredValue(ParseConnectionString(connectionString), name);
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
        catch (Exception exception) when (
            exception is InvalidOperationException or UriFormatException)
        {
            return false;
        }
    }

    private static (Uri Endpoint, string AccessKey) ParseRequiredConnectionString(
        string connectionString)
    {
        var values = ParseConnectionString(connectionString);
        var endpoint = new Uri(GetRequiredValue(values, "Endpoint"), UriKind.Absolute);
        var accessKey = GetRequiredValue(values, "AccessKey");
        return (endpoint, accessKey);
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

    private bool ValidateUntrustedWebPubSubToken(JwtSecurityToken jwt)
    {
        var now = DateTime.UtcNow;
        var valid = jwt.Audiences.Contains(WebPubSubAudience, StringComparer.Ordinal) &&
            jwt.ValidFrom <= now.AddMinutes(5) &&
            jwt.ValidTo >= now.Subtract(TimeSpan.FromMinutes(5));
        return valid;
    }

    private static bool HasWebPubSubAudience(JwtSecurityToken jwt)
    {
        return jwt.Audiences.Contains(WebPubSubAudience, StringComparer.Ordinal);
    }

    private string GetClientAudience(string hub)
    {
        return new Uri(_endpoint, $"client/hubs/{Uri.EscapeDataString(hub)}").AbsoluteUri;
    }

    private string GetRestAudience(Uri requestUri)
    {
        var relativePath = requestUri.GetComponents(UriComponents.PathAndQuery, UriFormat.UriEscaped);
        return new Uri(_endpoint, relativePath).AbsoluteUri;
    }

    private static Dictionary<string, string> ParseConnectionString(string connectionString)
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

        return values;
    }

    private static string GetRequiredValue(IReadOnlyDictionary<string, string> values, string name)
    {
        if (!values.TryGetValue(name, out var value) || string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"ConnectionString must contain {name}.");
        }

        return value;
    }
}
