using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace notification_isolated
{
    public class Functions
    {
        private readonly ILogger _logger;

        public Functions(ILoggerFactory loggerFactory)
        {
            _logger = loggerFactory.CreateLogger<Functions>();
        }

        [Function("index")]
        public HttpResponseData Index([HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequestData req, FunctionContext context)
        {
            var path = Path.Combine(context.FunctionDefinition.PathToAssembly, "../index.html");
            _logger.LogInformation($"index.html path: {path}.");

            var response = req.CreateResponse();
            response.WriteString(File.ReadAllText(path));
            response.Headers.Add("Content-Type", "text/html");
            return response;
        }

        [Function("negotiate")]
        public HttpResponseData Negotiate([HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequestData req,
            [WebPubSubConnectionInput(Hub = "notification")] WebPubSubConnection connectionInfo)
        {
            var response = req.CreateResponse(HttpStatusCode.OK);
            response.WriteAsJsonAsync(connectionInfo);
            return response;
        }

        [Function("notification")]
        [WebPubSubOutput(Hub = "notification")]
        public SendToAllAction Notification([TimerTrigger("*/10 * * * * *")] MyInfo myTimer)
        {
            return new SendToAllAction
            {
                Data = BinaryData.FromString($"[DateTime: {DateTime.Now}] Temperature: {GetValue(23, 1)}{'\xB0'}C, Humidity: {GetValue(40, 2)}%"),
                DataType = WebPubSubDataType.Text
            };
        }

        private static string GetValue(double baseNum, double floatNum)
        {
            var rng = new Random();
            var value = baseNum + floatNum * 2 * (rng.NextDouble() - 0.5);
            return value.ToString("0.000");
        }
    }

    public class MyInfo
    {
        public MyScheduleStatus ScheduleStatus { get; set; }

        public bool IsPastDue { get; set; }
    }

    public class MyScheduleStatus
    {
        public DateTime Last { get; set; }

        public DateTime Next { get; set; }

        public DateTime LastUpdated { get; set; }
    }
}
