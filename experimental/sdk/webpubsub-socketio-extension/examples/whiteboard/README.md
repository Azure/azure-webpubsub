
# Socket.IO Collaborative Whiteboard

A simple collaborative whiteboard for Socket.IO with Azure Web PubSub

### Update endpoint in `public/main.js`

```js
const webPubSubEndpoint = "https://<host name of web pubsub for socket.io>";
```

### Run the server

```bash
npm install
npm run start -- "<connection-string>"
```

And point your browser to `http://localhost:3000`. Optionally, specify
a port by supplying the `PORT` env variable.

## Features

- draw on the whiteboard and all other users will see you drawings live
