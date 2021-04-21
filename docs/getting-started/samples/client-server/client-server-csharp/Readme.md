## Here is a simple demo code for using both WebSocket client and server SDK.

### A simple WebSocket client
[client.simple](./client.simple) shows how to create a WebSocket connection to the service.

You can use the SDK to generate client URL with authed token to connect to the service.

```batch
dotnet add package Azure.Messaging.WebPubSub --version 1.0.0-alpha.20210402.1 --source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json
dotnet run [YourConnectionString] [YourHub]
```

### A Pub/Sub protocol client
[client.subprotocol](./client.subprotocol) shows how to create a WebSocket connection with `json.webpubsub.azure.v1` subprotocol to the service and join a group.

You can use the SDK to generate client URL with authed token to connect to the service.

```batch
dotnet add package Azure.Messaging.WebPubSub --version 1.0.0-alpha.20210402.1 --source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json
dotnet run [YourConnectionString] [YourHub]
```

### Use server SDK
[server](./server) shows how to use the server SDK to send messages or manage the clients.

```batch
dotnet add package Azure.Messaging.WebPubSub --version 1.0.0-alpha.20210402.1 --source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json
dotnet run [YourConnectionString] [YourHub]
```

### Run client and server samples together

Under current folder:

1. Run the simple client:
```batch
dotnet run --project client.simple\client.simple.csproj [YourConnectionString] [YourHub]
```
2. Run the subprotocol client:

```batch
dotnet run --project client.subprotocol\client.subprotocol.csproj [YourConnectionString] [YourHub]
```

3. Run the server and send messages, check if clients receive the messages:

```batch
dotnet run --project server\server.csproj [YourConnectionString] [YourHub]
```
