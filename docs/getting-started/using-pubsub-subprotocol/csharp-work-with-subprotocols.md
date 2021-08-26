---
redirect_to: https://docs.microsoft.com/azure/azure-web-pubsub/tutorial-subprotocol?tabs=csharp
layout: docs
group: getting-started
subgroup: using-pubsub-subprotocol
toc: true
---

# Walk-through: Client Pub/Sub using subprotocol

In previous tutorials you have learned how to use WebSocket APIs to send and receive data with Azure Web PubSub. You can see there is no protocol needed when client is communicating with the service. For example, you can use `WebSocket.send()` to send any data and server will receive the data as is. This is easy to use, but the functionality is also limited. You cannot, for example, specify the event name when sending the event to server, or publish message to other clients instead of sending it to server. In this tutorial you will learn how to use subprotocol to extend the functionality of client.

The complete code sample of this tutorial can be found [here][code].

## Using a subprotocol

To specify a subprotocol, you just need to use the [protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#parameters) parameter when init the `ClientWebSocket` object, for example:

```csharp
var ws = new ClientWebSocket();
ws.Options.AddSubProtocol("json.webpubsub.azure.v1");
```

Currently Azure Web PubSub only supports one subprotocol: `json.webpubsub.azure.v1`.

> If you use other protocol names, they will be ignored by the service and passthrough to server in the connect event handler, so you can build your own protocols.

Now let's create a simple console subscriber using the subprotocol.

## Setup client subscriber
1.  Install dependencies

    You can use any API/library that supports WebSocket to communicate with the service. For this sample, we use package [Websocket.Client](https://github.com/Marfusios/websocket-client):

    ```bash
    mkdir clientsub
    cd clientsub
    dotnet new console
    dotnet add package Websocket.Client --version 4.3.30
    dotnet add package Azure.Messaging.WebPubSub --prerelease
    ```

2.  Update `Program.cs` to use `WebsocketClient` to connect to the service

    ```csharp
    using System;
    using System.Threading.Tasks;
    using Azure.Messaging.WebPubSub;
    using Websocket.Client;

    namespace clientsub
    {
        class Program
        {
            static async Task Main(string[] args)
            {
                if (args.Length != 2)
                {
                    Console.WriteLine("Usage: clientsub <connectionString> <hub>");
                    return;
                }
                var connectionString = args[0];
                var hub = args[1];

                // Either generate the URL or fetch it from server or fetch a temp one from the portal
                var serviceClient = new WebPubSubServiceClient(connectionString, hub);
                var url = serviceClient.GenerateClientAccessUri(userId: "user1", roles: new string[] {"webpubsub.joinLeaveGroup.demogroup"});

                using (var client = new WebsocketClient(url, () =>
                {
                    var inner = new ClientWebSocket();
                    inner.Options.AddSubProtocol("json.webpubsub.azure.v1");
                    return inner;
                }))
                {
                    // Disable the auto disconnect and reconnect because the sample would like the client to stay online even no data comes in
                    client.ReconnectTimeout = null;
                    client.MessageReceived.Subscribe(msg => Console.WriteLine($"Message received: {msg}"));
                    await client.Start();
                    Console.WriteLine("Connected.");
                    Console.Read();
                }
            }
        }
    }

    ```

The code above creates a WebSocket connection to connect to a hub in Azure Web PubSub using subprotocol `json.webpubsub.azure.v1`.

Azure Web PubSub by default doesn't allow anonymous connection, so in the code sample we use `WebPubSubServiceClient.GenerateClientAccessUri()` in Web PubSub SDK to generate a url to the service that contains the full URL with a valid access token. We also assign permission to join group `demogroup` when generating the token by setting the roles `webpubsub.joinLeaveGroup.demogroup`. For details about how to assign initial permission to the client, please check the details [here][subprotocolspec].

After connection is established, you will receive messages through the WebSocket connection. So we use `client.MessageReceived.Subscribe(msg => ...));` to listen to incoming messages.

Now save the code above and run it using `dotnet run "<connection-string>" <hub-name>` (`<connection-string>` can be found in "Keys" tab in Azure portal, `<hub-name>` can be any alphabetical string you like), you'll see a `connected` message printed out, indicating that you have successfully connected to the service. You'll also see a JSON format message received from the service containing the connection metadata, including the `connectionId` and the `userid` if you set `userId` when `GenerateClientAccessUri`:

```json
{"type":"system","event":"connected","userId":"user1","connectionId":"<the_connection_id>"}
```

You can see that with the help of subprotocol, you can get some metadata of the connection when the connection is connected.

Please also note that, instead of a plain text, client now receives a JSON message that contains more information, like what's the message type and where it is from. So you can use this information to do additional processing to the message (for example, display the message in a different style if it's from a different source), which you can find in later sections.

3. Update `Program.cs` to join group `demogroup` after the client is connected:
```csharp
using System.Text.Json;

namespace clientpubsub
{
    class Program
    {
        static async Task Main(string[] args)
        {
                .....
                await client.Start();
                Console.WriteLine("Connected.");
                /* Join Group `demogroup` */
                var ackId = 1;
                client.Send(JsonSerializer.Serialize(new
                {
                    type = "joinGroup",
                    group = "demogroup",
                    ackId = ackId++
                }));
                /*  ------------  */
                Console.Read();
            }
        }
    }
}
```

You can see that the above code send a json string to the service to ask for `joinGroup` `demoGroup`. `ackId` is optional, when it is set, the service returns an `ack` message to the client with this `ackId` for this action. Do increment the `ackId` for the next message.

Now save the code above and run it using `dotnet run "<connection-string>" <hub-name>`, you can see that after the client is connected, it receives an ACK message for the `joinGroup` action showing that the client joined the group successfully:
```JSON
{"type":"ack","ackId":1,"success":true}
```

## Publish messages from client

In the [create a chat app](../create-a-chat-app/js-handle-events.md) tutorial, when client sends a message through WebSocket connection, it will trigger a user event at server side. With subprotocol, client will have more functionalities by sending a JSON message. For example, you can publish message directly from client to other clients.

This will be useful if you want to stream a large amount of data to other clients in real time. Let's use this feature to build a log streaming application, which can stream console logs to the subscriber in real time.

Create client publisher as similar to the steps to setup the client subscriber:

1.  Install dependencies

    You can use any API/library that supports WebSocket to communicate with the service. For this sample, we use package [Websocket.Client](https://github.com/Marfusios/websocket-client):

    ```bash
    mkdir clientpub
    cd clientpub
    dotnet new console
    dotnet add package Websocket.Client --version 4.3.30
    dotnet add package Azure.Messaging.WebPubSub --prerelease
    ```

2.  Update `Program.cs` to use `WebsocketClient` to connect to the service

    ```csharp
    using System;
    using System.Threading.Tasks;
    using Azure.Messaging.WebPubSub;
    using Websocket.Client;

    namespace clientpub
    {
        class Program
        {
            static async Task Main(string[] args)
            {
                if (args.Length != 2)
                {
                    Console.WriteLine("Usage: clientpub <connectionString> <hub>");
                    return;
                }
                var connectionString = args[0];
                var hub = args[1];

                // Either generate the URL or fetch it from server or fetch a temp one from the portal
                var serviceClient = new WebPubSubServiceClient(connectionString, hub);
                var url = serviceClient.GenerateClientAccessUri(userId: "user1", roles: new string[] {"webpubsub.sendToGroup.demogroup"});

                using (var client = new WebsocketClient(url, () =>
                {
                    var inner = new ClientWebSocket();
                    inner.Options.AddSubProtocol("json.webpubsub.azure.v1");
                    return inner;
                }))
                {
                    // Disable the auto disconnect and reconnect because the sample would like the client to stay online even no data comes in
                    client.ReconnectTimeout = null;
                    client.MessageReceived.Subscribe(msg => Console.WriteLine($"Message received: {msg}"));
                    await client.Start();
                    Console.WriteLine("Connected.");

                    /* Send to group `demogroup` */
                    int ackId = 1;
                    var streaming = Console.ReadLine();
                    while (!string.IsNullOrEmpty(streaming))
                    {
                        client.Send(JsonSerializer.Serialize(new
                        {
                            type = "sendToGroup",
                            group = "demogroup",
                            dataType = "text",
                            data = streaming,
                            ackId = ackId++
                        }));
                        streaming = Console.ReadLine();
                    }
                    /*  ------------  */
                }
            }
        }
    }

    ```

    You can see that for client publisher, we set the role as `webpubsub.sendToGroup.demogroup` when `GenerateClientAccessUri`. And with every console input, the publisher send the message to the `demogroup`.

    You can see there is a new concept "group" here. Group is logical concept in a hub where you can publish message to a group of connections. In a hub you can have multiple groups and one client can subscribe to multiple groups at the same time. When using subprotocol, you can only publish to a group instead of broadcasting to the whole hub.


Now save the code above and run it using `dotnet run "<connection-string>" <hub-name>`, type any text and they will be recieved by the client subscriber in real time.

The complete code sample of this tutorial can be found [here][code].

[code]: https://github.com/Azure/azure-webpubsub/tree/main/samples/csharp/clientpubsub/
[subprotocolspec]: ../../references/pubsub-websocket-subprotocol.md#permissions
