using Microsoft.AspNetCore.Http;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Azure.WebJobs.Extensions.WebPubSub;
using Microsoft.Extensions.Logging;

namespace notifications
{
    public static class login
    {
        [FunctionName("login")]
        public static WebPubSubConnection Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", Route = null)] HttpRequest req,
            [WebPubSubConnection(Hub = "awpssamplenotification")] WebPubSubConnection connection,
            ILogger log)
        {
            log.LogInformation("Connecting...");

            return connection;
        }
    }
}
