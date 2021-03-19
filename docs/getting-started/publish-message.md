---
layout: docs
title: "Quick start: publish and subscribe messages in Azure Web PubSub"
group: getting-started
toc: true
---

# Quick start: publish and subscribe messages in Azure Web PubSub

In this tutorial you'll learn how to publish messages and subscribe them using Azure Web PubSub.

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource

## Setup subscriber

In Azure Web PubSub you can connect to the service and subscribe to messages through WebSocket connections. WebSocket is a full-duplex communication channel so service can push messages to your client in real time. You can use any API/library that supports WebSocket to do so. Here is an example in node.js:

1.  First install required dependencies:

    ```bash
    npm install --save ws
    npm install --save https://github.com/vicancy/azure-websockets.git

    ```

2.  Then use WebSocket API to connect to service

    ```javascript
    const WebSocket = require('ws');
    const { WebPubSubServiceEndpoint } = require('azure-websockets/webpubsub');

    let endpoint = new WebPubSubServiceEndpoint('<CONNECTION_STRING>');
    let { url, token } = endpoint.clientNegotiate('my_hub');
    let ws = new WebSocket(`${url}?access_token=${token}`);

    ws.on('open', () => console.log('connected'));
    ws.on('message', data => console.log(data));;
    ```

The code above creates a WebSocket connection to connect to a hub called "my_hub". Hub is a logical unit in Azure Web PubSub where you can publish messages to a group of clients.

Azure Web PubSub by default doesn't allow anonymous connection. So in the code sample we use `WebPubSubServiceEndpoint.signClient()` in Web PubSub SDK to generate an access token and pass it to the service through a query string.

After connection is established, you will receive messages through the WebSocket connection. So in the last line of code we use `WebSocket.on('message', ...)` to listen to incoming messages.

Now replace `<CONNECTION_STRING>` with the connection string of your Web PubSub resource (you can find it in "Keys" tab in Azure portal) and run the code, you'll see a `connected` message printed out, indicating that you have successfully connected to the service.

## Setup publisher

Now let's use Azure Web PubSub SDK to publish a message to the service:

```javascript
const { WebPubSubServiceRestClient } = require('azure-websockets/webpubsub');

let serviceClient = new WebPubSubServiceRestClient('<CONNECTION_STRING>', 'my_hub');
serviceClient.sendToAll('Hello World');
```

The `sendToAll()` call simply sends a message to all connected clients in "my_hub" hub. Run the code above (also remember to set the connection string) and you'll see a "Hello World" message printed out in the subscriber.

Since the message is sent to all clients, you can open multiple subscribers at the same time and all of them will receive the same message.

The complete code sample of this tutorial can be found [here](samples/pubsub/).