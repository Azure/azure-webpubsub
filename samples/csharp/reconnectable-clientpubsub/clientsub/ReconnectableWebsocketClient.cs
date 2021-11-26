using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.WebSockets;
using System.Reactive.Linq;
using System.Reactive.Subjects;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Websocket.Client;
using Websocket.Client.Models;

namespace clientsub
{
    public class WebPubSubServiceWebsocketClient
    {
        private Uri _connectUri;
        private string _baseUri;
        private string _protocol;

        private bool _isStarted = false;
        private volatile ClientWebSocket _clientWebSocket;
        private ulong _lastSeqId = 0;

        private readonly Subject<ResponseMessage> _messageReceivedSubject = new Subject<ResponseMessage>();

        public IObservable<ResponseMessage> MessageReceived => _messageReceivedSubject.AsObservable();

        public string ConnectionId { get; set; }

        public string ReconnectToken { get; set; }

        public bool IsDuplicate(ulong seqId)
        {
            if (seqId <= _lastSeqId)
            {
                return true;
            }

            _lastSeqId = seqId;
            return false;
        }

        public WebPubSubServiceWebsocketClient(Uri uri, string protocol)
        {
            _connectUri = uri;
            var builder = new UriBuilder(uri);
            builder.Query = null;
            _baseUri = builder.Uri.AbsoluteUri;
            _protocol = protocol;
        }

        public Task StartAsync()
        {
            return StartInternal(_connectUri, _protocol);
        }

        public async Task SendAsync(string message)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(message);
            ArraySegment<byte> buffer = new ArraySegment<byte>(bytes);
            await _clientWebSocket.SendAsync(buffer, WebSocketMessageType.Text, endOfMessage: true, default).ConfigureAwait(continueOnCapturedContext: false);
        }

        public void Abort()
        {
            _clientWebSocket.Abort();
        }

        private async Task Listen(ClientWebSocket client, CancellationToken token)
        {
            Exception causedException = null;
            try
            {
                ArraySegment<byte> buffer = new ArraySegment<byte>(new byte[4096]);
                do
                {
                    byte[] resultArrayWithTrailing = null;
                    int resultArraySize = 0;
                    bool isResultArrayCloned = false;
                    MemoryStream ms = null;
                    WebSocketReceiveResult webSocketReceiveResult;
                    while (true)
                    {
                        webSocketReceiveResult = await client.ReceiveAsync(buffer, token);
                        byte[] array = buffer.Array;
                        int count = webSocketReceiveResult.Count;
                        if (resultArrayWithTrailing == null)
                        {
                            resultArraySize += count;
                            resultArrayWithTrailing = array;
                            isResultArrayCloned = false;
                        }
                        else if (array != null)
                        {
                            if (ms == null)
                            {
                                ms = new MemoryStream();
                                ms.Write(resultArrayWithTrailing, 0, resultArraySize);
                            }

                            ms.Write(array, buffer.Offset, count);
                        }

                        if (webSocketReceiveResult.EndOfMessage)
                        {
                            break;
                        }

                        if (!isResultArrayCloned)
                        {
                            resultArrayWithTrailing = resultArrayWithTrailing?.ToArray();
                            isResultArrayCloned = true;
                        }
                    }

                    ms?.Seek(0L, SeekOrigin.Begin);
                    ResponseMessage responseMessage;
                    if (webSocketReceiveResult.MessageType == WebSocketMessageType.Text)
                    {
                        responseMessage = ResponseMessage.TextMessage((ms != null) ? Encoding.UTF8.GetString(ms.ToArray()) : ((resultArrayWithTrailing != null) ? Encoding.UTF8.GetString(resultArrayWithTrailing, 0, resultArraySize) : null));
                    }
                    else
                    {
                        if (webSocketReceiveResult.MessageType == WebSocketMessageType.Close)
                        {
                            await _clientWebSocket.CloseOutputAsync(webSocketReceiveResult.CloseStatus ?? WebSocketCloseStatus.NormalClosure, null, default);
                            //Reconnect();

                            return;
                        }

                        if (ms != null)
                        {
                            responseMessage = ResponseMessage.BinaryMessage(ms.ToArray());
                        }
                        else
                        {
                            Array.Resize(ref resultArrayWithTrailing, resultArraySize);
                            responseMessage = ResponseMessage.BinaryMessage(resultArrayWithTrailing);
                        }
                    }

                    ms?.Dispose();
                    _messageReceivedSubject.OnNext(responseMessage);
                }
                while (client.State == WebSocketState.Open && !token.IsCancellationRequested);
            }
            catch (TaskCanceledException ex)
            {
                causedException = ex;
            }
            catch (OperationCanceledException ex2)
            {
                causedException = ex2;
            }
            catch (ObjectDisposedException ex3)
            {
                causedException = ex3;
            }
            catch (Exception ex4)
            {
                causedException = ex4;
            }

            Console.WriteLine("Disconnected");
            //_ = Reconnect();
        }

        public Task Reconnect()
        {
            if (!string.IsNullOrEmpty(ConnectionId) &&
                !string.IsNullOrEmpty(ReconnectToken))
            {
                var builder = new UriBuilder(_baseUri);
                builder.Query = $"awps_connection_id={ConnectionId}&awps_reconnection_token={ReconnectToken}";
                var reconnectUri = builder.Uri;
                return StartInternal(reconnectUri, _protocol);
            }

            return StartInternal(_connectUri, _protocol);
        }

        private async Task StartInternal(Uri uri, string protocol)
        {
            _clientWebSocket = new ClientWebSocket();
            _clientWebSocket.Options.AddSubProtocol(protocol);

            //Console.WriteLine($"Tring to connection with uri: {uri.AbsoluteUri}");

            try
            {
                await _clientWebSocket.ConnectAsync(uri, default);
                Console.WriteLine("Connected");
                _ = Task.Run(() => Listen(_clientWebSocket, default));
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex);

                await Task.Delay(5000);
                _ = Reconnect();
            }
        }
    }
}
