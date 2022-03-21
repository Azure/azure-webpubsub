using System;
using System.IO.Pipelines;
using System.Linq;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading.Tasks;

using Azure.Messaging.WebPubSub;
using ClientPubSub;

namespace clientsub
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
            var ws = new WebPubSubServiceWebsocketClient(() => serviceClient.GenerateClientAccessUri(userId: "user1", roles: new string[] { "webpubsub.joinLeaveGroup.reliableChat", "webpubsub.sendToGroup.reliableChat" }),
                "json.reliable.webpubsub.azure.v1");

            ws.MessageReceived.Subscribe(async msg => 
            {
                Console.WriteLine($"Message received: {msg}");
                var type = JsonSerializer.Deserialize<MessageType>(msg.Text);
                if (type.type == "system")
                {
                    var connected = JsonSerializer.Deserialize<Connected>(msg.Text);
                    if (connected.@event == "connected")
                    {
                        await ws.SendAsync(1, JsonSerializer.Serialize(new
                        {
                            type = "joinGroup",
                            group = "reliableChat",
                            ackId = 1
                        }));
                    }
                }
                else if(type.type == "ack")
                {
                    var ack = JsonSerializer.Deserialize<AckMessage>(msg.Text);
                    ws.HandleAck(new WebPubSubServiceWebsocketClient.AckMessage(ack.ackId, ack.success));
                }
            });

            await ws.StartAsync();

            Console.WriteLine("Press Enter to simulate an networt abort...");
            while(true)
            {
                Console.ReadLine();
                ws.Abort();
            }
        }
    }

    public class MessageType
    {
        public string type { get; set; }
    }

    public class Connected
    {
        public string @event { get; set; }

        public string connectionId {  get; set; }

        public string reconnectionToken { get; set; }
    }

    public class AckMessage
    {
        public ulong ackId { get; set; }
        public bool success { get; set; }
    }
}
