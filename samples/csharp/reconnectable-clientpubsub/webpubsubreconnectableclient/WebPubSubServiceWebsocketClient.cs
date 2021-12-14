using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.WebSockets;
using System.Reactive.Linq;
using System.Reactive.Subjects;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Websocket.Client;
using Websocket.Client.Models;

namespace ClientPubSub
{
    public class WebPubSubServiceWebsocketClient
    {
        private volatile bool _stopped = false;
        private volatile ReconnectableWebPubSubClient _client;
        private string _protocol;

        private readonly Subject<ResponseMessage> _messageReceivedSubject = new Subject<ResponseMessage>();

        public IObservable<ResponseMessage> MessageReceived => _messageReceivedSubject.AsObservable();

        private readonly Func<Uri> _uriFunc;

        public WebPubSubServiceWebsocketClient(Func<Uri> uriFactory, string protocol)
        {
            _uriFunc = uriFactory;
            _protocol = protocol;
        }

        public Task StartAsync()
        {
            Console.WriteLine("Starting a new client");
            var client = new ReconnectableWebPubSubClient(_uriFunc.Invoke(), _protocol);
            client.OnDisconnected = () =>
            {
                Console.WriteLine("Client disconnected");
                if (!_stopped)
                {
                    _ = StartAsync();
                }
            };
            client.MessageReceived.Subscribe(msg => _messageReceivedSubject.OnNext(msg));
            _client = client;
            return _client.ConnectAsync();
        }

        public Task SendAsync(string message)
        {
            return _client.SendAsync(message);
        }

        public Task<AckMessage> SendAsync(ulong ackId, string message)
        {
            return _client.SendAsync(ackId, message);
        }

        public void HandleAck(AckMessage message)
        {
            _client.HandleAck(message);
        }

        public void Stop()
        {
            _stopped = true;
            _client.Dispose();
        }

        public void Abort()
        {
            _client.Abort();
        }

        public sealed class ReconnectableWebPubSubClient : IDisposable
        {
            public string ConnectionId => _connectionContext.ConnectionId;
            public string ReconnectionToken => _connectionContext.ReconnectionToken;
            public Action OnDisconnected { get; set; }
            public IObservable<ResponseMessage> MessageReceived => _messageReceivedSubject.AsObservable();

            private readonly Uri _uri;
            private readonly string _protocol;
            private readonly string _baseUri;
            private readonly Subject<ResponseMessage> _messageReceivedSubject = new Subject<ResponseMessage>();
            private readonly AckHandler _ackHandler;

            private ulong _latestSequenceId = 0;
            private volatile ClientWebSocket _clientWebSocket;
            private ConnectionContext _connectionContext = default;
            private volatile bool _initialized = false;
            private volatile bool _disableReconnection = false;

            public ReconnectableWebPubSubClient(Uri uri, string protocol)
            {
                _uri = uri;
                _protocol = protocol;
                var builder = new UriBuilder(uri);
                builder.Query = null;
                _baseUri = builder.Uri.AbsoluteUri;
                _ackHandler = new AckHandler();
            }

            public Task ConnectAsync()
            {
                return ConnectCoreAsync(_uri);
            }

            public async Task SendAsync(string message)
            {
                byte[] bytes = Encoding.UTF8.GetBytes(message);
                ArraySegment<byte> buffer = new ArraySegment<byte>(bytes);

                await _clientWebSocket.SendAsync(buffer, WebSocketMessageType.Text, endOfMessage: true, default).ConfigureAwait(continueOnCapturedContext: false);
            }

            public async Task<AckMessage> SendAsync(ulong ackId, string message)
            {
                var ack = _ackHandler.Create(ackId);
                try
                {
                    await SendAsync(message);
                }
                catch (Exception ex)
                {
                    ack.SetException(ex);
                }

                return await ack.Task;
            }

            public void HandleAck(AckMessage message)
            {
                _ackHandler.Ack(message);
            }

            public void Abort()
            {
                _clientWebSocket.Abort();
            }

            private async Task ConnectCoreAsync(Uri uri)
            {
                var client = new ClientWebSocket();
                client.Options.AddSubProtocol(_protocol);
                _clientWebSocket = client;
                try
                {
                    await client.ConnectAsync(uri, default);
                    Console.WriteLine("Connected");
                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex);
                    if (ex is WebSocketException wsEx)
                    {
                        if (wsEx.Message.Contains("404"))
                        {
                            _disableReconnection = true;
                        }
                    }
                    _ = Task.Run(() => HandleReconnectionAsync());
                    return;
                }

                _ = Task.Run(() => Listen(_clientWebSocket, default));
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
                                await _clientWebSocket.CloseOutputAsync(webSocketReceiveResult.CloseStatus ?? WebSocketCloseStatus.EndpointUnavailable, null, default);
                                Console.WriteLine($"Close with code: {webSocketReceiveResult.CloseStatus}");
                                if (webSocketReceiveResult.CloseStatus == WebSocketCloseStatus.NormalClosure)
                                {
                                    _disableReconnection = true;
                                }

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

                        // Read connection token
                        if (!_initialized)
                        {
                            var connected = JsonSerializer.Deserialize<Connected>(responseMessage.Text);
                            _connectionContext = new ConnectionContext(connected.connectionId, connected.reconnectionToken);
                            _initialized = true;
                        }

                        // Squence Ack
                        var duplicated = false;
                        var seqMsg = JsonSerializer.Deserialize<SequenceIdMessage>(responseMessage.Text);
                        if (seqMsg != null && seqMsg.sequenceId != null)
                        {
                            if (_latestSequenceId < seqMsg.sequenceId.Value)
                            {
                                _latestSequenceId = seqMsg.sequenceId.Value;
                            }
                            else
                            {
                                duplicated = true;
                            }

                            try
                            {
                                _ = SendAsync(JsonSerializer.Serialize(new
                                {
                                    type = "ack",
                                    sequenceId = _latestSequenceId,
                                }));
                            }
                            catch
                            {
                            }
                        }

                        if (!duplicated)
                        {
                            _messageReceivedSubject.OnNext(responseMessage);
                        }
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
                finally
                {
                    _ = Task.Run(() => HandleReconnectionAsync());
                }
            }

            private async Task HandleReconnectionAsync()
            {
                var uri = BuildReconnectionUri();
                if (_disableReconnection)
                {
                    OnDisconnected?.Invoke();
                }
                else
                {
                    Console.WriteLine("Reconnecting");
                    await Task.Delay(1000);
                    await ConnectCoreAsync(uri);
                }
            }

            private Uri BuildReconnectionUri()
            {
                var connectionContext = _connectionContext;
                if (connectionContext.ConnectionId != null && connectionContext.ReconnectionToken != null)
                {
                    var builder = new UriBuilder(_baseUri);
                    builder.Query = $"awps_connection_id={connectionContext.ConnectionId}&awps_reconnection_token={connectionContext.ReconnectionToken}";
                    return builder.Uri;
                }
                return _uri;
            }

            public void Dispose()
            {
                _disableReconnection = true;
                _ackHandler.Dispose();
                _clientWebSocket?.Dispose();
            }

            private enum ClientState
            {
                NotInitialized = 0,
                Connected = 1,
                Disconnected = 2,
                NotReconnectableDisconnected = 3,
            }

            private sealed class AckHandler : IDisposable
            {
                private readonly Timer _timer;
                public AckHandler()
                {
                    _timer = new Timer(_ =>
                    {
                        foreach(var entity in _cache)
                        {
                            if (entity.Value.ExpireTime < DateTime.UtcNow)
                            {
                                if (_cache.TryRemove(entity.Key, out var dEntity))
                                {
                                    dEntity.SetTimeout();
                                }
                            }
                        }
                    }, null, 3000, 2000);
                }

                private ConcurrentDictionary<ulong, AckEntity> _cache = new();

                public AckEntity Create(ulong ackId)
                {
                    return _cache.AddOrUpdate(ackId, new AckEntity(), (_, _) => new AckEntity());
                }

                public void Ack(AckMessage message)
                {
                    if (_cache.TryRemove(message.AckId, out var entity))
                    {
                        entity.SetResult(message);
                    }
                }

                public void Dispose()
                {
                    _timer.Dispose();
                }

                public class AckEntity
                {
                    private TaskCompletionSource<AckMessage> _tcs = new TaskCompletionSource<AckMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
                    public void SetResult(AckMessage message) => _tcs.TrySetResult(message);
                    public void SetTimeout() => _tcs.TrySetException(new TimeoutException());
                    public void SetException(Exception ex) => _tcs.TrySetException(ex);
                    public Task<AckMessage> Task => _tcs.Task;
                    public DateTime ExpireTime = DateTime.UtcNow + TimeSpan.FromSeconds(5);
                }
            }
        }
        public class SequenceIdMessage
        {
            public ulong? sequenceId { get; set; }
        }

        public class Connected
        {
            public string @event { get; set; }

            public string connectionId { get; set; }

            public string reconnectionToken { get; set; }
        }

        public struct ConnectionContext
        {
            public string ConnectionId { get; }

            public string ReconnectionToken { get; }

            public ConnectionContext(string connectionId, string reconnectionToken)
            {
                ConnectionId = connectionId;
                ReconnectionToken = reconnectionToken;
            }
        }

        public class AckMessage
        {
            public ulong AckId { get; }

            public bool Success { get; }

            public AckMessage(ulong ackId, bool success)
            {
                AckId = ackId;
                Success = success;
            }
        }

    }
}
