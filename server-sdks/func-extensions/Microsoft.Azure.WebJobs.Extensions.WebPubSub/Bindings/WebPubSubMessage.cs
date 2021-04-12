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
    public class WebPubSubMessage
    {
        /// <summary>
        /// Web PubSub data message
        /// Binary data is string(base64 encoded) to align <see cref="https://www.newtonsoft.com/json/help/html/SerializationGuide.htm"/>
        /// </summary>
        public string Body { get; }

        internal byte[] Payload { get; }

        /// <summary>
        /// DataType of the message.
        /// </summary>
        [JsonConverter(typeof(StringEnumConverter))]
        public MessageDataType DataType { get; } = MessageDataType.Text;

        /// <summary>
        /// Constructor for string/json typed message
        /// </summary>
        [JsonConstructor]
        public WebPubSubMessage(string message, MessageDataType dataType = MessageDataType.Text)
        {
            Body = message;
            // string message from js will be base64 encoded
            Payload = dataType == MessageDataType.Binary ?
                Convert.FromBase64String(message) :
                Encoding.UTF8.GetBytes(message);
            DataType = dataType;
        }

        /// <summary>
        /// Constructor for stream type message
        /// </summary>
        public WebPubSubMessage(Stream message, MessageDataType dataType)
        {
            Payload = ReadBytes(message);
            Body = dataType == MessageDataType.Binary ?
                Convert.ToBase64String(Payload) :
                Encoding.UTF8.GetString(Payload);
            DataType = dataType;
        }

        /// <summary>
        /// Constructor for binary type message
        /// </summary>
        public WebPubSubMessage(byte[] message, MessageDataType dataType)
        {
            Payload = message;
            Body = dataType == MessageDataType.Binary ?
                Convert.ToBase64String(Payload) :
                Encoding.UTF8.GetString(Payload);
            DataType = dataType;
        }

        public override string ToString()
        {
            return Body;
        }

        public Stream GetStream()
        {
            return new MemoryStream(Payload);
        }

        private static byte[] ReadBytes(Stream stream)
        {
            using (var ms = new MemoryStream())
            {
                stream.CopyTo(ms);
                return ms.ToArray();
            }
        }
    }
}
