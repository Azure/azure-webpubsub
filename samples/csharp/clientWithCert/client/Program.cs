using System;
using System.Net.Http;
using System.Net.WebSockets;
using System.Security.Cryptography.X509Certificates;
using System.Threading.Tasks;

namespace stream
{
    class Program
    {
        static async Task Main(string[] args)
        {
            var client = new ClientWebSocket();
            client.Options.ClientCertificates.Add(new X509Certificate("cert.pfx", "<your_cert_password>"));
            await client.ConnectAsync(new Uri("wss://<your_endpoint>.webpubsub.azure.com/client/hubs/cert?query1=value1"), default);

            Console.WriteLine("Connected.");
            Console.ReadLine();
            await client.CloseAsync(WebSocketCloseStatus.NormalClosure, null, default);
        }
    }
}
