
# Web PubSub for Socket.IO Quickstart (ESM)

A simple demo for Socket.IO with Azure Web PubSub using ESM

This demo is in ES module. Refer `quickstart` for CommonJS.

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