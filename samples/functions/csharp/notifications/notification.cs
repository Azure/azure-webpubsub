using Microsoft.Azure.WebPubSub.Common;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.WebPubSub;
using Microsoft.Extensions.Logging;
using System;
using System.Threading.Tasks;

namespace notifications
{
    public static class notification
    {
        [FunctionName("notification")]
        public static async Task Run([TimerTrigger("*/10 * * * * *")]TimerInfo myTimer, ILogger log,
            [WebPubSub(Hub = "sample_notification")] IAsyncCollector<WebPubSubAction> actions)
        {
            await actions.AddAsync(new SendToAllAction
            {
                Data = BinaryData.FromString($"[DateTime: {DateTime.Now}] Temperature: {GetValue(23, 1)}{'\xB0'}C, Humidity: {GetValue(40, 2)}%"),
                DataType = WebPubSubDataType.Text
            });
        }

        private static string GetValue(double baseNum, double floatNum)
        {
            var rng = new Random();
            var value = baseNum + floatNum * 2 * (rng.NextDouble() - 0.5);
            return value.ToString("0.000");
        }
    }
}
