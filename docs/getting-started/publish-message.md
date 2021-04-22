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
    npm init -y
    npm install --save ws
    npm install --save https://www.myget.org/F/azure-webpubsub-dev/npm/@azure/web-pubsub/-/1.0.0-preview.2

    ```

2.  Then use WebSocket API to connect to service

    ```javascript
    const WebSocket = require('ws');
    const { WebPubSubServiceClient } = require('@azure/web-pubsub');

    async function main() {
      if (process.argv.length !== 4) {
        console.log('Usage: node subscribe <connection-string> <hub-name>');
        return 1;
      }

      let serviceClient = new WebPubSubServiceClient(process.argv[2], process.argv[3]);
      let token = await serviceClient.getAuthenticationToken();
      let ws = new WebSocket(token.url);
      ws.on('open', () => console.log('connected'));
      ws.on('message', data => console.log(data));;
    }

    main();
    ```

The code above creates a WebSocket connection to connect to a hub in Azure Web PubSub. Hub is a logical unit in Azure Web PubSub where you can publish messages to a group of clients.

Azure Web PubSub by default doesn't allow anonymous connection, so in the code sample we use `WebPubSubServiceClient.getAuthenticationToken()` in Web PubSub SDK to generate a url to the service that contains an access token and hub name.

After connection is established, you will receive messages through the WebSocket connection. So we use `WebSocket.on('message', ...)` to listen to incoming messages.

Now save the code above as `subscribe.js` and run it using `node subscribe "<connection-string>" <hub-name>` (`<connection-string>` can be found in "Keys" tab in Azure portal, `<hub-name>` can be any alphabetical string you like), you'll see a `connected` message printed out, indicating that you have successfully connected to the service.

> Make sure your connection string is enclosed by quotes ("") in Linux as connection string contains semicolon.

## Setup publisher

Now let's use Azure Web PubSub SDK to publish a message to the service:

```javascript
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

if (process.argv.length !== 5) {
  console.log('Usage: node publish <connection-string> <hub-name> <message>');
  return 1;
}

let serviceClient = new WebPubSubServiceClient(process.argv[2], process.argv[3]);

// by default it uses `application/json`, specify contentType as `text/plain` if you want plain-text
serviceClient.sendToAll(process.argv[4], { contentType: "text/plain" });
```

The `sendToAll()` call simply sends a message to all connected clients in a hub. Save the code above as `publish.js` and run `node publish "<connection-string>" <hub-name> <message>` with the same connection string and hub name you used in subscriber, you'll see the message printed out in the subscriber.

Since the message is sent to all clients, you can open multiple subscribers at the same time and all of them will receive the same message.

The complete code sample of this tutorial can be found [here](https://github.com/Azure/azure-webpubsub/tree/main/samples/javascript/pubsub/).