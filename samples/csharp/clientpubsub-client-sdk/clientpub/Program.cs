using System;
using System.IO;
using System.Threading.Tasks;

using Azure.Messaging.WebPubSub;
using Azure.Messaging.WebPubSub.Clients;

namespace clientpub
{
    class Program
    {
        static async Task Main(string[] args)
        {
            if (args.Length != 2)
            {
                Console.WriteLine("Usage: clientpub <connectionString> <hub>");
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

            await client.StartAsync();

            var streaming = Console.ReadLine();
            while (streaming != null)
            {
                await client.SendToGroupAsync("demogroup", BinaryData.FromString(streaming), WebPubSubDataType.Text);
                streaming = Console.ReadLine();
            }
        }
    }
}
