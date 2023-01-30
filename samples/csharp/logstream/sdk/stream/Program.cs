using System;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

using Azure.Messaging.WebPubSub.Clients;

namespace stream
{
    class Program
    {
        private static readonly HttpClient http = new HttpClient();
        static async Task Main(string[] args)
        {
            var client = new WebPubSubClient(new WebPubSubClientCredential(async token =>
            {
                // Get client url from remote
                var stream = await http.GetStreamAsync("http://localhost:5000/negotiate");
                return new Uri((await JsonSerializer.DeserializeAsync<ClientToken>(stream)).url);
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
                if (!string.IsNullOrEmpty(streaming))
                {
                    await client.SendToGroupAsync("stream", BinaryData.FromString(streaming + Environment.NewLine), WebPubSubDataType.Text);
                }

                streaming = Console.ReadLine();
            }

            await client.StopAsync();
        }

        private sealed class ClientToken
        {
            public string url { get; set; }
        }
    }
}
