// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System;

using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

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
            serializer.Serialize(writer, value);
        }
    }
}
