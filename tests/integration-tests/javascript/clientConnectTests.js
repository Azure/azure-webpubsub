import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { isLiveMode, assertEnvironmentVariable } from '@azure-tools/test-recorder';
import { Context } from 'mocha';
import { assert } from 'chai';
import ws from 'ws';

const { WebSocket } = ws;

class ClientConnectTests {
  async simpleWebSocketClientCanConnectAndReceiveMessages() {
    const options = {};
    const serviceClient = new WebPubSubServiceClient(process.env.WEB_PUBSUB_CONNECTION_STRING, 'simpleWebSocketClientCanConnectAndReceiveMessages', options);

    const url = await serviceClient.getClientAccessUri();
    const client = new WebSocketClient(url, this.isSimpleClientEndSignal);

    await client.waitForConnected();

    const textContent = 'Hello';
    await serviceClient.sendToAll(textContent, 'text/plain');
    const jsonContent = { hello: 'world' };
    await serviceClient.sendToAll(JSON.stringify(jsonContent), 'application/json');
    const binaryContent = Buffer.from('Hello');
    await serviceClient.sendToAll(binaryContent, 'application/octet-stream');

    await serviceClient.sendToAll(this.getEndSignalBytes(), 'application/octet-stream');

    await client.lifetimeTask();
    const frames = client.receivedFrames;

    assert.equal(frames.length, 3);
    assert.equal(frames[0].messageAsString, textContent);
    assert.equal(frames[1].messageAsString, JSON.stringify(jsonContent));
    assert.deepEqual(frames[2].messageBytes, binaryContent);
  }

  async webSocketClientWithInitialGroupCanConnectAndReceiveGroupMessages() {
    const options = {};
    const serviceClient = new WebPubSubServiceClient(process.env.WEB_PUBSUB_CONNECTION_STRING, 'webSocketClientWithInitialGroupCanConnectAndReceiveGroupMessages', options);

    const group = 'GroupA';
    const url = await serviceClient.getClientAccessUri({ groups: [group] });
    const client = new WebSocketClient(url, this.isSimpleClientEndSignal);

    await client.waitForConnected();

    const textContent = 'Hello';
    await serviceClient.sendToGroup(group, textContent, 'text/plain');
    const jsonContent = { hello: 'world' };
    await serviceClient.sendToGroup(group, JSON.stringify(jsonContent), 'application/json');
    const binaryContent = Buffer.from('Hello');
    await serviceClient.sendToGroup(group, binaryContent, 'application/octet-stream');

    await serviceClient.sendToGroup(group, this.getEndSignalBytes(), 'application/octet-stream');

    await client.lifetimeTask();
    const frames = client.receivedFrames;

    assert.equal(frames.length, 3);
    assert.equal(frames[0].messageAsString, textContent);
    assert.equal(frames[1].messageAsString, JSON.stringify(jsonContent));
    assert.deepEqual(frames[2].messageBytes, binaryContent);
  }

  async subprotocolWebSocketClientCanConnectAndReceiveMessages() {
    const options = {};
    const serviceClient = new WebPubSubServiceClient(process.env.WEB_PUBSUB_CONNECTION_STRING, 'subprotocolWebSocketClientCanConnectAndReceiveMessages', options);

    const url = await serviceClient.getClientAccessUri();
    const client = new WebSocketClient(url, this.isSubprotocolClientEndSignal, ws => ws.protocol = 'json.webpubsub.azure.v1');

    await client.waitForConnected();

    const textContent = 'Hello';
    await serviceClient.sendToAll(textContent, 'text/plain');
    const jsonContent = { hello: 'world' };
    await serviceClient.sendToAll(JSON.stringify(jsonContent), 'application/json');
    const binaryContent = Buffer.from('Hello');
    await serviceClient.sendToAll(binaryContent, 'application/octet-stream');

    await serviceClient.sendToAll(this.getEndSignalBytes(), 'application/octet-stream');

    await client.lifetimeTask();
    const frames = client.receivedFrames;

    assert.equal(frames.length, 4);
    const connected = JSON.parse(frames[0].messageAsString);
    assert.isNotNull(connected);
    assert.equal(connected.event, 'connected');
    assert.equal(frames[1].messageAsString, JSON.stringify({ type: 'message', from: 'server', dataType: 'text', data: textContent }));
    assert.equal(frames[2].messageAsString, JSON.stringify({ type: 'message', from: 'server', dataType: 'json', data: jsonContent }));
    assert.deepEqual(frames[3].messageBytes, Buffer.from(JSON.stringify({ type: 'message', from: 'server', dataType: 'binary', data: binaryContent.toString('base64') })));
  }

  isSimpleClientEndSignal(frame) {
    const bytes = frame.messageBytes;
    return bytes.length === 3 && bytes[0] === 5 && bytes[1] === 1 && bytes[2] === 1;
  }

  isSubprotocolClientEndSignal(frame) {
    return frame.messageAsString === JSON.stringify({ type: 'message', from: 'server', dataType: 'binary', data: 'BQEB' });
  }

  getEndSignalBytes() {
    return Buffer.from([5, 1, 1]);
  }
}

class WebSocketClient {
  constructor(uri, isEndSignal, configureOptions) {
    this.uri = uri;
    this.isEndSignal = isEndSignal;
    this.ws = new WebSocket(uri);
    if (configureOptions) configureOptions(this.ws);
    this.receivedFrames = [];
    this.waitForConnected = this.connect();
    this.lifetimeTask = this.receiveLoop();
  }

  async connect() {
    return new Promise((resolve) => {
      this.ws.on('open', resolve);
    });
  }

  async receiveLoop() {
    await this.waitForConnected;
    return new Promise((resolve) => {
      this.ws.on('message', (data) => {
        const frame = new WebSocketFrame(data, this.ws.protocol);
        if (this.isEndSignal(frame)) {
          resolve();
        } else {
          this.receivedFrames.push(frame);
        }
      });
    });
  }

  async send(data, options) {
    this.ws.send(data, options);
  }

  async close() {
    this.ws.close();
  }
}

class WebSocketFrame {
  constructor(data, type) {
    this.messageBytes = Buffer.from(data);
    this.messageAsString = type === 'text' ? data.toString() : null;
  }
}

export default ClientConnectTests;
