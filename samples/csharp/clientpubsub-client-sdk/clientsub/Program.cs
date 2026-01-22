using System;
using System.Threading.Tasks;

using Azure.Messaging.WebPubSub;
using Azure.Messaging.WebPubSub.Clients;

namespace clientsub
{
    class Program
    {
        static async Task Main(string[] args)
        {
            if (args.Length != 2)
            {
                Console.WriteLine("Usage: clientsub <connectionString> <hub>");
                return;
            }
            var connectionString = args[0];
            var hub = args[1];

            // Either generate the URL or fetch it from server or fetch a temp one from the portal
            var serviceClient = new WebPubSubServiceClient(connectionString, hub);

            var client = new WebPubSubClient(new WebPubSubClientCredential(async token =>
            {
                return await serviceClient.GetClientAccessUriAsync(userId: "user1", roles: new string[] { "webpubsub.joinLeaveGroup.demogroup", "webpubsub.sendToGroup.demogroup" });
            }));

            client.Connected += e =>
            {
                Console.WriteLine($"Connected: {e.ConnectionId}");
                return Task.CompletedTask;
            };

            client.GroupMessageReceived += e =>
            {
                Console.WriteLine($"Message received: {e.Message.Data}");
                return Task.CompletedTask;
            };

            await client.StartAsync();
            await client.JoinGroupAsync("demogroup");
            Console.Read();
        }
    }
}
