// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;

using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json;

namespace Microsoft.Azure.WebJobs.Extensions.WebPubSub
{
    internal static class Utilities
    {
        private const int MaxTokenLength = 4096;
        private static readonly char[] HeaderSeparator = { ',' };

        private static readonly JwtSecurityTokenHandler JwtTokenHandler = new JwtSecurityTokenHandler();

        public static MediaTypeHeaderValue GetMediaType(MessageDataType dataType) =>
            dataType switch
            {
                MessageDataType.Binary => new MediaTypeHeaderValue(Constants.ContentTypes.BinaryContentType),
                MessageDataType.Text => new MediaTypeHeaderValue(Constants.ContentTypes.PlainTextContentType),
                MessageDataType.Json => new MediaTypeHeaderValue(Constants.ContentTypes.JsonContentType),
                // Default set binary type to align with service side logic
                _ => new MediaTypeHeaderValue(Constants.ContentTypes.BinaryContentType)
            };

        public static MessageDataType GetDataType(string mediaType) =>
            mediaType switch
            {
                Constants.ContentTypes.BinaryContentType => MessageDataType.Binary,
                Constants.ContentTypes.JsonContentType => MessageDataType.Json,
                Constants.ContentTypes.PlainTextContentType => MessageDataType.Text,
                _ => throw new ArgumentException($"{Constants.ErrorMessages.NotSupportedDataType}{mediaType}")
            };

        public static string GetEventType(string ceType)
        {
            return ceType.StartsWith(Constants.Headers.CloudEvents.TypeSystemPrefix) ?
                Constants.EventTypes.System :
                Constants.EventTypes.User;
        }

        public static bool IsSyncMethod(string eventType, string eventName)
            => eventType.Equals(Constants.EventTypes.User) ||
            (eventType.Equals(Constants.EventTypes.System) && eventName.Equals(Constants.Events.ConnectEvent));

        public static (string EndPoint, string AccessKey, string Version, string Port) ParseConnectionString(string connectionString)
        {
            if (string.IsNullOrEmpty(connectionString))
            {
                throw new ArgumentException("Web PubSub Service connection string is empty");
            }

            var endpointMatch = Regex.Match(connectionString, @"endpoint=([^;]+)", RegexOptions.IgnoreCase);
            if (!endpointMatch.Success)
            {
                throw new ArgumentException("No endpoint present in Web PubSub Service connection string");
            }
            var accessKeyMatch = Regex.Match(connectionString, @"accesskey=([^;]+)", RegexOptions.IgnoreCase);
            if (!accessKeyMatch.Success)
            {
                throw new ArgumentException("No access key present in Web PubSub Service connection string");
            }
            var versionKeyMatch = Regex.Match(connectionString, @"version=([^;]+)", RegexOptions.IgnoreCase);
            if (versionKeyMatch.Success && !System.Version.TryParse(versionKeyMatch.Groups[1].Value, out var version))
            {
                throw new ArgumentException("Invalid version format in Web PubSub Service connection string");
            }
            var portKeyMatch = Regex.Match(connectionString, @"port=([^;]+)", RegexOptions.IgnoreCase);
            var port = portKeyMatch.Success ? portKeyMatch.Groups[1].Value : string.Empty;

            return (endpointMatch.Groups[1].Value, accessKeyMatch.Groups[1].Value, versionKeyMatch.Groups[1].Value, port);
        }

        public static HttpResponseMessage BuildResponse(MessageResponse response)
        {
            HttpResponseMessage result = new HttpResponseMessage();

            if (response.Error != null)
            {
                return BuildErrorResponse(response.Error);
            }

            result.Content = new StreamContent(response.Message.GetStream());
            result.Content.Headers.ContentType = GetMediaType(response.Message.DataType);

            return result;
        }

        public static HttpResponseMessage BuildResponse(ConnectResponse response)
        {
            HttpResponseMessage result = new HttpResponseMessage();

            if (response.Error != null)
            {
                return BuildErrorResponse(response.Error);
            }

            var connectEvent = new ConnectEventResponse
            {
                UserId = response.UserId,
                Groups = response.Groups,
                Subprotocol = response.Subprotocol,
                Roles = response.Roles
            };
            result.Content = new StringContent(JsonConvert.SerializeObject(connectEvent));

            return result;
        }

        public static HttpResponseMessage BuildErrorResponse(Error error)
        {
            HttpResponseMessage result = new HttpResponseMessage();

            result.StatusCode = GetStatusCode(error.Code);
            result.Content = new StringContent(error.Message);
            return result;
        }

        public static HttpStatusCode GetStatusCode(ErrorCode errorCode) =>
            errorCode switch
            {
                ErrorCode.UserError => HttpStatusCode.BadRequest,
                ErrorCode.Unauthorized => HttpStatusCode.Unauthorized,
                ErrorCode.ServerError => HttpStatusCode.InternalServerError,
                _ => HttpStatusCode.InternalServerError
            };

        public static string GenerateJwtBearer(
            string issuer = null,
            string audience = null,
            IEnumerable<Claim> claims = null,
            DateTime? expires = null,
            string signingKey = null,
            DateTime? issuedAt = null,
            DateTime? notBefore = null)
        {
            var subject = claims == null ? null : new ClaimsIdentity(claims);
            return GenerateJwtBearer(issuer, audience, subject, expires, signingKey, issuedAt, notBefore);
        }

        public static string GenerateAccessToken(string signingKey, string audience, IEnumerable<Claim> claims, TimeSpan lifetime)
        {
            var expire = DateTime.UtcNow.Add(lifetime);

            var jwtToken = GenerateJwtBearer(
                audience: audience,
                claims: claims,
                expires: expire,
                signingKey: signingKey
            );

            if (jwtToken.Length > MaxTokenLength)
            {
                throw new ArgumentException("AccessToken too long.");
            }

            return jwtToken;
        }

        private static string GenerateJwtBearer(
            string issuer = null,
            string audience = null,
            ClaimsIdentity subject = null,
            DateTime? expires = null,
            string signingKey = null,
            DateTime? issuedAt = null,
            DateTime? notBefore = null)
        {
            SigningCredentials credentials = null;
            if (!string.IsNullOrEmpty(signingKey))
            {
                // Refer: https://github.com/AzureAD/azure-activedirectory-identitymodel-extensions-for-dotnet/releases/tag/5.5.0
                // From version 5.5.0, SignatureProvider caching is turned On by default, assign KeyId to enable correct cache for same SigningKey
                var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
                securityKey.KeyId = signingKey.GetHashCode().ToString();
                credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
            }

            var token = JwtTokenHandler.CreateJwtSecurityToken(
                issuer: issuer,
                audience: audience,
                subject: subject,
                notBefore: notBefore,
                expires: expires,
                issuedAt: issuedAt,
                signingCredentials: credentials);
            return JwtTokenHandler.WriteToken(token);
        }

        public static IReadOnlyList<string> GetSignatureList(string signatures)
        {
            if (string.IsNullOrEmpty(signatures))
            {
                return default;
            }

            return signatures.Split(HeaderSeparator, StringSplitOptions.RemoveEmptyEntries);
        }

        public static PropertyInfo[] GetProperties(Type type)
        {
            return type.GetProperties(BindingFlags.IgnoreCase | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
        }

        public static PropertyInfo GetProperty(Type type, string name)
        {
            return type.GetProperty(name, BindingFlags.IgnoreCase | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
        }

        public static IReadOnlyList<string> GetTypeNames(Type type)
        {
            var properties = GetProperties(type);
            var names = new List<string>();

            Array.ForEach(properties, x => names.Add(x.Name));
            return names;
        }

        public static string FirstOrDefault(params string[] values)
        {
            return values.FirstOrDefault(v => !string.IsNullOrEmpty(v));
        }

        public static string GetProductInfo()
        {
            var assembly = typeof(WebPubSubService).GetTypeInfo().Assembly;
            var packageId = assembly.GetName().Name;
            var version = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>().InformationalVersion;
            var runtime = RuntimeInformation.FrameworkDescription?.Trim();
            var operatingSystem = RuntimeInformation.OSDescription?.Trim();
            var processorArchitecture = RuntimeInformation.ProcessArchitecture.ToString().Trim();

            return $"{packageId}/{version} ({runtime}; {operatingSystem}; {processorArchitecture})";
        }
    }
}
