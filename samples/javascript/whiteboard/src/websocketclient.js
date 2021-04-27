function WebSocketClient(urlFactory, reconnectInterval) {
  this._urlFactory = urlFactory;
  this._reconnectInterval = reconnectInterval;
  this._webSocket = null;
  this.onopen = this.onclose = this.onmessage = null;
  this._connect();
}

WebSocketClient.prototype._connect = async function () {
  let url = await this._urlFactory();
  let ws = this._webSocket = new WebSocket(url);
  ws.onopen = () => {
    console.log('WebSocket connected');
    if (this.onopen) this.onopen();
  };
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    if (this.onclose) this.onclose();
    if (this._reconnectInterval > 0) {
      console.log(`Reconnect in ${this._reconnectInterval} ms`);
      setTimeout(() => this._connect(), this._reconnectInterval);
    }
  };
  ws.onmessage = event => {
    if (this.onmessage) this.onmessage(event);
  };
}

WebSocketClient.prototype.send = function (data) {
  this._webSocket.send(data);
}

export default WebSocketClient;