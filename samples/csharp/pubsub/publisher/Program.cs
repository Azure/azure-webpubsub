﻿using System;
using System.Threading.Tasks;
using Azure.Messaging.WebPubSub;

namespace publisher
{
    class Program
    {
        static async Task Main(string[] args)
        {
            if (args.Length != 3) {
                Console.WriteLine("Usage: publisher <connectionString> <hub> <message>");
                return;
            }
            var connectionString = args[0];
            var hub = args[1];
            var message = args[2];
            
            // Either generate the token or fetch it from server or fetch a temp one from the portal
            var serviceClient = new WebPubSubServiceClient(connectionString, hub);
            await serviceClient.SendToAllAsync(message);
        }
    }
}
