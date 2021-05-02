---
layout: docs
group: getting-started
subgroup: using-pubsub-subprotocol
toc: true
---

# Work with subprotocols

In previous tutorials you have learned how to use WebSocket APIs to send and receive data with Azure Web PubSub. You can see there is no protocol needed when client is communicating with the service. For example, you can use `WebSocket.send()` to send any data and server will receive the data as is. This is easy to use, but the functionality is also limited. You cannot, for example, specify the event name when sending the event to server, or publish message to other clients instead of sending it to server. In this tutorial you will learn how to use subprotocol to extend the functionality of client.

The complete code sample of this tutorial can be found [here][code].

## Using a subprotocol

To specify a subprotocol, you just need to use the [protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#parameters) parameter in the constructor:

```javascript
let ws = new WebSocket(url, protocol);
```

Currently Azure Web PubSub only supports one subprotocol: `json.webpubsub.azure.v1`.

> If you use other protocol names, they will be ignored by the service and passthrough to server in the connect event handler, so you can build your own protocols.

Now let's create a simple web application using the subprotocol.

1.  Install dependencies

    ```bash
    npm init -y
    npm install --save express
    npm install --save ws
    npm install --save node-fetch
    npm install --save @azure/web-pubsub
    ```

2.  Create a `server.js` to host the `/negotiate` API and web page.

    ```javascript
    const express = require('express');
    const { WebPubSubServiceClient } = require('@azure/web-pubsub');

    let endpoint = new WebPubSubServiceClient(process.argv[2], 'stream');
    const app = express();

    app.get('/negotiate', async (req, res) => {
      let token = await endpoint.getAuthenticationToken();
      res.send({
        url: token.url
      });
    });

    app.use(express.static('public'));
    app.listen(8080, () => console.log('server started'));
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
          ws.onmessage = (event) => {
            let message = JSON.parse(event.data)
            let text = ""
            if (message.type === "system") {
              text = `System message: ${message.event}`
            } else {
              text = message.data
            }
            let d = document.createElement("p")
            d.innerText = text
            output.appendChild(d)
        }
        })();
      </script>
    </body>

    </html>
    ```

    It just connects to the service and print any message received to the page. The main change here is we specify the subprotocol when creating the WebSocket connection.

Now run `node server "<conneciton-string>"` and open `http://localhost:8080` in browser, you can see the WebSocket connection is established as before.

Then you can send a message to the server using the publisher app in our first tutorial:

```bash
node publish "<connection-string>" stream <message>
```

You can see the message is received in client and it's a bit different than before:

```json
{"type":"message","from":"server","dataType":"text","data":"<message>"}
```

Instead of a plain text, client now receives a json message that contains more information, like what's the message type and where it is from. So you can use this information to do additional processing to the message (for example, display the message in a different style if it's from a different source).

## Publish messages from client

In last tutorial, when client sends a message through WebSocket connection, it will trigger a user event at server side. With subprotocol, client will have more functionalities by sending a JSON message. For example, you can publish message directly from client to other clients.

This will be useful if you want to stream a large amount of data to other clients in real time. Let's use this feature to build a log streaming application, which can stream console logs to browser in real time.

1.  Create a `stream.js` with the following content.

    ```javascript
    const WebSocket = require('ws');
    const fetch = require('node-fetch');

    async function main() {
      let res = await fetch(`http://localhost:8080/negotiate`);
      let data = await res.json();
      let ws = new WebSocket(data.url, 'json.webpubsub.azure.v1');
      ws.on('open', () => {
        process.stdin.on('data', data => {
          ws.send(JSON.stringify({
            type: 'sendToGroup',
            group: 'stream',
            dataType: 'text',
            data: data.toString()
          }));
          process.stdout.write(data);
        });
      });
      process.stdin.on('close', () => ws.close());
    }

    main();
    ```

    The code above creates a WebSocket connection to the service and then whenever it receives some data it uses `ws.send()` to publish the data. In order to publish to others, you just need to set `type` to `sendToGroup` and specify a group name in the message.

    You can see there is a new concept "group" here. Group is logical concept in a hub where you can publish message to a group of connections. In a hub you can have multiple groups and one client can subscribe to multiple groups at the same time. When using subprotocol, you can only publish to a group instead of broadcasting to the whole hub.

2.  Since we use group here, we also need to update the web page to join the group.

    ```javascript
    ws.onopen = () => {
      console.log('connected');
      ws.send(JSON.stringify({
        type: 'joinGroup',
        group: 'stream'
      }));
    };

    let output = document.querySelector('#output');
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

    You can see client joins the group by sending a message in `joinGroup` type.

    You can also see we changed the code when message is received to parse the message and get the data from json format.

3.  For security consideration, by default a client cannot publish or subscribe to a group by itself. We also need to update the token generation code to grant client such permissions:

    ```javascript
    app.get('/negotiate', async (req, res) => {
      let token = await endpoint.getAuthenticationToken({
        roles: ['webpubsub.sendToGroup.stream', 'webpubsub.joinLeaveGroup.stream']
      });
      ...
    });
    
    ```

4.  Finally also apply some style to the output so it displays nicely.

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

Now you can run `node stream`, type any text and they will be displayed in the browser in real time.

Or you can also use this app pipe any output from another console app and stream it to the browser. For example:

```bash
ls -R | node stream
```

Or you make it slower so you can see the data is streamed to browser in real time:

```bash
for i in $(ls -R); do echo $i; sleep 0.1; done | node stream
```

The complete code sample of this tutorial can be found [here][code].

[code]: https://github.com/Azure/azure-webpubsub/tree/main/samples/javascript/logstream/
