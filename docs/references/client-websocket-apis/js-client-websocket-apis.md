---
layout: docs
title: WebSocket Clients
group: references
subgroup: client-websocket-apis
redirect_from:
  - "/references/client-websocket-apis/"
toc: true
---

## WebSocket Clients connecting to the service

Clients connect to the Web PubSub service (in below sections we refer it as the service) using [WebSocket](https://tools.ietf.org/html/rfc6455) protocol. So languages having WebSocket client support can be used to write a client for the service. In below sections we show several WebSocket client samples in different languages.

## Auth
The Web PubSub service uses [JWT token](https://tools.ietf.org/html/rfc7519.html) to validate and auth the clients. Clients can either put the token in the `access_token` query parameter, or put it in `Authorization` header when connecting to the service.

A typical workflow is the client communicates with its app server first to get the URL of the service and the token. And then the client opens the WebSocket connection to the service using the URL and token it receives.

The portal also provides a dynamically generated *Client URL* with token for clients to start a quick test:
![Get URL](./../../images/portal_client_url.png))
> NOTE
> Make sure to include neccessory roles when generating the token.

![Client Role](./../../images/portal_client_roles.png)

To simplify the sample workflow, in below sections, we use this temporarily generated URL from portal for the client to connect, using `<Client_URL_From_Portal>` to represent the value.

- [Inside HTML Page](#html)
- [Node.js](#js)

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
