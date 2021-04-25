using System;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.WebPubSub;
using Microsoft.Azure.WebJobs.Host;
using Microsoft.Extensions.Logging;

namespace notifications
{
    public static class notification
    {
        [FunctionName("notification")]
        public static async Task Run([TimerTrigger("*/10 * * * * *")]TimerInfo myTimer, ILogger log,
            [WebPubSub(Hub = "notification")] IAsyncCollector<WebPubSubOperation> operations)
        {
           await operations.AddAsync(new SendToAll
            {
                Message = new WebPubSubMessage($"DateTime: {DateTime.Now}], MSFT stock price: {GetStockPrice()}"),
                DataType = MessageDataType.Text
            });
        }

        private static double GetStockPrice()
        {
            var rng = new Random();
            return 260 + 1.0 / 100 * rng.Next(-500, 500);
        }
    }
}
