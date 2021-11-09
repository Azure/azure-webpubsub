using Azure.Messaging.WebPubSub;
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace chatapp
{
    public class SampleChatHub : WebPubSubHub
    {
        private readonly WebPubSubServiceClient _serviceClient;

        public SampleChatHub(WebPubSubServiceClient serviceClient)
        {
            _serviceClient = serviceClient;
        }

        public override ValueTask<ConnectEventResponse> OnConnectAsync(ConnectEventRequest request, CancellationToken cancellationToken)
        {
            // not register event will never be triggered.
            return base.OnConnectAsync(request, cancellationToken);
        }

        public override async Task OnConnectedAsync(ConnectedEventRequest request)
        {
            await _serviceClient.SendToAllAsync($"[SYSTEM] {request.ConnectionContext.UserId} joined.");
        }

        public override async ValueTask<UserEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
        {
            await _serviceClient.SendToAllAsync($"[{request.ConnectionContext.UserId}] {request.Message}");
            return request.CreateResponse("ack");
        }
    }
}
