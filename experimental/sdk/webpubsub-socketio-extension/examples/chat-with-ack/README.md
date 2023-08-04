
# Socket.IO Chat-With-ack

A simple chat-with-ack demo for Socket.IO with Azure Web PubSub.

### Update endpoint in `public/main.js`

```js
const webPubSubEndpoint = "https://<endpoint of web pubsub for socket.io>";
```

### Run the server

```bash
npm install
npm run start -- "<connection-string>"
```

Then, visit http://localhost:3000 in web browser.

## Features compared with demo `chat`
This demo has two extra acknowledge mechanism:
1. Server acks a message from a client.
2. Clients ack broadcast message from the server.