// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Microsoft.Azure.WebJobs.Extensions.WebPubSub
{
    [JsonObject(NamingStrategyType = typeof(CamelCaseNamingStrategy))]
    public class ConnectResponse
    {
        public Error Error { get; set; }

        public string UserId { get; set; }

        public string[] Groups { get; set; }

        public string Subprotocol { get; set; }

        public string[] Roles { get; set; }
    }
}
