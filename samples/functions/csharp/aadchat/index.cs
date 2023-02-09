using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace aadchat
{
    public static class index
    {
        [FunctionName("index")]
        public static IActionResult Run(
            [HttpTrigger(AuthorizationLevel.Anonymous)] HttpRequest req,
            ExecutionContext context,
            ILogger log)
        {
            var indexFile = Path.Combine(context.FunctionAppDirectory, "index.html");
            return new ContentResult
            {
                Content = File.ReadAllText(indexFile),
                ContentType = "text/html",
            };
        }
    }
}
