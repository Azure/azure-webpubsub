---
layout: docs
title: WebSocket Clients
group: references
subgroup: server-sdks
redirect-from:
  - "/references/server-sdks/"
toc: true
---

## Using Server SDKs

### Get Client URL + REST API
* [Source Code](https://github.com/Azure/azure-sdk-for-js/tree/master/sdk/web-pubsub/web-pubsub)
* [Package](https://www.myget.org/feed/azure-webpubsub-dev/package/npm/@azure/web-pubsub/1.0.0-beta.1)

#### Install
```bash
npm install --save https://www.myget.org/F/azure-webpubsub-dev/npm/@azure/web-pubsub/-/1.0.0-beta.1
```

#### Get Client URL Usage

```js
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
let serviceClient = new WebPubSubServiceClient("{ConnectionString}", 'chat');
let token = await serviceClient.getAuthenticationToken({ userId: id });
console.log(token);
```
#### REST API call

```js
const { WebPubSubServiceClient } = require('@azure/webpubsub');
let serviceClient = new WebPubSubServiceClient("{ConnectionString}", 'chat');
await serviceClient.sendToAll("Hello", { contentType: 'text/plain'});
// or send the object as JSON
await serviceClient.sendToAll({"hello": "world"});

```

### Express Middleware
* [Source Code](https://github.com/Azure/azure-sdk-for-js/tree/master/sdk/web-pubsub/web-pubsub-express)
* [Package](https://www.myget.org/feed/azure-webpubsub-dev/package/npm/@azure/web-pubsub-express/1.0.0-beta.1)

#### Install
```bash
npm install https://www.myget.org/F/azure-webpubsub-dev/npm/@azure/web-pubsub-express/-/1.0.0-beta.1
```

#### Dependency:
```bash
npm install express
```
#### Usage:

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
