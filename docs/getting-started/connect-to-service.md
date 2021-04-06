---
layout: docs
title: Connect to service
group: getting-started
toc: true
---

## Overview

1. Create your Web PubSub service through portal.

2. Copy the *Client URL* from the portal, "Keys" blade
![Get URL](./../images/portal_client_url.png)

3. Connect to the service using simple WebSocket API. Samples on using WebSocket Client API can be found [here](./samples/client-connect)

4. Use Server SDK to send messages to clients or manage the clients

## Code samples
- Clients
    - [JavaScript](#javascript)
    - [CSharp](#csharp)
    - [Python](#python)
- Server SDK
    - [JavaScript](#javascript)
    - [CSharp](#csharp)
    - [Python](#python)

## Clients
### JavaScript

#### Dependency
1. For node, please install package `ws`
    ```node
    npm install ws
    ```
2. For browser, `WebSocket` is natively supported.

#### Simple WebSocket Client
Sample code [here](./samples/client-connect/simple-client.js)

```js
const WebSocket = require('ws');
const client = new WebSocket("{Client_URL}");
client.on('open', () => {
    client.on('message', msg => console.log(msg));
});
```

#### PubSub WebSocket Client
> NOTE
> Make sure to include neccessory roles when generating the token.

![Client Role](./../images/portal_client_roles.png)

Sample code [here](./samples/client-connect/pubsub-client.js)

```js
const WebSocket = require('ws');

async function main() {
  const subscriber = new WebSocket("{Client_URL}", "json.webpubsub.azure.v1");
  const publisher = new WebSocket("{Client_URL}", "json.webpubsub.azure.v1");

  publisher.on('message', msg => {
    console.log(msg);
  });
  const subscriberConnected = new Promise(resolve => subscriber.once('open', resolve));
  const publisherConnected = new Promise(resolve => publisher.once('open', resolve));
  const joined = new Promise(resolve => {
    subscriber.on('message', msg => {
      console.log(msg);
      const obj = JSON.parse(msg);
      if (obj.ackId && obj.success) {
        resolve();
      }
    });
  });

  // make sure both are connected
  await subscriberConnected;
  await publisherConnected;

  subscriber.send(JSON.stringify({
    type: "joinGroup",
    group: "group1",
    ackId: 1, // use ackId to receive ack messages
  }));

  // make sure the subscriber is successfully joined
  await joined;

  // publish to the group to see if the subscriber can receive the message
  publisher.send(JSON.stringify({
    type: "sendToGroup",
    group: "group1",
    data: {
      "msg1": "Hello world"
    }
  }));
}

main();
```


### CSharp

#### Dependency
1. .NET 5

#### Simple WebSocket Client
Sample code [here](./samples/client-connect/simple-client-csharp/subscriber)

```csharp
using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading.Tasks;
namespace subscriber
{
    class Program
    {
        static async Task Main(string[] args)
        {
            using var webSocket = new ClientWebSocket();
            await webSocket.ConnectAsync("{Client_URL}", default);
            Console.WriteLine("Connected");
            var ms = new MemoryStream();
            Memory<byte> buffer = new byte[1024];
            // receive loop
            while (true)
            {
                var receiveResult = await webSocket.ReceiveAsync(buffer, default);
                // Need to check again for NetCoreApp2.2 because a close can happen between a 0-byte read and the actual read
                if (receiveResult.MessageType == WebSocketMessageType.Close)
                {
                    try
                    {
                        await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, default);
                    }
                    catch
                    {
                        // It is possible that the remote is already closed
                    }
                    break;
                }
                await ms.WriteAsync(buffer.Slice(0, receiveResult.Count));
                if (receiveResult.EndOfMessage)
                {
                    Console.WriteLine(Encoding.UTF8.GetString(ms.ToArray()));
                    ms.SetLength(0);
                }
            }
        }
    }
}
```


## Server SDK

### JavaScript
#### Get Client URL + REST API
* Package: https://github.com/vicancy/azure-websockets.git
* Source code: 

* Install
    ```cmd
    npm install --save https://github.com/vicancy/azure-websockets.git
    ```

* Get Client URL Usage

  Sample [here](./samples/server-publish/server-publish.js)
    ```js
    const { WebPubSubServiceClient } = require('@azure/webpubsub');
    let serviceClient = new WebPubSubServiceClient("{ConnectionString}", 'chat');
    let token = await serviceClient.getAuthenticationToken({ userId: id });
    console.log(token);
    ```
* REST API call

    Sample [here](./samples/server-publish/server-publish.js)
    ```js
    const { WebPubSubServiceClient } = require('@azure/webpubsub');
    let serviceClient = new WebPubSubServiceClient("{ConnectionString}", 'chat');
    await serviceClient.sendToAll("Hello", { dataType: 'text'});
    ```

### Express Middleware
* Package: https://www.myget.org/feed/azure-webpubsub-dev/package/npm/@azure/web-pubsub-express
* Source code: https://github.com/bterlson/azure-sdk-for-js-pr/tree/add-signalr/sdk/web-pubsub/web-pubsub-express

* Install
    ```cmd
    npm install https://www.myget.org/F/azure-webpubsub-dev/npm/@azure/web-pubsub-express/-/1.0.0-preview.1
    ```

* Dependency:
    ```cmd
    npm install express
    ```
* Usage:

    ```js
    import express from "express";

    const { WebPubSubEventHandler } = require("@azure/web-pubsub-express");
    const handler = new WebPubSubEventHandler("chat", ["*"] /* or your service endpoint */, {
    //path: "/customUrl", // optional
    handleConnect: async (req, res) => {
        // auth the connection and set the userId of the connection
        res.success({
        userId: "vic"
        });
    },
    handleUserEvent: async (req, res) => {
        res.success("Hey " + req.data, req.dataType);
        console.log(`Received user request data: ${userRequest.payload.data}`);
    },
    onDisconnected: async (disconnectRequest) => {
        console.log(disconnectRequest.context.userId + " disconnected");
    }
    });

    const app = express();

    app.use(handler.getMiddleware());

    app.listen(3000, () =>
    console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${handler.path}`)
    );
    ```

### CSharp
#### REST API Package
* Source code: https://github.com/Azure/azure-sdk-for-net-pr/pull/1400/files
* Package: https://www.myget.org/feed/azure-webpubsub-dev/package/nuget/Azure.Messaging.WebPubSub/1.0.0-alpha.20210402.1

* Dependency
```cmd
dotnet add package Azure.Messaging.WebPubSub --version 1.0.0-alpha.20210402.1 --source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json
```

Usage:
```cs
using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading.Tasks;
using Azure.Messaging.WebPubSub;
namespace publisher
{
    class Program
    {
        static async Task Main(string[] args)
        {
            var serviceClient = new WebPubSubServiceClient(new Uri(endpoint), hub, new Azure.AzureKeyCredential(key));
            await serviceClient.SendToAllAsync("hello");
        }
    }
}
```

### Python

#### Dependency
* Python 3.x

#### REST API Package
* Source Code: https://github.com/johanste/azure-sdk-for-python-pr/tree/webpubsub/sdk/signalr/azure-messaging-webpubsubservice/azure/messaging/webpubsubservice
* Package: https://www.myget.org/feed/azure-webpubsub-dev/package/pythonwhl/azure-messaging-webpubsubservice
* Dependency:
    * Python 3.x
* Install
    ```cmd
    pip install --index-url https://www.myget.org/F/azure-webpubsub-dev/python/ azure-messaging-webpubsubservice
    ```
* Usage
    ```python
    >>> from azure.messaging.webpubsubservice import WebPubSubServiceClient
    >>> from azure.core.credentials import AzureKeyCredential
    >>> client = WebPubSubServiceClient(endpoint='{Endpoint}', credential=AzureKeyCredential('{Key}'))
    >>> client
    <WebPubSubServiceClient> endpoint:'...'
    >>> from azure.messaging.webpubsubservice.rest import build_send_to_all_request
    >>> request = build_send_to_all_request('{hub}', json={ 'Hello':  'webpubsub!' })
    >>> response = client.send_request(request)
    >>> response
    <RequestsTransportResponse: 202 Accepted>
    ```
