using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace simplechat_isolated
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
            [WebPubSubConnectionInput(Hub = "sample_funcchat", UserId = "{query.userid}")] WebPubSubConnection connectionInfo)
        {
            var response = req.CreateResponse(HttpStatusCode.OK);
            response.WriteAsJsonAsync(connectionInfo);
            return response;
        }

        // [Function("connect")]
        // public static ConnectEventResponse Connect(
        //     [WebPubSubTrigger("sample_funcchat", WebPubSubEventType.System, "connect")] ConnectEventRequest request)
        // {
        //     var response = ConnectEventRequest.CreateResponse(request.ConnectionContext.UserId, null, null, null);
        //     response.SetState("StatusKey", "StatusValue");
        //     return response;
        // }

        [Function("connected")]
        [WebPubSubOutput(Hub = "sample_funcchat")]
        public WebPubSubAction[] Connected(
            [WebPubSubTrigger("sample_funcchat", WebPubSubEventType.System, "connected")] ConnectedEventRequest request)
        {
            return new WebPubSubAction[]
            {
                new SendToAllAction
                {
                    Data = BinaryData.FromString($"[SYSTEM]{request.ConnectionContext.UserId} connected."),
                    DataType = WebPubSubDataType.Text
                },
                new AddUserToGroupAction
                {
                    UserId = request.ConnectionContext.UserId,
                    Group = "group1"
                },
                new SendToUserAction
                {
                    UserId = request.ConnectionContext.UserId,
                    Data = BinaryData.FromString($"[SYSTEM]{request.ConnectionContext.UserId} joined group: group1."),
                    DataType = WebPubSubDataType.Text
                }
            };
        }

        [Function("message")]
        [WebPubSubOutput(Hub = "sample_funcchat")]
        public static WebPubSubAction Message(
            [WebPubSubTrigger("sample_funcchat", WebPubSubEventType.User, "message")] UserEventRequest request)
        {
            return new SendToGroupAction
            {
                Group = "group1",
                Data = BinaryData.FromString($"[{request.ConnectionContext.UserId}] {request.Data}"),
                DataType = request.DataType

            };
        }

        [Function("disconnected")]
        [WebPubSubOutput(Hub = "sample_funcchat")]
        public static SendToAllAction Disconnected(
            [WebPubSubTrigger("sample_funcchat", WebPubSubEventType.System, "disconnected")] DisconnectedEventRequest request)
        {
            return new SendToAllAction
            {
                Data = BinaryData.FromString($"[SYSTEM]{request.ConnectionContext.UserId} disconnect."),
                DataType = WebPubSubDataType.Text
            };
        }
    }
}
