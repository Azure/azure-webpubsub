---
layout: docs
title: WebSocket Clients
group: references
toc: true
---

## WebSocket Clients connecting to the service

Clients connect to the Web PubSub service (in below sections we refer it as the service) using [WebSocket](https://tools.ietf.org/html/rfc6455) protocol. So languages having WebSocket client support can be used to write a client for the service. In below sections we show several WebSocket client samples in different languages.

## Auth
The Web PubSub service uses [JWT token](https://tools.ietf.org/html/rfc7519.html) to validate and auth the clients. Clients can either put the token in the `access_token` query parameter, or put it in `Authorization` header when connecting to the service.

A typical workflow is the client communicates with its app server first to get the URL of the service and the token. And then the client opens the WebSocket connection to the service using the URL and token it receives.

The portal also provides a dynamically generated *Client URL* with token for clients to start a quick test:
![Get URL](./../images/portal_client_url.png))
> NOTE
> Make sure to include neccessory roles when generating the token.

![Client Role](./../images/portal_client_roles.png)

To simplify the sample workflow, in below sections, we use this temporarily generated URL from portal for the client to connect, using `<Client_URL_From_Portal>` to represent the value.

## Connect using different languages:
- JavaScript
    - [Inside HTML Page](#html)
    - [Node.js](#js)
- [CSharp](#csharp)
- [Python](#python)
- [Java](#java)

<a name="html"></a>

### Inside HTML Page
In browser, `WebSocket` API is natively supported.
#### Simple WebSocket Client
Inside the `script` block of the html page:
```html
<script>
    let ws = new WebSocket("<Client_URL_From_Portal>");
    ws.onopen = () => {
        // Do things when the WebSocket connection is established
    };

    ws.onmessage = event => {
        // Do things when messages are received.
    };
</script>
```
#### PubSub WebSocket Client
Inside the `script` block of the html page:
```html
<script>
    let ws = new WebSocket("<Client_URL_From_Portal>", 'json.webpubsub.azure.v1');
    ws.onopen = () => {
        // Do things when the WebSocket connection is established
    };

    ws.onmessage = event => {
        // Do things when messages are received.
    };
</script>
```

<a name="js"></a>

### Node.js

#### Dependency

```node
npm install ws
```

#### Simple WebSocket Client
```js
const WebSocket = require('ws');
const client = new WebSocket("<Client_URL_From_Portal>");
client.on('open', () => {
     // Do things when the WebSocket connection is established
});
client.on('message', msg => {
     // Do things when messages are received.
});
```

#### PubSub WebSocket Client

```js
const WebSocket = require('ws');

const client = new WebSocket("<Client_URL_From_Portal>", "json.webpubsub.azure.v1");

client.on('open', () => {
     // Do things when the WebSocket connection is established
});
client.on('message', msg => {
     // Do things when messages are received.
});
```

### CSharp

#### Dependency
* [.NET Core 3.1 or above](https://dotnet.microsoft.com/download)

#### Simple WebSocket Client

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
            await webSocket.ConnectAsync("<Client_URL_From_Portal>", default);
            Console.WriteLine("Connected");
            var ms = new MemoryStream();
            Memory<byte> buffer = new byte[1024];
            // Start receiving the messages
            while (true)
            {
                var receiveResult = await webSocket.ReceiveAsync(buffer, default);
                // Need to check again because a close can happen between a 0-byte read and the actual read
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
                    // ms.ToArray() contains the full message
                    Console.WriteLine(Encoding.UTF8.GetString(ms.ToArray()));
                    ms.SetLength(0);
                }
            }
        }
    }
}
```


#### PubSub WebSocket Client

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
            webSocket.Options.AddSubProtocol("json.webpubsub.azure.v1");
            await webSocket.ConnectAsync("<Client_URL_From_Portal>", default);
            Console.WriteLine("Connected");
            var ms = new MemoryStream();
            Memory<byte> buffer = new byte[1024];
            // Start receiving the messages
            while (true)
            {
                var receiveResult = await webSocket.ReceiveAsync(buffer, default);
                // Need to check again because a close can happen between a 0-byte read and the actual read
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
                    // ms.ToArray() contains the full message
                    Console.WriteLine(Encoding.UTF8.GetString(ms.ToArray()));
                    ms.SetLength(0);
                }
            }
        }
    }
}
```


### Java

#### Dependency

#### Simple WebSocket Client

```java
package client;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;

/**
 * A simple WebSocket Client.
 *
 */
public final class SimpleClient {
    private SimpleClient() {
    }

    /**
     * Starts a simple WebSocket connection.
     * @param args The arguments of the program.
     */
    public static void main(String[] args) throws Exception {
        WebSocket ws = HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(URI.create("<Client_URL_From_Portal>"), new WebSocketClient()).join();
        System.in.read();
    }

    private static final class WebSocketClient implements WebSocket.Listener {
        private WebSocketClient() {
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            System.out.println("onOpen using subprotocol " + webSocket.getSubprotocol());
            WebSocket.Listener.super.onOpen(webSocket);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            System.out.println("onText received " + data);
            return WebSocket.Listener.super.onText(webSocket, data, last);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            System.out.println("Bad day! " + webSocket.toString());
            WebSocket.Listener.super.onError(webSocket, error);
        }
    }
}

```


#### PubSub WebSocket Client

```java
package client;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;

/**
 * A Subprotocol WebSocket Client.
 *
 */
public final class SubprotocolClient {
    private SubprotocolClient() {
    }

    /**
     * Starts a subprotocol WebSocket connection.
     * @param args The arguments of the program.
     */
    public static void main(String[] args) throws Exception {
        WebSocket ws = HttpClient.newHttpClient().newWebSocketBuilder().subprotocols("json.webpubsub.azure.v1")
                .buildAsync(URI.create("<Client_URL_From_Portal>"), new WebSocketClient()).join();

        ws.sendText("{\"type\":\"joinGroup\",\"ackId\":1,\"group\":\"group1\"}", true);
        System.in.read();
    }

    private static final class WebSocketClient implements WebSocket.Listener {
        private WebSocketClient() {
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            System.out.println("onOpen using subprotocol " + webSocket.getSubprotocol());
            WebSocket.Listener.super.onOpen(webSocket);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            System.out.println("onText received " + data);
            return WebSocket.Listener.super.onText(webSocket, data, last);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            System.out.println("Bad day! " + webSocket.toString());
            WebSocket.Listener.super.onError(webSocket, error);
        }
    }
}
```

### Python

#### Dependency
* [Python 3.6 or above](https://www.python.org/downloads/)
* `pip install websockets`

#### Simple WebSocket Client

```python
import asyncio
import websockets

async def hello():
    uri = '<Client_URL_From_Portal>'
    async with websockets.connect(uri) as ws:
        while True:
            await ws.send('hello')
            greeting = await ws.recv()
            print(greeting)

asyncio.get_event_loop().run_until_complete(hello())
```


#### PubSub WebSocket Client

```python
import asyncio
import websockets

async def join_group():
    uri = '<Client_URL_From_Portal>'
    async with websockets.connect(uri, subprotocols=['json.webpubsub.azure.v1']) as ws:
        await ws.send('{"type":"joinGroup","ackId":1,"group":"group1"}')
        return await ws.recv()

print(asyncio.get_event_loop().run_until_complete(join_group()))
```
