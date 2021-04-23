using System;
using System.IO;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Threading.Tasks;

using Newtonsoft.Json;

namespace WebPubSubTests
{
    class Program
    {
        private const string DefaultLogin = "http://localhost:7071/api/login";
        private static HttpClient _httpClient = new HttpClient();

        static async Task Main(string[] args)
        {
            string input;
            string loginUrl = DefaultLogin;
            string userId;
            int mode = 1;
            Console.WriteLine("== [Simple Chat] ==");

            Console.WriteLine($"[1] Enter login func url, default is {DefaultLogin}:");
            input = Console.ReadLine();
            if (string.IsNullOrEmpty(input) || !Uri.TryCreate(input, UriKind.Absolute, out var url))
            {
                Console.WriteLine($"Invalid url, use default local func: {DefaultLogin}");
            }
            else
            {
                loginUrl = input;
            }

            Console.WriteLine("[2] Select test scenario: 1 | 2");
            Console.WriteLine(" * 1. notification \r\n * 2. simplechat");

            input = Console.ReadLine();

            if (!int.TryParse(input, out mode) || mode > 2)
            {
                mode = 1;
                Console.WriteLine($"Invalid input");
            }

            if (mode == 1)
            {
                Console.WriteLine();
                Console.WriteLine("====================");
                Console.WriteLine("Enter Notification Mode");

                Console.WriteLine("[Progress] Start connecting service.");

                var response = await _httpClient.GetAsync($"{loginUrl}");
                var result = await response.Content.ReadAsStringAsync();

                var connection = JsonConvert.DeserializeObject<Connection>(result);

                using var webSocket = new ClientWebSocket();
                await webSocket.ConnectAsync(new Uri(connection.Url), default);
                Console.WriteLine("[Progress] Connected.");

                await ReceiveMessageAsync(webSocket);
            }
            else
            {
                Console.WriteLine();
                Console.WriteLine("====================");
                Console.WriteLine("Enter Simplechat Mode");

                Console.WriteLine("[Progress] Start connecting service.");

                Console.WriteLine("[3] Enter userId:");
                userId = Console.ReadLine();

                var response = await _httpClient.GetAsync($"{loginUrl}?userid={userId}");
                var result = await response.Content.ReadAsStringAsync();

                var connection = JsonConvert.DeserializeObject<Connection>(result);

                using var webSocket = new ClientWebSocket();
                await webSocket.ConnectAsync(new Uri(connection.Url), default);
                Console.WriteLine("[Progress] Connected.");

                _ = ReceiveMessageAsync(webSocket);

                await SendMessageAsync(webSocket);
            }
        }

        private static async Task ReceiveMessageAsync(ClientWebSocket webSocket)
        {
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
                    Console.WriteLine($"[Received]: {Encoding.UTF8.GetString(ms.ToArray())}");
                    ms.SetLength(0);
                }
            }
        }

        private static async Task SendMessageAsync(ClientWebSocket webSocket)
        {
            while (true)
            {
                Console.WriteLine("[4] Input text to chat:");
                var message = Console.ReadLine();
                if (!string.IsNullOrEmpty(message))
                {
                    var msgBuffer = Encoding.UTF8.GetBytes(message);
                    await webSocket.SendAsync(new ArraySegment<byte>(msgBuffer), WebSocketMessageType.Text, true, default);
                }
            }
        }

        private sealed class Connection
        {
            public string Url { get; set; }
            public string AccessToken { get; set; }
        }
    }
}
