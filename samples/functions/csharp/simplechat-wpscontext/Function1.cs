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
using Microsoft.Azure.WebPubSub.Common;
using Microsoft.Extensions.Logging;

namespace SimpleChat_Input
{
    public static class Function1
    {

        [FunctionName("index")]
        public static IActionResult Home([HttpTrigger(AuthorizationLevel.Anonymous)] HttpRequest req, ILogger log)
        {
            string indexFile = "index.html";
            // detect Azure env.
            if (Environment.GetEnvironmentVariable("HOME") != null)
            {
                indexFile = Path.Join(Environment.GetEnvironmentVariable("HOME"), "site", "wwwroot", indexFile);
            }
            log.LogInformation($"index.html path: {indexFile}.");
            return new ContentResult
            {
                Content = File.ReadAllText(indexFile),
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
            [WebPubSub(Hub = "%WebPubSubHub%")] IAsyncCollector<WebPubSubAction> actions)
        {
            if (wpsReq.Request is PreflightRequest || wpsReq.ErrorMessage != null)
            {
                return wpsReq.Response;
            }
            if (wpsReq.Request is UserEventRequest request)
            {
                await actions.AddAsync(WebPubSubAction.CreateSendToAllAction(request.Data, request.DataType));
            }

            return new ClientContent("ack").ToString();
        }

        [FunctionName("connected")]
        public static async Task Connected(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequest req,
            [WebPubSubContext] WebPubSubContext wpsReq,
            [WebPubSub] IAsyncCollector<WebPubSubAction> actions)
        {
            Console.WriteLine("Connected.");
            await actions.AddAsync(new SendToAllAction
            {
                Data = BinaryData.FromString(new ClientContent($"{wpsReq.Request.ConnectionContext.UserId} connected.").ToString()),
                DataType = WebPubSubDataType.Json
            });

            await actions.AddAsync(WebPubSubAction.CreateAddUserToGroupAction(wpsReq.Request.ConnectionContext.UserId, "group1"));
            await actions.AddAsync(new SendToUserAction
            {
                UserId = wpsReq.Request.ConnectionContext.UserId,
                Data = BinaryData.FromString(new ClientContent($"{wpsReq.Request.ConnectionContext.UserId} joined group: group1.").ToString()),
                DataType = WebPubSubDataType.Json
            });
        }

        [FunctionName("disconnected")]
        [return: WebPubSub(Hub = "simplechat")]
        public static WebPubSubAction Disconnect(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequest req,
            [WebPubSubContext] WebPubSubContext wpsReq)
        {
            Console.WriteLine("Disconnected.");
            return new SendToAllAction
            {
                Data = BinaryData.FromString(new ClientContent($"{wpsReq.Request.ConnectionContext.UserId} disconnect.").ToString()),
                DataType = WebPubSubDataType.Text
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
