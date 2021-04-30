using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using System.IO;

namespace notifications
{
    public static class index
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
    }
}
