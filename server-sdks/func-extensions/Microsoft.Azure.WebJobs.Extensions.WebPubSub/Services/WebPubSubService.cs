// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Microsoft.Azure.WebJobs.Extensions.WebPubSub
{
    internal class WebPubSubService : IWebPubSubService
    {
        private static readonly HttpClient _httpClient = new HttpClient();

        private readonly string _baseEndpoint;
        private readonly string _accessKey;
        private readonly string _version;
        private readonly string _port;

        public string HubName { get; } = string.Empty;

        private readonly string _hubPath;

        internal WebPubSubService(string connectionString, string hubName)
        {
            (_baseEndpoint, _accessKey, _version, _port) = Utilities.ParseConnectionString(connectionString);
            _port = string.IsNullOrEmpty(_port) ? string.Empty : $":{_port}";
            HubName = hubName;
            _hubPath = !string.IsNullOrEmpty(hubName) ? 
                $"/hubs/{hubName}" : throw new ArgumentNullException("Hub name should be configured in either attribute or appsettings.");
        }

        internal WebPubSubConnection GetClientConnection(IEnumerable<Claim> claims = null)
        {
            var subPath = "?";
            if (!string.IsNullOrEmpty(HubName))
            {
                subPath += $"hub={HubName}";
            }
            var hubUrl = $"{_baseEndpoint}/client/{subPath}";
            var baseEndpoint = new Uri(_baseEndpoint);
            var scheme = baseEndpoint.Scheme == "http" ? "ws" : "wss";
            var token = Utilities.GenerateJwtBearer(null, hubUrl, claims, DateTime.UtcNow.AddMinutes(30), _accessKey);
            return new WebPubSubConnection
            {
                Url = $"{scheme}://{baseEndpoint.Authority}{_port}/client{subPath}&access_token={token}",
                AccessToken = token
            };
        }

        internal WebPubSubConnection GetServerConnection(string additionalPath = "")
        {
            var audienceUrl = $"{_baseEndpoint}/api{_hubPath}{additionalPath}";
            var token = Utilities.GenerateJwtBearer(null, audienceUrl, null, DateTime.UtcNow.AddMinutes(30), _accessKey);
            return new WebPubSubConnection
            {
                Url = $"{_baseEndpoint}{_port}/api{_hubPath}{additionalPath}",
                AccessToken = token
            };
        }

        public Task SendToAll(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.SendToAll, GetQueryForMultipleValues("excluded", webPubSubEvent.Excluded));

            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Post, webPubSubEvent.Message);
        }

        public Task CloseClientConnection(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.CloseClientConnection, webPubSubEvent.ConnectionId, webPubSubEvent.Reason);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Delete);
        }

        public Task SendToConnection(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.SendToConnection, webPubSubEvent.ConnectionId);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Post, webPubSubEvent.Message);
        }

        public Task SendToGroup(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.SendToGroup, webPubSubEvent.GroupId, GetQueryForMultipleValues("excluded", webPubSubEvent.Excluded));
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Post, webPubSubEvent.Message);
        }

        public Task AddConnectionToGroup(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.AddConnectionToGroup, webPubSubEvent.GroupId, webPubSubEvent.ConnectionId);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Put);
        }

        public Task RemoveConnectionFromGroup(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.RemoveConnectionFromGroup, webPubSubEvent.GroupId, webPubSubEvent.ConnectionId);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Delete);
        }

        public Task SendToUser(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.SendToUser, webPubSubEvent.UserId);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Post, webPubSubEvent.Message);
        }

        public Task AddUserToGroup(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.AddUserToGroup, webPubSubEvent.UserId, webPubSubEvent.GroupId);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Put);
        }

        public Task RemoveUserFromGroup(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.RemoveUserFromGroup, webPubSubEvent.UserId, webPubSubEvent.GroupId);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Delete);
        }

        public Task RemoveUserFromAllGroups(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.RemoveUserFromAllGroups, webPubSubEvent.UserId);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Delete);
        }

        public Task GrantGroupPermission(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.GrantGroupPermission, webPubSubEvent.Permission, webPubSubEvent.ConnectionId);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Put);
        }

        public Task RevokeGroupPermission(WebPubSubEvent webPubSubEvent)
        {
            var subPath = GetAdditionalPath(WebPubSubOperation.RevokeGroupPermission, webPubSubEvent.Permission, webPubSubEvent.ConnectionId);
            var connection = GetServerConnection(subPath);
            return RequestAsync(connection, HttpMethod.Delete);
        }

        #region private methods
        private Task<HttpResponseMessage> RequestAsync(WebPubSubConnection connection, HttpMethod httpMethod, WebPubSubMessage message = null)
        {
            var request = new HttpRequestMessage
            {
                Method = httpMethod,
                RequestUri = new Uri(connection.Url)
            };

            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", connection.AccessToken);
            request.Headers.Accept.Clear();
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));
            request.Headers.AcceptCharset.Clear();
            request.Headers.AcceptCharset.Add(new StringWithQualityHeaderValue("UTF-8"));
            request.Headers.Add("Awps-User-Agent", Utilities.GetProductInfo());

            if (message != null && message.Body != null)
            {
                request.Content = new StreamContent(message.GetStream());
                request.Content.Headers.ContentType = Utilities.GetMediaType(message.DataType);
            }
            return _httpClient.SendAsync(request);
        }

        private static string GetAdditionalPath(WebPubSubOperation operation, params object[] parameters) =>
            operation switch
            {
                WebPubSubOperation.SendToAll => $"/:send{parameters[0]}",
                WebPubSubOperation.CloseClientConnection => $"/connections/{parameters[0]}?reason={parameters[1]}",
                WebPubSubOperation.SendToConnection => $"/connections/{parameters[0]}/:send",
                WebPubSubOperation.SendToGroup => $"/groups/{parameters[0]}/:send{parameters[1]}",
                WebPubSubOperation.AddConnectionToGroup => $"/groups/{parameters[0]}/connections/{parameters[1]}",
                WebPubSubOperation.RemoveConnectionFromGroup => $"/groups/{parameters[0]}/connections/{parameters[1]}",
                WebPubSubOperation.SendToUser => $"/users/{parameters[0]}/:send",
                WebPubSubOperation.AddUserToGroup => $"/users/{parameters[0]}/groups/{parameters[1]}",
                WebPubSubOperation.RemoveUserFromGroup => $"/users/{parameters[0]}/groups/{parameters[1]}",
                WebPubSubOperation.RemoveUserFromAllGroups => $"/users/{parameters[0]}/groups",
                WebPubSubOperation.GrantGroupPermission => $"/permissions/{parameters[0]}/connections/{parameters[1]}",
                WebPubSubOperation.RevokeGroupPermission => $"/permissions/{parameters[0]}/connections/{parameters[1]}",
                _ => throw new ArgumentException($"Not supported operation: {operation}")
            };

        private static string GetQueryForMultipleValues(string key, string[] values)
        {
            // works for multiple parameter in query, format: ?key=value[0]&key=value[1]&key=value[2]
            if (values != null && values.Length > 0)
            {
                var query = string.Join("&", values.Select(x => $"{key}={x}"));
                return $"?{query}";
            }
            return string.Empty;
        }
        #endregion
    }
}
