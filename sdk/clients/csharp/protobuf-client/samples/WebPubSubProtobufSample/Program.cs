// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Text.Json;
using System.Threading.Tasks;
using Azure.Messaging.WebPubSub;
using Azure.Messaging.WebPubSub.Client.Protobuf;
using Azure.Messaging.WebPubSub.Clients;
using Microsoft.Extensions.Configuration;

namespace WebPubSubProtobufSample
{
    class Program
    {
        private const string HubName = "sample_chat";
        private const string GroupName = "testGroup";

        static async Task Main(string[] args)
        {
            Console.WriteLine("Azure WebPubSub Protobuf Client Sample");
            Console.WriteLine("======================================");

            // Load configuration
            var configuration = new ConfigurationBuilder()
                .AddJsonFile("appsettings.json", optional: true)
                .AddJsonFile("appsettings.Development.json", optional: true)
                .AddEnvironmentVariables()
                .Build();

            var connectionString = configuration["WebPubSub:ConnectionString"];

            if (string.IsNullOrEmpty(connectionString))
            {
                Console.WriteLine("Please set WebPubSub:ConnectionString in appsettings.json or environment variables");
                return;
            }

            // Create a service client to get an access token
            var serviceClient = new WebPubSubServiceClient(connectionString, HubName);
            
            // Generate a client access URL with appropriate permissions
            var clientAccessUri = await serviceClient.GetClientAccessUriAsync(
                userId: Guid.NewGuid().ToString(), 
                roles: new[] 
                { 
                    $"webpubsub.joinLeaveGroup.{GroupName}", 
                    $"webpubsub.sendToGroup.{GroupName}" 
                });

            // Create a WebPubSub client with the Protobuf reliable protocol
            var client = new WebPubSubClient(clientAccessUri, new WebPubSubClientOptions
            {
                Protocol = new WebPubSubProtobufReliableProtocol()
            });

            // Set up event handlers
            client.Connected += eventArgs =>
            {
                Console.WriteLine($"Connection {eventArgs.ConnectionId} is connected.");
                return Task.CompletedTask;
            };

            client.Disconnected += eventArgs =>
            {
                Console.WriteLine($"Connection disconnected: {eventArgs.DisconnectedMessage}");
                return Task.CompletedTask;
            };

            client.ServerMessageReceived += eventArgs =>
            {
                if (eventArgs.Message.DataType == WebPubSubDataType.Binary)
                {
                    var base64 = Convert.ToBase64String(eventArgs.Message.Data.ToArray());
                    Console.WriteLine($"Received server message: {base64}");
                }
                else
                {
                    Console.WriteLine($"Received server message: {eventArgs.Message.Data}");
                }
                return Task.CompletedTask;
            };

            client.GroupMessageReceived += eventArgs =>
            {
                if (eventArgs.Message.DataType == WebPubSubDataType.Binary)
                {
                    var base64 = Convert.ToBase64String(eventArgs.Message.Data.ToArray());
                    Console.WriteLine($"Received message from {eventArgs.Message.Group}: {base64}");
                }
                else
                {
                    Console.WriteLine($"Received message from {eventArgs.Message.Group}: {eventArgs.Message.Data}");
                }
                return Task.CompletedTask;
            };

            try
            {
                // Start the connection
                Console.WriteLine("Starting connection...");
                await client.StartAsync();

                // Join a group
                Console.WriteLine($"Joining group '{GroupName}'...");
                await client.JoinGroupAsync(GroupName);

                // Send a text message to the group
                Console.WriteLine("Sending text message to group...");
                await client.SendToGroupAsync(GroupName, 
                    BinaryData.FromString("hello world"), 
                    WebPubSubDataType.Text);

                // Send a JSON object to the group
                Console.WriteLine("Sending JSON object to group...");
                var jsonObject = new { a = 12, b = "hello" };
                await client.SendToGroupAsync(GroupName,
                    BinaryData.FromString(JsonSerializer.Serialize(jsonObject)),
                    WebPubSubDataType.Json);

                // Send a JSON string to the group
                Console.WriteLine("Sending JSON string to group...");
                await client.SendToGroupAsync(GroupName,
                    BinaryData.FromString("\"hello json\""),
                    WebPubSubDataType.Json);

                // Send binary data to the group
                Console.WriteLine("Sending binary data to group...");
                var buffer = Convert.FromBase64String("aGVsbG9w"); // "hellop" in base64
                await client.SendToGroupAsync(GroupName,
                    BinaryData.FromBytes(buffer),
                    WebPubSubDataType.Binary);

                // Wait for a bit to receive any messages
                Console.WriteLine("Waiting for messages...");
                await Task.Delay(1000);

                // Leave the group
                Console.WriteLine($"Leaving group '{GroupName}'...");
                await client.LeaveGroupAsync(GroupName);

                // Stop the connection
                Console.WriteLine("Stopping connection...");
                await client.StopAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Sample encountered an error: {ex.Message}");
            }

            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
        }
    }
}