# Azure Web PubSub protobuf protocol client for .NET

[Web PubSub](https://aka.ms/awps/doc) is an Azure-managed service that helps developers easily build web applications with real-time features and publish-subscribe patterns. Any scenario that requires real-time publish-subscribe messaging between server and clients or among clients can use Web PubSub. Traditional real-time features that often require polling from the server or submitting HTTP requests can also use Web PubSub.

You can use this library to add protobuf subprotocols including `protobuf.reliable.webpubsub.azure.v1` and `protobuf.webpubsub.azure.v1` support to the Azure.Messaging.WebPubSub.Client library.

## Schema source and compatibility

The [canonical wire schema](../../../../../protocols/protobuf.webpubsub.azure.v1/webpubsub.v1.proto)
is the single source for this client's generated messages. Update that schema rather
than keeping a client-local copy. The project references it directly with `ProtoRoot`
and `Link`, generates messages only (`GrpcServices="None"`), and resolves
`google.protobuf.Any` through the standard includes supplied by `Grpc.Tools`.

- The generated namespace remains `Azure.Messaging.WebPubSub.Client.Protobuf`.
    Generated acknowledgment and sequence ID properties change from `long` to `ulong`
    to match the wire's `uint64` fields. The renamed schema changes the public reflection
    class from `WebpubsubClientReflection` to `WebpubsubV1Reflection`. These are intentional
    breaking changes for consumers using generated types or descriptors directly.
- The high-level SDK APIs still use `long` / `long?`. Both protocol variants accept IDs
    from `0` through `long.MaxValue`; an omitted optional ID remains omitted. Negative
    outgoing IDs throw `ArgumentOutOfRangeException`. Incoming acknowledgment or data
    sequence IDs above `long.MaxValue` throw `InvalidDataException`, rather than wrapping.
    Generated messages themselves support the full `ulong` range.
- Schema declarations for metadata, TTL, ping/pong, invocation, group state, and
    streaming do not add high-level client support for those features. Existing message
    handling is unchanged, including the legacy encoding of outgoing JSON as text data.

## Usage

### Create a client connection with protobuf protocol

You can choose between the standard protobuf protocol or the reliable protobuf protocol based on your needs:

```csharp
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
```

### Receiving messages

Set up event handlers before starting the connection:

```csharp
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
