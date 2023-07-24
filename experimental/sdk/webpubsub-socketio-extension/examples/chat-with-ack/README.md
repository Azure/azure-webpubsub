
# Socket.IO Chat-With-ack

A simple chat-with-ack demo for Socket.IO with Azure Web PubSub.

## How to use

```
$ yarn install
$ yarn start <web-pubsub-connnection-string>
```

Then, visit http://localhost:3000 in web browser.

## Features compared with demo `chat`
This demo has two extra acknowledge mechanism:
1. Server acks a message from a client.
2. Clients ack broadcast message from the server.