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

using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json;

namespace Microsoft.Azure.WebJobs.Extensions.WebPubSub
{
    internal static class Utilities
    {
        private const int MaxTokenLength = 4096;
        private static readonly char[] HeaderSeparator = { ',' };

        private static readonly JwtSecurityTokenHandler JwtTokenHandler = new JwtSecurityTokenHandler();

        public static MediaTypeHeaderValue GetMediaType(MessageDataType dataType) => new MediaTypeHeaderValue(GetContentType(dataType));

        public static string GetContentType(MessageDataType dataType) =>
            dataType switch
            {
                MessageDataType.Binary => Constants.ContentTypes.BinaryContentType,
                MessageDataType.Text => Constants.ContentTypes.PlainTextContentType,
                MessageDataType.Json => Constants.ContentTypes.JsonContentType,
                // Default set binary type to align with service side logic
                _ => Constants.ContentTypes.BinaryContentType
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

        public static HttpResponseMessage BuildResponse(MessageResponse response)
        {
            HttpResponseMessage result = new HttpResponseMessage();

            if (response.Message != null)
            {
                result.Content = new StreamContent(response.Message.ToStream());
            }
            result.Content.Headers.ContentType = GetMediaType(response.DataType);

            return result;
        }

        public static HttpResponseMessage BuildResponse(ConnectResponse response)
        {
            HttpResponseMessage result = new HttpResponseMessage();

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

        public static HttpResponseMessage BuildErrorResponse(ErrorResponse error)
        {
            HttpResponseMessage result = new HttpResponseMessage();

            result.StatusCode = GetStatusCode(error.Code);
            result.Content = new StringContent(error.ErrorMessage);
            return result;
        }

        public static HttpStatusCode GetStatusCode(WebPubSubErrorCode errorCode) =>
            errorCode switch
            {
                WebPubSubErrorCode.UserError => HttpStatusCode.BadRequest,
                WebPubSubErrorCode.Unauthorized => HttpStatusCode.Unauthorized,
                WebPubSubErrorCode.ServerError => HttpStatusCode.InternalServerError,
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

        public static RequestType GetRequestType(string eventType, string eventName)
        {
            if (eventType.Equals(Constants.EventTypes.User))
            {
                return RequestType.User;
            }
            if (eventName.Equals(Constants.Events.ConnectEvent))
            {
                return RequestType.Connect;
            }
            if (eventName.Equals(Constants.Events.DisconnectedEvent))
            {
                return RequestType.Disconnect;
            }
            return RequestType.Ignored;
        }
    }
}
