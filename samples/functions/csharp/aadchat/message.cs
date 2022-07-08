using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.WebPubSub.Common;
using Microsoft.Azure.WebJobs.Extensions.WebPubSub;
using Azure.Messaging.WebPubSub;
using Azure.Identity;
using System.Linq;

namespace aadchat
{
    public static class message
    {
        [FunctionName("message")]
        public static async Task<WebPubSubEventResponse> Run(
            [WebPubSubTrigger("%Hub%", WebPubSubEventType.User, "message")] UserEventRequest request,
                BinaryData data, WebPubSubDataType dataType, ILogger log)
        {
            // Validate if the request comes from the expected Web PubSub object ID
            if (!request.ConnectionContext.Headers.TryGetValue("X-MS-CLIENT-PRINCIPAL-ID", out var requestObjectIds))
            {
                return request.CreateErrorResponse(WebPubSubErrorCode.Unauthorized, "Unable to find auth header X-MS-CLIENT-PRINCIPAL-ID");
            }
            
            if (requestObjectIds.Length != 1)
            {
                return request.CreateErrorResponse(WebPubSubErrorCode.ServerError, $"Invalid X-MS-CLIENT-PRINCIPAL-ID: {string.Join(',', requestObjectIds)}");
            }
            var requestObjectId = requestObjectIds[0];

            var objectId = Environment.GetEnvironmentVariable("WebPubSubIdentityObjectId");
            if (requestObjectId != objectId)
            {
                log.LogWarning($"objectId not matching, expected: {objectId}, actual:{string.Join(",", requestObjectId)}");
                return request.CreateErrorResponse(WebPubSubErrorCode.Unauthorized, $"Object Id {requestObjectId} is not expected.");
            }

            log.LogInformation($"X-MS-CLIENT-PRINCIPAL-ID: {requestObjectId} requests");

            // read value from settings
            var hub = Environment.GetEnvironmentVariable("Hub");
            var host = Environment.GetEnvironmentVariable("WebPubSubEndpoint");

            var service = new WebPubSubServiceClient(new Uri(host), hub, new DefaultAzureCredential());

            // Instead of using output binding, use the SDK to send messages
            await service.SendToAllAsync($"[{request.ConnectionContext.UserId}] {data}", dataType == WebPubSubDataType.Json ? Azure.Core.ContentType.ApplicationJson : Azure.Core.ContentType.TextPlain);
            return new UserEventResponse
            {
                Data = BinaryData.FromString("[SYSTEM] ack"),
                DataType = WebPubSubDataType.Text
            };
        }
    }
}
