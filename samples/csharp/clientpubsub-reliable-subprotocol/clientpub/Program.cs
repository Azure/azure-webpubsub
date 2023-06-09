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
            var client = new WebPubSubServiceWebsocketClient(() => serviceClient.GetClientAccessUri(userId: "user1", roles: new string[] { "webpubsub.joinLeaveGroup.reliableChat", "webpubsub.sendToGroup.reliableChat" }), "json.reliable.webpubsub.azure.v1");

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
            Console.WriteLine("Press Enter to simulate an networt abort...");

            _ = Task.Run(async () =>
            {
                ulong ackId = 1;
                while (true)
                {
                    await SafeSendMessage(client, ackId);
                    ackId++;
                    await Task.Delay(100);
                }
            });

            while (true)
            {
                Console.ReadLine();
                client.Abort();
            }
        }

        private static async Task SafeSendMessage(WebPubSubServiceWebsocketClient client, ulong ackId)
        {
            var message = JsonSerializer.Serialize(new
            {
                type = "sendToGroup",
                group = "reliableChat",
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
                finally
                {
                    await Task.Delay(100);
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
