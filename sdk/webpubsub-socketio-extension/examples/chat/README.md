
# Socket.IO Chat

A simple chat demo for Socket.IO with Azure Web PubSub

## How to use

### Update endpoint in `public/main.js`

```js
const webPubSubEndpoint = "https://<host name of web pubsub for socket.io>";
```

### Run the server

```bash
npm install
npm run start -- "<connection-string>"
```

And point your browser to `http://localhost:3000`.

## Features

- Multiple users can join a chat room by each entering a unique username on website load.
- Users can type chat messages to send to the chat room.
- A notification is sent to all users when a user joins or leaves the chatroom.