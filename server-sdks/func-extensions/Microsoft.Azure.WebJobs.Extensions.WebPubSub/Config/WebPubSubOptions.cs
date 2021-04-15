// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Generic;
using Microsoft.Azure.WebJobs.Hosting;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;

namespace Microsoft.Azure.WebJobs.Extensions.WebPubSub
{
    public class WebPubSubOptions : IOptionsFormatter
    {
        public string ConnectionString { get; set; }

        public string Hub { get; set; }

        /// <summary>
        /// Allowed Hosts for Abuse Protection <see cref="https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#4-abuse-protection"/>. 
        /// All service connection strings will be added. User can add customized values from function settings using comma to separate multiple values.
        /// </summary>
        public HashSet<string> AllowedHosts { get; set; } = new HashSet<string>();

        internal HashSet<string> AccessKeys { get; set; } = new HashSet<string>();

        /// <summary>
        /// Formats the options as JSON objects for display.
        /// </summary>
        /// <returns>Options formatted as JSON.</returns>
        public string Format()
        {
            JArray allowedHosts = null;
            if (AllowedHosts.Count > 0)
            {
                allowedHosts = new JArray(AllowedHosts);
            }

            JObject options = new JObject
            {
                { nameof(Hub), Hub },
                { nameof(AllowedHosts), allowedHosts }
            };

            return options.ToString(Formatting.Indented);
        }
    }
}
