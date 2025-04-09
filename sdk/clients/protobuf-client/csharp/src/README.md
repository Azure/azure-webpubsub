# Azure Web PubSub protobuf protocol client for .NET

[Web PubSub](https://aka.ms/awps/doc) is an Azure-managed service that helps developers easily build web applications with real-time features and publish-subscribe patterns. Any scenario that requires real-time publish-subscribe messaging between server and clients or among clients can use Web PubSub. Traditional real-time features that often require polling from the server or submitting HTTP requests can also use Web PubSub.

You can use this library to add protobuf subprotocols including `protobuf.reliable.webpubsub.azure.v1` and `protobuf.webpubsub.azure.v1` support to the Azure.Messaging.WebPubSub.Client library.

## Usage

### Create a client connection with protobuf protocol

You can choose between the standard protobuf protocol or the reliable protobuf protocol based on your needs:

```csharp
using Azure.Messaging.WebPubSub.Client;
using Azure.Messaging.WebPubSub.Client.Protobuf;

// Create a WebPubSub service client first to get an access token
string connectionString = "<your-connection-string>";
string hubName = "sample_chat";

// Create a service client to get an access token
var serviceClient = new WebPubSubServiceClient(connectionString, hubName);
            
// Generate a client access URL with appropriate permissions
var clientAccessUri = await serviceClient.GetClientAccessUriAsync(
    userId: Guid.NewGuid().ToString(), 
    roles: new[] 
    { 
        "webpubsub.joinLeaveGroup.testGroup", 
        "webpubsub.sendToGroup.testGroup" 
    });

// Create a client with the standard protobuf protocol
var client = new WebPubSubClient(clientAccessUri, new WebPubSubClientOptions
{
    Protocol = new WebPubSubProtobufProtocol()
});

// OR create a client with the reliable protobuf protocol
var reliableClient = new WebPubSubClient(clientAccessUri, new WebPubSubClientOptions
{
    Protocol = new WebPubSubProtobufReliableProtocol()
});

// Connect to the service
await client.StartAsync();
```

### Receiving messages

Set up event handlers before starting the connection:

```csharp
// Handle connection established event
client.Connected += eventArgs =>
{
    Console.WriteLine($"Connection {eventArgs.ConnectionId} is connected.");
    return Task.CompletedTask;
};

// Handle disconnection event
client.Disconnected += eventArgs =>
{
    Console.WriteLine($"Connection disconnected: {eventArgs.DisconnectedMessage}");
    return Task.CompletedTask;
};

// Handle server messages
client.ServerMessageReceived += eventArgs =>
{
    if (eventArgs.Message.DataType == WebPubSubDataType.Binary)
    {
        var base64 = Convert.ToBase64String(eventArgs.Message.Data.ToArray());
        Console.WriteLine($"Received server message: {base64}");
    }
    else
    {
        Console.WriteLine($"Received server message: {eventArgs.Message.Data}");
    }
    return Task.CompletedTask;
};

// Handle group messages
client.GroupMessageReceived += eventArgs =>
{
    if (eventArgs.Message.DataType == WebPubSubDataType.Binary)
    {
        var base64 = Convert.ToBase64String(eventArgs.Message.Data.ToArray());
        Console.WriteLine($"Received message from {eventArgs.Message.Group}: {base64}");
    }
    else
    {
        Console.WriteLine($"Received message from {eventArgs.Message.Group}: {eventArgs.Message.Data}");
    }
    return Task.CompletedTask;
};
```

### Sending messages

You can send different types of data:

```csharp
// Send a text message to the group
await client.SendToGroupAsync("testGroup", 
    BinaryData.FromString("hello world"), 
    WebPubSubDataType.Text);

// Send a JSON object to the group
var jsonObject = new { a = 12, b = "hello" };
await client.SendToGroupAsync("testGroup",
    BinaryData.FromString(JsonSerializer.Serialize(jsonObject)),
    WebPubSubDataType.Json);

// Send a JSON string to the group
await client.SendToGroupAsync("testGroup",
    BinaryData.FromString("\"hello json\""),
    WebPubSubDataType.Json);

// Send binary data to the group
var buffer = Convert.FromBase64String("aGVsbG9w"); // "hellop" in base64
await client.SendToGroupAsync("testGroup",
    BinaryData.FromBytes(buffer),
    WebPubSubDataType.Binary);
```

## Samples

You can find a complete working sample in the [WebPubSubProtobufSample](../samples/WebPubSubProtobufSample/) directory.
