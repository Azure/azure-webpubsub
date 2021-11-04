using Azure.Messaging.WebPubSub;
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace chatapp
{
    public class SampleHub : WebPubSubHub
    {
        private readonly WebPubSubServiceClient _serviceClient;

        public SampleHub(WebPubSubServiceClient serviceClient)
        {
            _serviceClient = serviceClient;
        }

        public override ValueTask<WebPubSubEventResponse> OnConnectAsync(ConnectEventRequest request, CancellationToken cancellationToken)
        {
            // not register event will never be triggered.
            throw new NotImplementedException();
        }

        public override async Task OnConnectedAsync(ConnectedEventRequest request)
        {
            await _serviceClient.SendToAllAsync($"[SYSTEM] {request.ConnectionContext.UserId} joined.");
        }

        public override async ValueTask<WebPubSubEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
        {
            await _serviceClient.SendToAllAsync($"[{request.ConnectionContext.UserId}] {request.Message}");
            return null; 
            // Or return <UserEventResponse> as a direct message to caller.
            // return request.CreateResponse("ack");
        }
    }
}
