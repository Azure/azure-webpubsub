using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Azure.Messaging.WebPubSub;
using Azure.Identity;

namespace aadchat
{
    public static class negotiate
    {
        /// <summary>
        /// AuthorizationLevel uses anonymous because we will leverage function AAD auth
        /// </summary>
        /// <param name="req"></param>
        /// <param name="log"></param>
        /// <returns></returns>
        [FunctionName("negotiate")]
        public static async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", Route = null)] HttpRequest req,
            ILogger log)
        {
            log.LogInformation("negotiating...");
            
            // read value from settings
            var hub = Environment.GetEnvironmentVariable("Hub");
            var host = Environment.GetEnvironmentVariable("WebPubSubEndpoint");
            var functionuai = Environment.GetEnvironmentVariable("FunctionUserAssignedIdentityClientId");

            // Check if AAD user identity header exists
            // When AAD auth is enabled, Function set this header
            if (req.Headers.TryGetValue("x-ms-client-principal-name", out var userId)){
                var service = new WebPubSubServiceClient(new Uri(host), hub, new DefaultAzureCredential(new DefaultAzureCredentialOptions { ManagedIdentityClientId = functionuai }));
                var accessUrl = await service.GetClientAccessUriAsync(userId: userId);
                return new JsonResult(new
                {
                    url = accessUrl
                });
            }
            else
            {
                log.LogWarning("No x-ms-client-principal-name: " + req.Headers);
                return new UnauthorizedResult();
            }
        }
    }
}
