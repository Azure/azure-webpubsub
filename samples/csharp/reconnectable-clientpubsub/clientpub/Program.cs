using System;
using System.IO;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading.Tasks;

using Azure.Messaging.WebPubSub;
using ClientPubSub;

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
            var client = new WebPubSubServiceWebsocketClient(() => serviceClient.GenerateClientAccessUri(userId: "user1", roles: new string[] { "webpubsub.joinLeaveGroup.demogroup", "webpubsub.sendToGroup.demogroup" }), "json.webpubsub.azure.v1");

            client.MessageReceived.Subscribe(msg => 
            {
                Console.WriteLine($"{DateTime.Now}: Message received: {msg}");
                var ack = JsonSerializer.Deserialize<AckMessage>(msg.Text);
                if (ack.type == "ack")
                {
                    client.HandleAck(new WebPubSubServiceWebsocketClient.AckMessage(ack.ackId, ack.success));
                }
            });

            await client.StartAsync();
            /* Send to group `demogroup` */
            ulong ackId = 1;
            while (true)
            {
                //var message = Console.ReadLine();
                await SendMessage(client, ackId);
                ackId++;
                //await Task.Delay(100);
            }

            Console.WriteLine("done");
        }

        private static async Task SendMessage(WebPubSubServiceWebsocketClient client, ulong ackId)
        {
            var message = JsonSerializer.Serialize(new
            {
                type = "sendToGroup",
                group = "demogroup",
                dataType = "text",
                data = ackId.ToString(),
                ackId = ackId
            });
            while(true)
            {
                try
                {
                    Console.WriteLine($"{DateTime.Now}: Sending message with ackId: {ackId}");
                    await client.SendAsync(ackId, message);
                    return;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"{DateTime.Now}: Retring message with ackId: {ackId}");
                }
            }
        }

        public class AckMessage
        {
            public string type { get; set; }
            public ulong ackId { get; set; }
            public bool success { get; set; }
        }
    }
}
