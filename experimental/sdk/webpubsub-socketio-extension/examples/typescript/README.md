
# Socket.IO Typescript Demo

A simple Typescript demo for Socket.IO with Azure Web PubSub

## How to use

### Update endpoint in `client.ts`

```js
const endpoint = "https://<host name of web pubsub for socket.io>";
```

### Run the server

```bash
npm install
npm run build
npm run start:server <web-pubsub-connection-string>
npm run start:client
```

You can see ping pong long between client and server.

`server-alternative.ts` provides another usage of API. Run it by `npm start:server-alternative <web-pubsub-connection-string>`.