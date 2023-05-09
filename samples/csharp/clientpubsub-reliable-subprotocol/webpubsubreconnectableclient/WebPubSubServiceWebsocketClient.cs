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
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Websocket.Client;
using Websocket.Client.Models;

namespace ClientPubSub
{
    public class WebPubSubServiceWebsocketClient
    {
        private volatile ClientWebSocket _clientWebSocket;
        private volatile bool _disableReconnection = false;
        private volatile bool _initialized = false;
        private ulong _latestSequenceId = 0;
        private string _protocol;

        private readonly Subject<ResponseMessage> _messageReceivedSubject = new Subject<ResponseMessage>();

        public IObservable<ResponseMessage> MessageReceived => _messageReceivedSubject.AsObservable();

        private readonly Uri _uri;
        private readonly string _baseUri;
        private readonly ConcurrentDictionary<ulong, AckEntity> _cache = new();

        private string _connectionId;
        private string _reconnectionToken;
        

        public WebPubSubServiceWebsocketClient(Func<Uri> uriFactory, string protocol)
        {
            _uri = uriFactory.Invoke();
            var builder = new UriBuilder(_uri);
            builder.Query = null;
            _baseUri = builder.Uri.AbsoluteUri;
            _protocol = protocol;
        }

        public async Task StartAsync()
        {
            Console.WriteLine("Starting a new client");
            var uri = _uri;
            if (_connectionId != null && _reconnectionToken != null)
            {
                uri = BuildReconnectionUri();
            }

            await ConnectCoreAsync(uri);
            _ = Task.Run(() => Listen(_clientWebSocket, default));
        }

        public async Task SendAsync(string message)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(message);
            ArraySegment<byte> buffer = new ArraySegment<byte>(bytes);

            await _clientWebSocket.SendAsync(buffer, WebSocketMessageType.Text, endOfMessage: true, default).ConfigureAwait(continueOnCapturedContext: false);
        }

        public async Task<AckMessage> SendAsync(ulong ackId, string message)
        {
            var ack = CreateAckEntity(ackId);
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
            if (_cache.TryRemove(message.AckId, out var entity))
            {
                entity.SetResult(message);
            }
        }

        public void Stop()
        {
            _disableReconnection = true;
            _clientWebSocket?.Dispose();
        }

        public void Abort()
        {
            _clientWebSocket.Abort();
        }

        private Uri BuildReconnectionUri()
        { 
            if (_connectionId != null && _reconnectionToken != null)
            {
                var builder = new UriBuilder(_baseUri);
                builder.Query = $"awps_connection_id={_connectionId}&awps_reconnection_token={_reconnectionToken}";
                return builder.Uri;
            }
            return _uri;
        }

        private async Task ConnectCoreAsync(Uri uri)
        {
            var client = new ClientWebSocket();
            client.Options.AddSubProtocol(_protocol);
            try
            {
                await client.ConnectAsync(uri, default);
                _clientWebSocket = client;
                Console.WriteLine("Connected");
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex);
                throw;
            }
        }

        private AckEntity CreateAckEntity(ulong ackId)
        {
            return _cache.AddOrUpdate(ackId, new AckEntity(), (_, _) => new AckEntity());
        }

        private async Task HandleReconnectionAsync()
        {
            foreach(var entity in _cache)
            {
                if (_cache.TryRemove(entity))
                {
                    entity.Value.SetCancelled();
                }
            }

            var uri = BuildReconnectionUri();
            if (!_disableReconnection)
            {
                while (true)
                {
                    try
                    {
                        await Task.Delay(1000);
                        Console.WriteLine("Reconnecting");
                        await ConnectCoreAsync(uri);
                        _ = Task.Run(() => Listen(_clientWebSocket, default));
                        return;
                    }
                    catch(Exception ex)
                    {
                        Console.WriteLine(ex);
                    }
                }
            }
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
                    var jobject = JsonObject.Parse(responseMessage.Text);
                    if (!_initialized)
                    {
                        if (jobject["type"].ToString() == "system" && jobject["event"].ToString() == "connected")
                        {
                            _connectionId = jobject["connectionId"].ToString();
                            _reconnectionToken = jobject["reconnectionToken"].ToString();
                            _initialized = true;
                        }
                    }

                    // Squence Ack
                    var duplicated = false;
                    if (jobject["sequenceId"] != null)
                    {
                        var sequenceId = jobject["sequenceId"].GetValue<ulong>();

                        if (_latestSequenceId < sequenceId)
                        {
                            _latestSequenceId = sequenceId;
                        }
                        else
                        {
                            duplicated = true;
                        }

                        try
                        {
                            _ = SendAsync(JsonSerializer.Serialize(new SequenceAckMessage { sequenceId = _latestSequenceId }));
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
            catch (Exception ex4)
            {
                causedException = ex4;
            }
            finally
            {
                if (client.CloseStatus == WebSocketCloseStatus.PolicyViolation)
                {
                    _disableReconnection = true;
                }
                _ = Task.Run(() => HandleReconnectionAsync());
            }
        }

        public class AckEntity
        {
            private TaskCompletionSource<AckMessage> _tcs = new TaskCompletionSource<AckMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
            public void SetResult(AckMessage message) => _tcs.TrySetResult(message);
            public void SetCancelled() => _tcs.TrySetException(new OperationCanceledException());
            public void SetException(Exception ex) => _tcs.TrySetException(ex);
            public Task<AckMessage> Task => _tcs.Task;
        }

        public class SequenceAckMessage
        {
            public string type => "sequenceAck";
            public ulong sequenceId { get; set; }
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
