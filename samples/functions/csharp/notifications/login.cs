using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.WebJobs.Extensions.WebPubSub;

namespace notifications
{
    public static class login
    {
        [FunctionName("login")]
        public static WebPubSubConnection Run(
            [HttpTrigger(AuthorizationLevel.Function, "get", "post", Route = null)] HttpRequest req,
            [WebPubSubConnection(Hub = "notification")] WebPubSubConnection connection,
            ILogger log)
        {
            log.LogInformation("Connecting...");

            return connection;
        }
    }
}
