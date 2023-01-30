using System;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace stream
{
    class Program
    {
        private static readonly HttpClient http = new HttpClient();
        static async Task Main(string[] args)
        {
            // Get client url from remote
            var stream = await http.GetStreamAsync("http://localhost:5000/negotiate");
            var url = (await JsonSerializer.DeserializeAsync<ClientToken>(stream)).url;
            var client = new ClientWebSocket();
            client.Options.AddSubProtocol("json.webpubsub.azure.v1");

            await client.ConnectAsync(new Uri(url), default);

            Console.WriteLine("Connected.");
            var streaming = Console.ReadLine();
            while (streaming != null)
            {
                if (!string.IsNullOrEmpty(streaming))
                {
                    var message = JsonSerializer.Serialize(new
                    {
                        type = "sendToGroup",
                        group = "stream",
                        data = streaming + Environment.NewLine,
                    });
                    Console.WriteLine("Sending " + message);
                    await client.SendAsync(Encoding.UTF8.GetBytes(message), WebSocketMessageType.Text, true, default);
                }

                streaming = Console.ReadLine();
            }

            await client.CloseAsync(WebSocketCloseStatus.NormalClosure, null, default);
        }

        private sealed class ClientToken
        {
            public string url { get; set; }
        }
    }
}
