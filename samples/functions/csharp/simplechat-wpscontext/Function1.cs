using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json;
using Microsoft.Azure.WebJobs.Extensions.WebPubSub;
using Microsoft.Azure.WebJobs.Extensions.WebPubSub.Operations;
using Microsoft.Azure.WebPubSub.Common;

namespace SimpleChat_Input
{
    public static class Function1
    {

        [FunctionName("index")]
        public static IActionResult Home([HttpTrigger(AuthorizationLevel.Anonymous)] HttpRequest req)
        {
            return new ContentResult
            {
                Content = File.ReadAllText("index.html"),
                ContentType = "text/html",
            };
        }

        [FunctionName("login")]
        public static WebPubSubConnection GetClientConnection(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequest req,
            [WebPubSubConnection(UserId = "{query.userid}", Hub = "simplechat")] WebPubSubConnection connection)
        {
            Console.WriteLine("login");
            return connection;
        }

        // validate method when upstream set as http://<func-host>/api/{event}
        [FunctionName("validate")]
        public static HttpResponseMessage Validate(
            [HttpTrigger(AuthorizationLevel.Anonymous, "options")] HttpRequest req,
            [WebPubSubContext] WebPubSubContext wpsReq)
        {
            return wpsReq.Response;
        }

        [FunctionName("connect")]
        public static object Connect(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequest req,
            [WebPubSubContext] WebPubSubContext wpsReq)
        {
            if (wpsReq.Request is PreflightRequest || wpsReq.ErrorMessage != null)
            {
                return wpsReq.Response;
            }
            var request = wpsReq.Request as ConnectEventRequest;
            return request.CreateResponse(request.ConnectionContext.UserId, null, null, null);
        }

        // Http Trigger Message
        [FunctionName("message")]
        public static async Task<object> Broadcast(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequest req,
            [WebPubSubContext] WebPubSubContext wpsReq,
            [WebPubSub(Hub = "%WebPubSubHub%")] IAsyncCollector<WebPubSubOperation> operations)
        {
            if (wpsReq.Request is PreflightRequest || wpsReq.ErrorMessage != null)
            {
                return wpsReq.Response;
            }
            if (wpsReq.Request is UserEventRequest request)
            {
                await operations.AddAsync(new SendToAll
                {
                    Message = request.Message,
                    DataType = request.DataType
                });
            }

            return new ClientContent("ack").ToString();
        }

        [FunctionName("connected")]
        public static async Task Connected(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequest req,
            [WebPubSubContext] WebPubSubContext wpsReq,
            [WebPubSub] IAsyncCollector<WebPubSubOperation> webpubsubOperation)
        {
            Console.WriteLine("Connected.");
            await webpubsubOperation.AddAsync(new SendToAll
            {
                Message = BinaryData.FromString(new ClientContent($"{wpsReq.Request.ConnectionContext.UserId} connected.").ToString()),
                DataType = MessageDataType.Json
            });

            await webpubsubOperation.AddAsync(new AddUserToGroup
            {
                UserId = wpsReq.Request.ConnectionContext.UserId,
                Group = "group1"
            });
            await webpubsubOperation.AddAsync(new SendToUser
            {
                UserId = wpsReq.Request.ConnectionContext.UserId,
                Message = BinaryData.FromString(new ClientContent($"{wpsReq.Request.ConnectionContext.UserId} joined group: group1.").ToString()),
                DataType = MessageDataType.Json
            });
        }

        [FunctionName("disconnected")]
        [return: WebPubSub(Hub = "simplechat")]
        public static WebPubSubOperation Disconnect(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequest req,
            [WebPubSubContext] WebPubSubContext wpsReq)
        {
            Console.WriteLine("Disconnected.");
            return new SendToAll
            {
                Message = BinaryData.FromString(new ClientContent($"{wpsReq.Request.ConnectionContext.UserId} disconnect.").ToString()),
                DataType = MessageDataType.Text
            };
        }


        [JsonObject]
        public sealed class ClientContent
        {
            [JsonProperty("from")]
            public string From { get; set; }
            [JsonProperty("content")]
            public string Content { get; set; }

            public ClientContent(string message)
            {
                From = "[System]";
                Content = message;
            }

            public ClientContent(string from, string message)
            {
                From = from;
                Content = message;
            }

            public override string ToString()
            {
                return JsonConvert.SerializeObject(this);
            }
        }
    }
}
