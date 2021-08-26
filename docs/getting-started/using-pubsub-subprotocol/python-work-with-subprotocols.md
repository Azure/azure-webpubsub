---
redirect_to: https://docs.microsoft.com/azure/azure-web-pubsub/tutorial-subprotocol?tabs=python
layout: docs
group: getting-started
subgroup: using-pubsub-subprotocol
toc: true
---

# Walk-through: Client Pub/Sub using subprotocol

In [previous tutorials](../publish-messages/python-publish-message.md) you have learned how to use WebSocket APIs to send and receive data with Azure Web PubSub. You can see there is no protocol needed when client is communicating with the service. This is easy to use, but the functionality is also limited. You cannot, for example, specify the event name when sending the event to server, or publish message to other clients instead of sending it to server. In this tutorial you will learn how to use subprotocol to extend the functionality of client.

The complete code sample of this tutorial can be found [here][code].

## Using a subprotocol

To specify a subprotocol, you just need to use the [protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#parameters) parameter in the constructor:

```python
websockets.connect(url, subprotocols=[protocol])
```

Currently Azure Web PubSub only supports one subprotocol: `json.webpubsub.azure.v1`.

> If you use other protocol names, they will be ignored by the service and passthrough to server in the connect event handler, so you can build your own protocols.

Now let's create a simple web application using the subprotocol.

1.  Active virtual environment and install dependencies

    ```bash
    # Create venv
    python -m venv env

    # Active venv
    ./env/Scripts/activate

    pip install azure-messaging-webpubsubservice
    pip install websockets
    ```

2.  Create a `server.py` to host the `/negotiate` API and web page.

    ```python
    import json
    import sys
    from http.server import HTTPServer, SimpleHTTPRequestHandler
    from azure.messaging.webpubsubservice import (
        build_authentication_token
    )

    class Resquest(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/':
                self.path = 'public/index.html'
                return SimpleHTTPRequestHandler.do_GET(self)
            elif self.path == '/negotiate':
                token = build_authentication_token(sys.argv[1], 'stream', roles=['webpubsub.sendToGroup.stream', 'webpubsub.joinLeaveGroup.stream'])
                print(token)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'url': token['url']
                }).encode())

    if __name__ == '__main__':
        if len(sys.argv) != 2:
            print('Usage: python server.py <connection-string>')
            exit(1)

        server = HTTPServer(('localhost', 8080), Resquest)
        print('server started')
        server.serve_forever()
    ```

3.  Create an html page and save it as `public/index.html`.

    ```html
    <html>

        <body>
          <div id="output"></div>
          <script>
            (async function () {
              let res = await fetch('/negotiate')
              let data = await res.json();
              let ws = new WebSocket(data.url, 'json.webpubsub.azure.v1');
              ws.onopen = () => {
                console.log('connected');
              };

              let output = document.querySelector('#output');
              ws.onmessage = event => {
                let d = document.createElement('p');
                d.innerText = event.data;
                output.appendChild(d);
              };
            })();
          </script>
        </body>

    </html>
    ```

    It just connects to the service and print any message received to the page. The main change here is we specify the subprotocol when creating the WebSocket connection.

Now run `python server.py "<connection-string>"` and open `http://localhost:8080` in browser, you can see the WebSocket connection is established as before, with below `connected` event message received in client. You can see that you can get the `connectionId` generated for this client. You can also get the `userId` if when `getAuthenticationToken` you specify the `userId` for this client.

```json
{"type":"system","event":"connected","userId":null,"connectionId":"<the_connection_id>"}
```

Then you can send a message to the server using the publisher app created in the [publish and subscribe messages](../publish-messages/python-publish-message.md) tutorial:

```bash
python publish.py "<connection-string>" stream <message>
```

You can see the message is received in client and it's a bit different than before:

```json
{"type":"message","from":"server","dataType":"text","data":"<message>"}
```

Instead of a plain text, client now receives a json message that contains more information, like what's the message type and where it is from. So you can use this information to do additional processing to the message (for example, display the message in a different style if it's from a different source).

## Publish messages from client

With subprotocol, client will have more functionalities by sending a JSON message. For example, you can publish message directly from client to other clients.

This will be useful if you want to stream a large amount of data to other clients in real time. Let's use this feature to build a log streaming application, which can stream console logs to browser in real time.

1.  Create a `stream.py` with the following content.

    ```python
    import asyncio
    import sys
    import threading
    import time
    import websockets
    import requests
    import json


    async def connect(url):
        async with websockets.connect(url, subprotocols=['json.webpubsub.azure.v1']) as ws:
            print('connected')
            id = 1
            while True:
                data = input()
                payload = {
                    'type': 'sendToGroup',
                    'group': 'stream',
                    'dataType': 'text',
                    'data': str(data),
                    'ackId': id
                }
                id = id + 1
                await ws.send(json.dumps(payload))
                await ws.recv()

    res = requests.get('http://localhost:8081/negotiate').json()

    try:
        asyncio.get_event_loop().run_until_complete(connect(res['url']))
    except KeyboardInterrupt:
        pass

    ```

    The code above creates a WebSocket connection to the service and then whenever it receives some data it uses `ws.send()` to publish the data. In order to publish to others, you just need to set `type` to `sendToGroup` and specify a group name in the message.

    You can see there is a new concept "group" here. Group is logical concept in a hub where you can publish message to a group of connections. In a hub you can have multiple groups and one client can subscribe to multiple groups at the same time. When using subprotocol, you can only publish to a group instead of broadcasting to the whole hub.

2.  Since we use group here, we also need to update the web page `public\index.html` to join the group when the WebSocket connection is established inside `ws.onopen` callback.

    ```javascript
    ws.onopen = () => {
      console.log('connected');
      ws.send(JSON.stringify({
        type: 'joinGroup',
        group: 'stream'
      }));
    };
    ```

    You can see client joins the group by sending a message in `joinGroup` type.

3.  Let's also update the `ws.onmessage` callback logic a little bit to parse the JSON response and print out the messages only from `stream` group so that it acts as live stream printer.

    ```javascript
    ws.onmessage = event => {
      let message = JSON.parse(event.data);
      if (message.type === 'message' && message.group === 'stream') {
        let d = document.createElement('span');
        d.innerText = message.data;
        output.appendChild(d);
        window.scrollTo(0, document.body.scrollHeight);
      }
    };
    ```

4.  For security consideration, by default a client cannot publish or subscribe to a group by itself. We also need to update the token generation code to give client such `roles` when `build_authentication_token` in `server.py`:

    ```python
    token = build_authentication_token(sys.argv[1], 'stream', roles=['webpubsub.sendToGroup.stream', 'webpubsub.joinLeaveGroup.stream'])
    
    ```

5.  Finally also apply some style to the output so it displays nicely.

    ```html
    <html>

      <head>
        <style>
          #output {
            white-space: pre;
            font-family: monospace;
          }
        </style>
      </head>
    ```

Now you can run `python stream.py`, type any text and they will be displayed in the browser in real time.

Or you can also use this app pipe any output from another console app and stream it to the browser. For example:

```bash
ls -R | python stream.py
```

Or you make it slower so you can see the data is streamed to browser in real time:

```bash
for i in $(ls -R); do echo $i; sleep 0.1; done | python stream.py
```

The complete code sample of this tutorial can be found [here][code].

[code]: https://github.com/Azure/azure-webpubsub/tree/main/samples/python
