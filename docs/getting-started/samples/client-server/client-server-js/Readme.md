## Here is a simple demo code for using both WebSocket client and server SDK.

### A simple WebSocket client
[client-simple.js](./client-simple.js) shows how to create a WebSocket connection to the service.

### A Pub/Sub protocol client
[client-subprotocol.js](./client-subprotocol.js) shows how to create a WebSocket connection with `json.webpubsub.azure.v1` subprotocol to the service and join a group.

[client-pubsub.js](./client-pubsub.js) shows how to leverage the subprotocol to do client-side subscribe and publish.

### Use server SDK
[server.js](./server.js) shows how to use the server SDK to send messages or manage the clients.

### Run the sample
```
npm install
node client-simple.js [YourConnectionString] [YourHub]
node client-subprotocol.js [YourConnectionString] [YourHub]
node server.js [YourConnectionString] [YourHub]
```
