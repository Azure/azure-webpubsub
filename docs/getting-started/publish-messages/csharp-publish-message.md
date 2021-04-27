---
layout: docs
group: getting-started
subgroup: publish-messages
toc: true
---

# Quick start: publish and subscribe messages in Azure Web PubSub

In this tutorial you'll learn how to publish messages and subscribe them using Azure Web PubSub with CSharp.

## Prerequisites

1. [.NET Core 3.1 or above](https://dotnet.microsoft.com/download)
2. Create an Azure Web PubSub resource

## Setup subscriber

In Azure Web PubSub you can connect to the service and subscribe to messages through WebSocket connections. WebSocket is a full-duplex communication channel so service can push messages to your client in real time. You can use any API/library that supports WebSocket to do so. For this sample, we use package [Websocket.Client](https://github.com/Marfusios/websocket-client):

1.  First create a console app and add necessary dependencies:

    ```bash
    mkdir subscriber
    cd subscriber
    dotnet new console
    dotnet add package Websocket.Client --version 4.3.30
    dotnet add package Azure.Messaging.WebPubSub --version 1.0.0-beta.1 --source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json
    ```

2.  Update `Program.cs` to use `WebsocketClient` to connect to the service

    ```csharp
    using System;
    using System.Threading.Tasks;
    using Azure.Messaging.WebPubSub;
    using Websocket.Client;

    namespace subscriber
    {
        class Program
        {
            static async Task Main(string[] args)
            {
                if (args.Length != 2)
                {
                    Console.WriteLine("Usage: subscriber <connectionString> <hub>");
                    return;
                }
                var connectionString = args[0];
                var hub = args[1];

                // Either generate the URL or fetch it from server or fetch a temp one from the portal
                var serviceClient = new WebPubSubServiceClient(connectionString, hub);
                var url = serviceClient.GetClientAccessUri();

                using (var client = new WebsocketClient(url))
                {
                    client.MessageReceived.Subscribe(msg => Console.WriteLine($"Message received: {msg}"));
                    await client.Start();
                    Console.WriteLine("Connected.");
                }

                Console.Read();
            }
        }
    }

    ```

The code above creates a WebSocket connection to connect to a hub in Azure Web PubSub. Hub is a logical unit in Azure Web PubSub where you can publish messages to a group of clients.

Azure Web PubSub by default doesn't allow anonymous connection, so in the code sample we use `WebPubSubServiceClient.GetClientAccessUri()` in Web PubSub SDK to generate a url to the service that contains the full URL with a valid access token.

After connection is established, you will receive messages through the WebSocket connection. So we use `client.MessageReceived.Subscribe(msg => ...));` to listen to incoming messages.

Now save the code above and run it using `dotnet run "<connection-string>" <hub-name>` (`<connection-string>` can be found in "Keys" tab in Azure portal, `<hub-name>` can be any alphabetical string you like), you'll see a `connected` message printed out, indicating that you have successfully connected to the service.

> Make sure your connection string is enclosed by quotes ("") in Linux as connection string contains semicolon.

## Setup publisher

Now let's use Azure Web PubSub SDK to publish a message to the service. First let's create a publisher project:
```bash

mkdir publisher
cd publisher
dotnet new console
dotnet add package Azure.Messaging.WebPubSub --version 1.0.0-beta.1 --source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json

```

```csharp
using System;
using System.Linq;
using Azure.Messaging.WebPubSub;

namespace publisher
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length != 3) {
                Console.WriteLine("Usage: publisher <connectionString> <hub> <message>");
                return;
            }
            var connectionString = args[0];
            var hub = args[1];
            var message = args[2];
            
            // Either generate the token or fetch it from server or fetch a temp one from the portal
            var serviceClient = new WebPubSubServiceClient(connectionString, hub);
            serviceClient.SendToAll(message);
        }
    }
}

```

The `sendToAll()` call simply sends a message to all connected clients in a hub. Save the code above and run `dotnet run "<connection-string>" <hub-name> <message>` with the same connection string and hub name you used in subscriber, you'll see the message printed out in the subscriber.

Since the message is sent to all clients, you can open multiple subscribers at the same time and all of them will receive the same message.

The complete code sample of this tutorial can be found [here](https://github.com/Azure/azure-webpubsub/tree/main/samples/javascript/pubsub/).
