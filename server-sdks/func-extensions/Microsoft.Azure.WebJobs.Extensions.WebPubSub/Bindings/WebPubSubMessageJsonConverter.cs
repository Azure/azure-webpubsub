// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace Microsoft.Azure.WebJobs.Extensions.WebPubSub
{
    internal class WebPubSubMessageJsonConverter : JsonConverter<WebPubSubMessage>
    {
        public override WebPubSubMessage ReadJson(JsonReader reader, Type objectType, WebPubSubMessage existingValue, bool hasExistingValue, JsonSerializer serializer)
        {
            var jObject = JObject.Load(reader);
            var message = jObject["body"].ToString();
            var type = jObject["dataType"].ToString();

            if (Enum.TryParse<MessageDataType>(type, true, out var dataType))
            {
                return new WebPubSubMessage(message, dataType);
            }

            throw new ArgumentException($"{Constants.ErrorMessages.NotSupportedDataType}{type}");
        }

        public override void WriteJson(JsonWriter writer, WebPubSubMessage value, JsonSerializer serializer)
        {
            var msg = new WebPubSubStringMessage(value);
            serializer.Serialize(writer, msg);
        }

        [JsonObject(NamingStrategyType = typeof(CamelCaseNamingStrategy))]
        private sealed class WebPubSubStringMessage
        {
            public string Body { get; }
            public string DataType { get; }

            public WebPubSubStringMessage(WebPubSubMessage message)
            {
                DataType = message.DataType.ToString();
                Body = message.DataType == MessageDataType.Binary ?
                    Convert.ToBase64String(message.Body.ToArray()) :
                    message.Body.ToString();
            }

            public WebPubSubMessage ToMessage()
            {
                if (DataType.Equals("binary", StringComparison.OrdinalIgnoreCase))
                {
                    return new WebPubSubMessage(Convert.FromBase64String(Body), MessageDataType.Binary);
                }
                var dataType = (MessageDataType)Enum.Parse(typeof(MessageDataType), DataType, true);
                return new WebPubSubMessage(Body, dataType);
            }
        }
    }
}
