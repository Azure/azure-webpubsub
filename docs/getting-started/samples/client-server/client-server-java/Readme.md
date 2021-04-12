## Here is a simple demo code for using both WebSocket client and server SDK.

### A simple WebSocket client
[client.simple](./client.simple) shows how to create a WebSocket connection to the service.

```batch
mvn compile
mvn package
java -jar target\webpubsub.sample.client.simple-1.0.jar [YourConnectionString] [YourHub]
```

### A Pub/Sub protocol client
[client-subprotocol](./client.subprotocol) shows how to create a WebSocket connection with `json.webpubsub.azure.v1` subprotocol to the service and join a group.

```batch
mvn compile
mvn package
java -jar target\webpubsub.sample.client.subprotocol-1.0.jar [YourConnectionString] [YourHub]
```

### Use server SDK
[server](./server) shows how to use the server SDK to send messages or manage the clients.

```batch
mvn compile
mvn package
java -jar target\webpubsub.sample.server-1.0.jar [YourConnectionString] [YourHub]
```

### Run the sample

Run the clients and use the server to send messages.
```
java -jar target\webpubsub.sample.client.simple-1.0.jar [YourConnectionString] [YourHub]
java -jar target\webpubsub.sample.client.subprotocol-1.0.jar [YourConnectionString] [YourHub]
java -jar target\webpubsub.sample.server-1.0.jar [YourConnectionString] [YourHub]

```
