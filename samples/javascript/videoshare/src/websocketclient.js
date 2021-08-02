var pb = require('./proto/pubsub_pb');

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

    var upstreamMessage = new proto.video.UpstreamMessage();
    var joinGroupMessage = new proto.video.UpstreamMessage.JoinGroupMessage();
    joinGroupMessage.setGroup(`${this._userName}_control`);
    upstreamMessage.setJoinGroupMessage(joinGroupMessage);
    this._webSocket.send(upstreamMessage.serializeBinary());

    joinGroupMessage.setGroup(`${this._userName}_data`);
    this._webSocket.send(upstreamMessage.serializeBinary());
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
    let downstreamMessage = proto.video.DownstreamMessage.deserializeBinary(d);
    if (downstreamMessage.hasDataMessage()) {
      let dataMessage = downstreamMessage.getDataMessage();
      if (dataMessage.hasData()) {
        let data = dataMessage.getData();
        if (data.hasBinaryData() && this.onData) {
          this.onData(data.getBinaryData());
        } else if (data.hasProtobufData() && this.onProtobufData) {
          this.onProtobufData(data.getProtobufData())
        }
      }
    }
  };
}

WebSocketClient.prototype.sendData = function (group, data) {
  const messageData = new proto.video.MessageData();
  messageData.setBinaryData(data)

  const sendToGroupMessage = new proto.video.UpstreamMessage.SendToGroupMessage();
  sendToGroupMessage.setGroup(group);
  sendToGroupMessage.setData(messageData)

  const upstreamMessage = new proto.video.UpstreamMessage();
  upstreamMessage.setSendToGroupMessage(sendToGroupMessage)

  this._webSocket.send(upstreamMessage.serializeBinary());
}

WebSocketClient.prototype.sendProtobufData = function (group, data, typeName) {
  const any = new proto.google.protobuf.Any();
  any.pack(data, typeName)

  const messageData = new proto.video.MessageData();
  messageData.setProtobufData(any)

  const sendToGroupMessage = new proto.video.UpstreamMessage.SendToGroupMessage();
  sendToGroupMessage.setGroup(group);
  sendToGroupMessage.setData(messageData)

  const upstreamMessage = new proto.video.UpstreamMessage();
  upstreamMessage.setSendToGroupMessage(sendToGroupMessage)

  this._webSocket.send(upstreamMessage.serializeBinary());
}

export default WebSocketClient;