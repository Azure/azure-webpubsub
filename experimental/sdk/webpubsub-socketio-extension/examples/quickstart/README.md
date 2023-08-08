
# Web PubSub for Socket.IO Quickstart

A simple demo for Socket.IO with Azure Web PubSub

## How to use

### Update endpoint in `client.js`

```js
const webPubSubEndpoint = "<web-pubsub-socketio-endpoint>";
```

### Run the server

```bash
npm install
npm run server -- "<connection-string>"
```

### Run the client
In another console, run
```bash
npm run client
```

You will see "stranger" printed on the server side and "world" printed on the client side.