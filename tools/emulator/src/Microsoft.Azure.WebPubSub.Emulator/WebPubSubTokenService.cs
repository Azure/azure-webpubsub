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
    private const string WebPubSubAudience = "https://webpubsub.azure.com";

    private readonly JwtSecurityTokenHandler _handler = new();
    private readonly SymmetricSecurityKey _signingKey;
    private readonly bool _allowUnvalidatedEntraTokens;
    private readonly TimeSpan _reconnectionTokenLifetime;
    private readonly ILogger<WebPubSubTokenService> _logger;

    public WebPubSubTokenService(
        IOptions<EmulatorOptions> options,
        EmulatorRuntimeOptions runtimeOptions,
        ILogger<WebPubSubTokenService> logger)
    {
        var emulatorOptions = options.Value;
        _signingKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(emulatorOptions.AccessKey));
        _allowUnvalidatedEntraTokens = emulatorOptions.AllowUnvalidatedEntraTokens;
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

    public ClaimsPrincipal ValidateClientToken(Uri endpoint, string hub, string token)
    {
        try
        {
            return _handler.ValidateToken(
                token,
                CreateValidationParameters(GetClientAudience(endpoint, hub)),
                out _);
        }
        catch (Exception exception) when (exception is SecurityTokenException or ArgumentException)
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
            _logger.LogDebug(
                exception,
                "REST access token could not be parsed for {Path}.",
                requestUri.AbsolutePath);
            return false;
        }

        if (jwt.Audiences.Contains(WebPubSubAudience, StringComparer.Ordinal))
        {
            if (!_allowUnvalidatedEntraTokens)
            {
                _logger.LogDebug(
                    "Rejected an Azure Web PubSub audience token because unvalidated Entra token " +
                    "compatibility is disabled.");
                return false;
            }

            var now = DateTime.UtcNow;
            return jwt.ValidFrom <= now.AddMinutes(5) &&
                jwt.ValidTo >= now.Subtract(TimeSpan.FromMinutes(5));
        }

        try
        {
            _handler.ValidateToken(
                token,
                CreateValidationParameters(requestUri.AbsoluteUri),
                out _);
            return true;
        }
        catch (Exception exception) when (
            exception is SecurityTokenException or ArgumentException)
        {
            _logger.LogDebug(
                exception,
                "REST access token validation failed for {Path}.",
                requestUri.AbsolutePath);
            return false;
        }
    }

    public string IssueReconnectionToken(string connectionId)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: WebPubSubAudience,
            audience: connectionId,
            claims: [new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))],
            notBefore: now,
            expires: now.Add(_reconnectionTokenLifetime),
            signingCredentials: new SigningCredentials(
                _signingKey,
                SecurityAlgorithms.HmacSha256));
        return _handler.WriteToken(token);
    }

    public bool ValidateReconnectionToken(string connectionId, string token)
    {
        try
        {
            var parameters = CreateValidationParameters(connectionId);
            parameters.ValidateIssuer = true;
            parameters.ValidIssuer = WebPubSubAudience;
            parameters.ClockSkew = TimeSpan.Zero;
            _handler.ValidateToken(token, parameters, out _);
            return true;
        }
        catch (Exception exception) when (
            exception is SecurityTokenException or ArgumentException)
        {
            _logger.LogDebug(
                exception,
                "Reconnection token validation failed for connection {ConnectionId}.",
                connectionId);
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

    private static string GetClientAudience(Uri endpoint, string hub)
    {
        return new Uri(
            endpoint,
            $"{ClientPathPrefix.TrimStart('/')}{Uri.EscapeDataString(hub)}").AbsoluteUri;
    }
}