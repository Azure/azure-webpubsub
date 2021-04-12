using System;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading.Tasks;
using Azure.Messaging.WebPubSub;
namespace subscriber
{
    class Program
    {
        static async Task Main(string[] args)
        {
            using var webSocket = new ClientWebSocket();
            webSocket.Options.AddSubProtocol("json.webpubsub.azure.v1");

            if (args.Length != 3) {
                Console.WriteLine("Usage: subscriber <endpoint> <key> <hub>");
                return;
            }
            var endpoint = args[0];
            var key = args[1];
            var hub = args[2];
            // Either generate the token or fetch it from server or fetch a temp one from the portal
            var serviceClient = new WebPubSubServiceClient(new Uri(endpoint), hub, new Azure.AzureKeyCredential(key));
            var url = serviceClient.GetClientAccessUri(TimeSpan.FromHours(1));
            // start the connection
            Console.WriteLine(url);
            await webSocket.ConnectAsync(url, default);
            Console.WriteLine("Connected");
            var message = new{
                type = "joinGroup",
                group = "group1",
                ackId = 1
            };
            await webSocket.SendAsync(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(message), WebSocketMessageType.Text, true, default);
            var ms = new MemoryStream();
            Memory<byte> buffer = new byte[1024];
            // receive loop
            while (true)
            {
                var receiveResult = await webSocket.ReceiveAsync(buffer, default);
                // Need to check again for NetCoreApp2.2 because a close can happen between a 0-byte read and the actual read
                if (receiveResult.MessageType == WebSocketMessageType.Close)
                {
                    try
                    {
                        await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, default);
                    }
                    catch
                    {
                        // It is possible that the remote is already closed
                    }
                    break;
                }
                await ms.WriteAsync(buffer.Slice(0, receiveResult.Count));
                if (receiveResult.EndOfMessage)
                {
                    Console.WriteLine(Encoding.UTF8.GetString(ms.ToArray()));
                    ms.SetLength(0);
                }
            }
        }
    }
}