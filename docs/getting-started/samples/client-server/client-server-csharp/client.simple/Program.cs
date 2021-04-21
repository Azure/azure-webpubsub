using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Azure.Messaging.WebPubSub;

namespace client.simple
{
    class Program
    {
        static async Task Main(string[] args)
        {
            if (args.Length != 3)
            {
                Console.WriteLine("Usage: subscriber <endpoint> <key> <hub>");
                return;
            }
            var endpoint = args[0];
            var key = args[1];
            var hub = args[2];

            // Either generate the URL or fetch it from server or fetch a temp one from the portal
            var serviceClient = new WebPubSubServiceClient(new Uri(endpoint), hub, new Azure.AzureKeyCredential(key));
            var url = serviceClient.GetClientAccessUri(claims: new System.Security.Claims.Claim[]{
                new System.Security.Claims.Claim("sub", "userId")
            });
            // start the connection
            using var client = new WebSocketClient(url, (message, type) =>
            {
                Console.WriteLine(Encoding.UTF8.GetString(message.Span));
                return default;
            });

            // connected
            await client.WaitForConnected;
            Console.WriteLine("Connected");
            await client.LifetimeTask;
        }

        private sealed class WebSocketClient : IDisposable
        {
            private readonly ClientWebSocket _webSocket;
            private readonly Uri _uri;
            public Func<ReadOnlyMemory<byte>, WebSocketMessageType, ValueTask> OnMessage { get; }
            public Task LifetimeTask { get; }
            public Task WaitForConnected { get; }

            public WebSocketClient(Uri uri, Func<ReadOnlyMemory<byte>, WebSocketMessageType, ValueTask> onMessage = null, Action<ClientWebSocketOptions> configureOptions = null)
            {
                _uri = uri;
                var ws = new ClientWebSocket();
                configureOptions?.Invoke(ws.Options);

                _webSocket = ws;
                WaitForConnected = ConnectAsync();
                OnMessage = onMessage;
                LifetimeTask = ReceiveLoop(default);
            }

            public void Dispose()
            {
                _webSocket.Abort();
            }

            public async Task StopAsync()
            {
                try
                {
                    // Block a Start from happening until we've finished capturing the connection state.
                    await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", default);
                }
                catch { }
                // Wait for the receiving tast to end
                await LifetimeTask;
            }

            public ValueTask SendAsync(ReadOnlyMemory<byte> binaryMessage, WebSocketMessageType messageType, bool endOfMessage, CancellationToken token)
            {
                return _webSocket.SendAsync(binaryMessage, messageType, endOfMessage, token);
            }

            private Task ConnectAsync()
            {
                return _webSocket.ConnectAsync(_uri, default);
            }

            private async Task ReceiveLoop(CancellationToken token)
            {
                await WaitForConnected;
                var ms = new MemoryStream();
                Memory<byte> buffer = new byte[1024];
                while (!token.IsCancellationRequested)
                {
                    var receiveResult = await _webSocket.ReceiveAsync(buffer, token);

                    if (receiveResult.MessageType == WebSocketMessageType.Close)
                    {
                        try
                        {
                            await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, default);
                        }
                        catch
                        {
                            // It is possible that the remote is already closed
                        }
                        return;
                    }

                    if (OnMessage != null)
                    {
                        await ms.WriteAsync(buffer.Slice(0, receiveResult.Count));
                        if (receiveResult.EndOfMessage)
                        {
                            await OnMessage.Invoke(ms.ToArray(), receiveResult.MessageType);
                            ms.SetLength(0);
                        }
                    }
                }
            }
        }
    }
}
