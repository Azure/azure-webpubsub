// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System;
using System.IO;
using System.Text;

using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Microsoft.Azure.WebJobs.Extensions.WebPubSub
{
    [JsonObject(NamingStrategyType = typeof(CamelCaseNamingStrategy))]
    [JsonConverter(typeof(WebPubSubMessageJsonConverter))]
    public class WebPubSubMessage
    {
        /// <summary>
        /// Web PubSub data message
        /// </summary>
        public BinaryData Body { get; }

        /// <summary>
        /// DataType of the message.
        /// </summary>
        public MessageDataType DataType { get; }

        /// <summary>
        /// Constructor for string/json typed message
        /// </summary>
        [JsonConstructor]
        public WebPubSubMessage(string message, MessageDataType dataType = MessageDataType.Text)
        {
            Body = BinaryData.FromString(message);
            DataType = dataType;
        }

        /// <summary>
        /// Constructor for stream type message
        /// </summary>
        public WebPubSubMessage(Stream message, MessageDataType dataType)
        {
            Body = BinaryData.FromStream(message);
            DataType = dataType;
        }

        /// <summary>
        /// Constructor for binary type message
        /// </summary>
        public WebPubSubMessage(byte[] message, MessageDataType dataType)
        {
            Body = BinaryData.FromBytes(message);
            DataType = dataType;
        }
    }
}
