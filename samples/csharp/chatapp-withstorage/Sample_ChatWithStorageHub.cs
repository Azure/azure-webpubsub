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
    public class Sample_ChatWithStorageHub : WebPubSubHub
    {
        private readonly WebPubSubServiceClient<Sample_ChatWithStorageHub> _serviceClient;
        private readonly IChatHandler _chatHandler;

        public Sample_ChatWithStorageHub(WebPubSubServiceClient<Sample_ChatWithStorageHub> serviceClient,
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
                        if (msg == null)
                        {
                            return new UserEventResponse();
                        }
                        var history = await _chatHandler.LoadHistoryMessageAsync(msg.user, msg.pair, msg.currentSequenceId);
                        if (history == null)
                        {
                            return new UserEventResponse();
                        }

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
                        if (msg == null)
                        {
                            return new UserEventResponse();
                        }

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
                                msg.invocationId,
                                msg.from,
                                msg.to,
                                sequenceId
                            }), WebPubSubDataType.Json
                            );
                    }
                case "readTo":
                    {
                        var msg = request.Data.ToObject<ReadToRequest>(JsonObjectSerializer.Default);
                        if (msg == null)
                        {
                            return new UserEventResponse();
                        }

                        await _chatHandler.ReadTo(msg.user, msg.pair, msg.sequenceId);
                        // Tell others (including other connections and the pair user) 
                        await SendToPair(msg.user, msg.pair, new
                        {
                            @event = "readto",
                            msg.user,
                            msg.pair,
                            msg.sequenceId
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

        private record ReadToRequest(string user, string pair, long sequenceId);

        private record GetChatHistoryRequest(string user, string pair, long? currentSequenceId);

        private record SendToUserRequest(string from, string to, string text, long invocationId);
    }
}
