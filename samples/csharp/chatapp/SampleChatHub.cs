using System;
using System.Runtime.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;

namespace chatapp
{
    public class SampleChatHub : WebPubSubHub
    {
        private readonly WebPubSubServiceClient<SampleChatHub> _serviceClient;

        public SampleChatHub(WebPubSubServiceClient<SampleChatHub> serviceClient)
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
            await _serviceClient.SendToAllAsync($"[{request.ConnectionContext.UserId}] {request.Data}");

            // retrieve counter from states.
            var states = new CounterState(1);
            var idle = 0.0;
            if (request.ConnectionContext.ConnectionStates.TryGetValue(nameof(CounterState), out var counterValue))
            {
                states = counterValue.ToObjectFromJson<CounterState>();
                idle = (DateTime.Now - states.Timestamp).TotalSeconds;
                states.Update();
            }
            var response = request.CreateResponse(BinaryData.FromString($"[SYSTEM] ack, idle: {idle}s, connection message counter: {states.Counter}").ToString(), WebPubSubDataType.Json);
            response.SetState(nameof(CounterState), BinaryData.FromObjectAsJson(states));

            return response;
        }


        [DataContract]
        private sealed class CounterState
        {
            [DataMember(Name = "timestamp")]
            public DateTime Timestamp { get; set; }
            [DataMember(Name = "counter")]
            public int Counter { get; set; }

            public CounterState()
            { }

            public CounterState(int counter)
            {
                Counter = counter;
                Timestamp = DateTime.Now;
            }

            public void Update()
            {
                Timestamp = DateTime.Now;
                Counter++;
            }
        }
    }
}
