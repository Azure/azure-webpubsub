---
layout: docs
group: getting-started
subgroup: publish-messages
toc: true
---

# Quick start: publish and subscribe messages in Azure Web PubSub

In this tutorial you'll learn how to publish messages and subscribe them using Azure Web PubSub with Python SDK.

The complete code sample of this tutorial can be found [here][code].

## Prerequisites

1. [Python](https://www.python.org/)
2. Create an Azure Web PubSub resource

## Setup subscriber

In Azure Web PubSub you can connect to the service and subscribe to messages through WebSocket connections. WebSocket is a full-duplex communication channel so service can push messages to your client in real time. You can use any API/library that supports WebSocket to do so. Here is an example in python:

1.  First install required dependencies:

    ```bash
    # Create venv
    python -m venv env

    # Active venv
    ./env/Scripts/activate

    pip install azure-messaging-webpubsubservice
    pip install websockets

    ```

2.  Then use WebSocket API to connect to service

    ```python
    import asyncio
    import sys
    import websockets
    from azure.messaging.webpubsubservice import (
        build_authentication_token
    )

    async def connect(url):
    async with websockets.connect(url) as ws:
        print('connected')
        while True:
            print(await ws.recv())

    if len(sys.argv) != 3:
        print('Usage: python subscribe.py <connection-string> <hub-name>')
        exit(1)

    connection_string = sys.argv[1]
    hub_name = sys.argv[2]

    token = build_authentication_token(connection_string, hub_name)

    try:
        asyncio.get_event_loop().run_until_complete(connect(token['url']))
    except KeyboardInterrupt:
        pass

    ```

The code above creates a WebSocket connection to connect to a hub in Azure Web PubSub. Hub is a logical unit in Azure Web PubSub where you can publish messages to a group of clients.

Azure Web PubSub by default doesn't allow anonymous connection, so in the code sample we use `build_authentication_token()` in Web PubSub SDK to generate a url to the service that contains an access token and hub name.

After connection is established, you will receive messages through the WebSocket connection. So we use `ws.recv()` to listen to incoming messages.

Now save the code above as `subscribe.py` and run it using `python subscribe.py "<connection-string>" <hub-name>` (`<connection-string>` can be found in "Keys" tab in Azure portal, `<hub-name>` can be any alphabetical string you like), you'll see a `connected` message printed out, indicating that you have successfully connected to the service.

> Make sure your connection string is enclosed by quotes ("") in Linux as connection string contains semicolon.

## Setup publisher

Now let's use Azure Web PubSub SDK to publish a message to the service:

```python
import sys
from azure.messaging.webpubsubservice import (
    WebPubSubServiceClient
)
from azure.messaging.webpubsubservice.rest import *

if len(sys.argv) != 4:
    print('Usage: python publish.py <connection-string> <hub-name> <message>')
    exit(1)

connection_string = sys.argv[1]
hub_name = sys.argv[2]
message = sys.argv[3]

service_client = WebPubSubServiceClient.from_connection_string(connection_string)
res = service_client.send_request(build_send_to_all_request(hub_name, content=message, content_type='text/plain'))
print(res)

```

The `build_send_to_all_request()` build a message and use `send_request()` call to sends the message to all connected clients in a hub. Save the code above as `publish.py` and run `python publish.py "<connection-string>" <hub-name> <message>` with the same connection string and hub name you used in subscriber, you'll see the message printed out in the subscriber.

Since the message is sent to all clients, you can open multiple subscribers at the same time and all of them will receive the same message.

The complete code sample of this tutorial can be found [here][code].

[code]: https://github.com/Azure/azure-webpubsub/tree/main/samples/python/pubsub/
