// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Azure;
using Azure.Core;
using Azure.Core.Serialization;
using Azure.Messaging.WebPubSub;

using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class Sample_ReliableChatApp : WebPubSubHub
    {
        private readonly WebPubSubServiceClient<Sample_ReliableChatApp> _serviceClient;
        private readonly IChatHandler _chatHandler;

        public Sample_ReliableChatApp(WebPubSubServiceClient<Sample_ReliableChatApp> serviceClient,
            IChatHandler chatHandler)
        {
            _serviceClient = serviceClient;
            _chatHandler = chatHandler;
        }

        public override async Task OnConnectedAsync(ConnectedEventRequest request)
        {
            var sender = request.ConnectionContext.UserId;

            var pairs = await _chatHandler.GetPairsAsync(sender);
            //  Send latest session list to the connection.
            await _serviceClient.SendToConnectionAsync(
                request.ConnectionContext.ConnectionId,
                RequestContent.Create(new
                {
                    @event = "pairs",
                    pairs = pairs
                }), ContentType.ApplicationJson);

        }

        public override async ValueTask<UserEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
        {
            var sender = request.ConnectionContext.UserId;
            switch (request.ConnectionContext.EventName)
            {
                case "getChatHistory":
                    {
                        var msg = request.Data.ToObject<GetChatHistoryRequest>(JsonObjectSerializer.Default);
                        var history = await _chatHandler.LoadHistoryMessageAsync(msg.user, msg.pair, msg.currentSequenceId);
                        return request.CreateResponse(
                            BinaryData.FromObjectAsJson(new
                            {
                                @event = "chatHistory",
                                data = history
                            }), WebPubSubDataType.Json
                            );
                    }
                case "sendToUser":
                    {
                        var msg = request.Data.ToObject<SendToUserRequest>(JsonObjectSerializer.Default);

                        // Server to generate the sequenceId
                        var sequenceId = await _chatHandler.AddMessageAsync(msg.from, msg.to, msg.text);
                        
                        // Server to broadcast to others (including other connections for current user) about the message
                        _ = SendToPair(msg.from, msg.to, new
                        {
                            @event = "chat",
                            data = new Chat(msg.text, msg.from, msg.to, sequenceId),
                        }, request.ConnectionContext.ConnectionId);

                        // Server to ack back the sequenceId to the connection sending the message
                        return request.CreateResponse(
                            BinaryData.FromObjectAsJson(new
                            {
                                @event = "sequenceId",
                                invocationId = msg.invocationId,
                                from = msg.from,
                                to = msg.to,
                                sequenceId = sequenceId
                            }), WebPubSubDataType.Json
                            );
                    }
                case "readTo":
                    {
                        var msg = request.Data.ToObject<ReadToRequest>(JsonObjectSerializer.Default);
                        await _chatHandler.ReadTo(msg.user, msg.pair, msg.sequenceId);
                        // Tell others (including other connections and the pair user) 
                        await SendToPair(msg.user, msg.pair, new
                        {
                            @event = "readto",
                            user = msg.user,
                            pair = msg.pair,
                            sequenceId = msg.sequenceId
                        }, request.ConnectionContext.ConnectionId);
                        return new UserEventResponse();
                    }
                default:
                    throw new NotSupportedException(request.ConnectionContext.EventName);
            }
        }

        private Task SendToPair(string user, string pair, object msg, string exclude)
        {
            return Task.WhenAll(
                _serviceClient.SendToUserAsync(
                user,
                RequestContent.Create(msg), ContentType.ApplicationJson, ClientConnectionFilter.Create($"connectionId ne {exclude}")),
                _serviceClient.SendToUserAsync(
                pair,
                RequestContent.Create(msg), ContentType.ApplicationJson)
                );
        }

        private record ReadToRequest(string user, string pair, int sequenceId);

        private record GetChatHistoryRequest(string user, string pair, int? currentSequenceId);

        private record SendToUserRequest(string from, string to, string text, int invocationId);
    }
}
