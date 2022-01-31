using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;

sealed class SampleChatHub : WebPubSubHub
    {
        private readonly WebPubSubServiceClient<SampleChatHub> _serviceClient;

        public SampleChatHub(WebPubSubServiceClient<SampleChatHub> serviceClient)
        {
            _serviceClient = serviceClient;
        }

        public override async Task OnConnectedAsync(ConnectedEventRequest request)
        {
            await _serviceClient.SendToAllAsync($"[SYSTEM] {request.ConnectionContext.UserId} joined.");
        }

        public override async ValueTask<UserEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
        {
            await _serviceClient.SendToAllAsync($"[{request.ConnectionContext.UserId}] {request.Data}");

            return request.CreateResponse($"[SYSTEM] ack.");
        }
    }