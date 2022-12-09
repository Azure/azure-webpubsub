// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;
using Azure;
using Azure.Core;
using Azure.Core.Serialization;
using Azure.Messaging.WebPubSub;
using System.Text.RegularExpressions;
using Azure.Messaging;
using System.Collections.Concurrent;
using System.Reflection;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class Sample_ReliableChatApp : WebPubSubHub
    {
        private readonly WebPubSubServiceClient<Sample_ReliableChatApp> _serviceClient;
        private readonly IUserManager _userManager;
        private readonly IChatHandler _messageHandler;

        public Sample_ReliableChatApp(WebPubSubServiceClient<Sample_ReliableChatApp> serviceClient,
            IUserManager userManager,
            IChatHandler messageHandler)
        {
            _serviceClient = serviceClient;
            _userManager = userManager;
            _messageHandler = messageHandler;
        }

        public override async Task OnConnectedAsync(ConnectedEventRequest request)
        {
            var sender = request.ConnectionContext.UserId;
            await UpdateUserAsync(sender, true);

            //  Send latest session list to user.
            await _serviceClient.SendToConnectionAsync(
                request.ConnectionContext.ConnectionId,
                RequestContent.Create(new
                {
                    @event = "setUsers",
                    users = _userManager.GetUsers()
                }), ContentType.ApplicationJson);
        }


        public override async Task OnDisconnectedAsync(DisconnectedEventRequest request)
        {
            var sender = request.ConnectionContext.UserId;
            if (!await _serviceClient.UserExistsAsync(sender))
            {
                await UpdateUserAsync(sender, false);
            }
        }

        private Task UpdateUserAsync(string user, bool online)
        {
            _userManager.UpdateUserState(user, online);

            return _serviceClient.SendToAllAsync(
            RequestContent.Create(new
            {
                @event = "updateUsers",
                users = new Dictionary<string, UserState>
                {
                    [user] = new(user, false)
                }
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
                        var history = await _messageHandler.LoadHistoryMessageAsync(msg.user, msg.pair);
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
                        var sequenceId = await _messageHandler.AddMessageAsync(msg.from, msg.to, msg.text);
                        
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
                        await _messageHandler.ReadTo(msg.user, msg.pair, msg.sequenceId);
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

        public record ReadToRequest(string user, string pair, int sequenceId);

        public record GetChatHistoryRequest(string user, string pair);

        public record SendToUserRequest(string from, string to, string text, int invocationId);

        /// <summary>
        /// Send a message to the specified user.
        /// </summary>
        /// <param name="sessionId"></param>
        /// <param name="receiver"></param>
        /// <param name="messageContent"></param>
        /// <returns>The sequenceId of the message.</returns>
        public async Task<int> SendUserMessage(SendToUserRequest data, string exclude)
        {
            var sequenceId = await _messageHandler.AddMessageAsync(data.from, data.to, data.text);
            await SendToPair(data.from, data.to, new
            {
                @event = "chat",
                data = new Chat(data.text, data.from, data.to, sequenceId),
            }, exclude);

            return sequenceId;
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
    }
}
