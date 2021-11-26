using System;
using System.IO.Pipelines;
using System.Linq;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading.Tasks;

using Azure.Messaging.WebPubSub;

using Websocket.Client;

namespace clientsub
{
    class Program
    {
        static async Task Main(string[] args)
        {
            //var pipe = new Pipe();
            //pipe.Reader.Complete(new InvalidOperationException("aaa"));
            //await pipe.Writer.WriteAsync(new ReadOnlyMemory<byte>());
            //if (args.Length != 2)
            //{
            //    Console.WriteLine("Usage: clientsub <connectionString> <hub>");
            //    return;
            //}
            bool needAck = false;
            if (args.Contains("ack"))
            {
                needAck = true;
            }
            var connectionString = "Endpoint=http://localhost:8080;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;";
            
            var hub = "signalrbench";

            // Either generate the URL or fetch it from server or fetch a temp one from the portal
            var serviceClient = new WebPubSubServiceClient(connectionString, hub);
            var url = serviceClient.GenerateClientAccessUri(userId: "user1", roles: new string[] {"webpubsub.joinLeaveGroup.demogroup", "webpubsub.sendToGroup.demogroup"});

            var ws = new WebPubSubServiceWebsocketClient(url, "json.webpubsub.azure.v1");
            ws.MessageReceived.Subscribe(msg => 
            {
                var connected = JsonSerializer.Deserialize<Connected>(msg.Text);
                if (connected != null && connected.@event == "connected")
                {
                    ws.ConnectionId = connected.connectionId;
                    ws.ReconnectToken = connected.reconnectionToken;
                }

                var seqIdMessage = JsonSerializer.Deserialize<SequenceIdMessage>(msg.Text);
                if (seqIdMessage != null && seqIdMessage.sequenceId != null)
                {
                    if (ws.IsDuplicate(seqIdMessage.sequenceId.Value))
                    {
                        Console.WriteLine($"Duplicated message received: sequence id: {seqIdMessage.sequenceId}");
                    }
                    else
                    {
                        Console.WriteLine($"Message received: {msg}");
                    }

                    if (needAck)
                    {
                        Console.WriteLine($"Ack: {seqIdMessage.sequenceId.Value}");
                        _ = ws.SendAsync(JsonSerializer.Serialize(new
                        {
                            type = "ack",
                            sequenceId = seqIdMessage.sequenceId.Value,
                        }));
                    }
                }
                else
                {
                    Console.WriteLine($"Message received: {msg}");
                }
            });

            await ws.StartAsync();
            Console.WriteLine("Connected.");
            await ws.SendAsync(JsonSerializer.Serialize(new
            {
                type = "joinGroup",
                group = "demogroup",
                ackId = 1
            }));

            
            while(true)
            {
                //await Task.Delay(5000);
                Console.ReadLine();
                ws.Abort();
                Console.ReadLine();
                await ws.Reconnect();
            }
            
            //using (var client = new WebsocketClient(url, () =>
            //{
            //    var inner = new ClientWebSocket();
            //    inner.Options.AddSubProtocol("json.webpubsub.azure.v1");
            //    return inner;
            //}))
            //{
            //    // Disable the auto disconnect and reconnect because the sample would like the client to stay online even no data comes in
            //    client.ReconnectTimeout = null;
            //    client.IsReconnectionEnabled = false;
            //    client.DisconnectionHappened.Subscribe(disconnectionInfo =>
            //    {
            //        client.Reconnect()
            //    });
            //    client.MessageReceived.Subscribe(msg => Console.WriteLine($"Message received: {msg}"));
            //    client.MessageReceived.Subscribe()
            //    await client.Start();
            //    Console.WriteLine("Connected.");
            //    client.Send(JsonSerializer.Serialize(new
            //    {
            //        type = "joinGroup",
            //        group = "demogroup",
            //        ackId = 1
            //    }));
            //    Console.Read();
            //}
        }
    }

    public class Connected
    {
        public string @event { get; set; }

        public string connectionId {  get; set; }

        public string reconnectionToken { get; set; }
    }

    public class SequenceIdMessage
    {
        public ulong? sequenceId { get; set; }
    }
}
