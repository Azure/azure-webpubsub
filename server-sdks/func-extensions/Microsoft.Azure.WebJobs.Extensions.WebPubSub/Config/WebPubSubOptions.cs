// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Generic;

namespace Microsoft.Azure.WebJobs.Extensions.WebPubSub
{
    public class WebPubSubOptions
    {
        public string ConnectionString { get; set; }

        public string Hub { get; set; }

        /// <summary>
        /// Allowed Hosts for Abuse Protection <see cref="https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#4-abuse-protection"/>. 
        /// All service connection strings will be added. User can add customized values from function settings using comma to separate multiple values.
        /// </summary>
        public HashSet<string> AllowedHosts { get; set; } = new HashSet<string>();

        internal HashSet<string> AccessKeys { get; set; } = new HashSet<string>();
    }
}
