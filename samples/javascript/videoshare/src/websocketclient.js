const { UpstreamMessage, DownstreamMessage } = require('./generated/webpubsub').azure.webpubsub;

function WebSocketClient(urlFactory, userName, reconnectInterval, log) {
  this._userName = userName;
  this._urlFactory = urlFactory;
  this._protocol = 'protobuf.webpubsub.azure.v1';
  this._reconnectInterval = reconnectInterval;
  this._webSocket = null;
  this._log = log;
  this.onopen = this.onclose = this.onData = this.onProtobufData = null;
}

WebSocketClient.prototype.connect = async function () {
  let url = await this._urlFactory();
  let ws = this._webSocket = new WebSocket(url, this._protocol);

  ws.onopen = () => {
    this._log('WebSocket connected');

    var upstreamMessage = UpstreamMessage.create({
      joinGroupMessage: { group: `${this._userName}_control` }
    });
    this._webSocket.send(UpstreamMessage.encode(upstreamMessage).finish());

    upstreamMessage.joinGroupMessage.group = `${this._userName}_data`;
    this._webSocket.send(UpstreamMessage.encode(upstreamMessage).finish());
    if (this.onopen) this.onopen();
  };

  ws.onclose = () => {
    this._log('WebSocket disconnected');
    if (this.onclose) this.onclose();
    if (this._reconnectInterval > 0) {
      this._log(`Reconnect in ${this._reconnectInterval} ms`);
      setTimeout(() => this._connect(), this._reconnectInterval);
    }
  };

  ws.onmessage = async message => {
    var d = await message.data.arrayBuffer()
    let downstreamMessage = DownstreamMessage.decode(new Uint8Array(d));
    if (downstreamMessage.dataMessage) {
      let data = downstreamMessage.dataMessage.data;
      if (data) {
        if (data.data === 'binaryData' && this.onData) {
          this.onData(data.binaryData);
        } else if (data.data === 'protobufData' && this.onProtobufData) {
          this.onProtobufData(data.protobufData)
        }
      }
    }
  };
}

WebSocketClient.prototype.sendData = function (group, data) {
  const upstreamMessage = UpstreamMessage.create({
    sendToGroupMessage: { group, data: { binaryData: new Uint8Array(data) } }
  });
  this._webSocket.send(UpstreamMessage.encode(upstreamMessage).finish());
}

WebSocketClient.prototype.sendProtobufData = function (group, data, typeName) {
  const upstreamMessage = UpstreamMessage.create({
    sendToGroupMessage: {
      group,
      data: { protobufData: { type_url: `type.googleapis.com/${typeName}`, value: data } }
    }
  });
  this._webSocket.send(UpstreamMessage.encode(upstreamMessage).finish());
}

export default WebSocketClient;