---
layout: docs
title: WebSocket Clients
group: references
subgroup: server-sdks
toc: true
---

# JavaScript SDK for the Web PubSub service

There are 2 libraries offered for JavaScript:
- [Service client library](#service-client-library) to
    -  messages to hubs and groups.
    - Send messages to particular users and connections.
    - Organize users and connections into groups.
    - Close connections
    - Grant/revoke/check permissions for an existing connection
- [Express middleware](#express) to handle incoming client events
  - Handle abuse validation requests
  - Handle client events requests

<a name="service-client-library"></a>

## Azure Web PubSub service client library for JavaScript
Use the library to:

- Send messages to hubs and groups.
- Send messages to particular users and connections.
- Organize users and connections into groups.
- Close connections
- Grant/revoke/check permissions for an existing connection

[Source code](https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/web-pubsub/web-pubsub) |
[Package (NPM)](https://www.npmjs.com/package/@azure/web-pubsub) |
[API reference documentation](https://docs.microsoft.com/javascript/api/@azure/web-pubsub/) |
[Product documentation](https://aka.ms/awps/doc) |
[Samples][samples_ref]

### Getting started

#### Currently supported environments

- [Node.js](https://nodejs.org/) version 8.x.x or higher

#### Prerequisites

- An [Azure subscription][azure_sub].
- An existing Azure Web PubSub service instance.

#### 1. Install the `@azure/web-pubsub` package

```bash
npm install @azure/web-pubsub
```

#### 2. Create and authenticate a WebPubSubServiceClient

```js
const { WebPubSubServiceClient } = require("@azure/web-pubsub");

const serviceClient = new WebPubSubServiceClient("<ConnectionString>", "<hubName>");
```

You can also authenticate the `WebPubSubServiceClient` using an endpoint and an `AzureKeyCredential`:

```js
const { WebPubSubServiceClient, AzureKeyCredential } = require("@azure/web-pubsub");

const key = new AzureKeyCredential("<Key>");
const serviceClient = new WebPubSubServiceClient("<Endpoint>", key, "<hubName>");
```

### Key concepts

#### Connection

Connections, represented by a connection id, represent an individual websocket connection to the Web PubSub service. Connection id is always unique.

#### Hub

Hub is a logical concept for a set of connections. Connections are always connected to a specific hub. Messages that are broadcast to the hub are dispatched to all connections to that hub. Hub can be used for different applications, different applications can share one Azure Web PubSub service by using different hub names.

#### Group

Group allow broadcast messages to a subset of connections to the hub. You can add and remove users and connections as needed. A client can join multiple groups, and a group can contain multiple clients.

#### User

Connections to Web PubSub can belong to one user. A user might have multiple connections, for example when a single user is connected across multiple devices or multiple browser tabs.

#### Message

Using this library, you can send messages to the client connections. A message can either be string text, JSON or binary payload.

### Examples

#### Broadcast a JSON message to all users

```js
const { WebPubSubServiceClient } = require("@azure/web-pubsub");

const serviceClient = new WebPubSubServiceClient("<ConnectionString>", "<hubName>");
await serviceClient.sendToAll({ message: "Hello world!" });
```

#### Broadcast a plain text message to all users

```js
const { WebPubSubServiceClient } = require("@azure/web-pubsub");

const serviceClient = new WebPubSubServiceClient("<ConnectionString>", "<hubName>");
await serviceClient.sendToAll("Hi there!", { contentType: "text/plain" });
```

#### Broadcast a binary message to all users

```js
const { WebPubSubServiceClient } = require("@azure/web-pubsub");

const serviceClient = new WebPubSubServiceClient("<ConnectionString>", "<hubName>");

const payload = new Uint8Array(10);
await serviceClient.sendToAll(payload.buffer);
```

### Troubleshooting

#### Enable logs

You can set the following environment variable to get the debug logs when using this library.

- Getting debug logs from the SignalR client library

```bash
export AZURE_LOG_LEVEL=verbose
```

For more detailed instructions on how to enable logs, you can look at the [@azure/logger package docs](https://github.com/Azure/azure-sdk-for-js/tree/master/sdk/core/logger).

<a name="express">

## Azure Web PubSub CloudEvents handlers for Express

Use the express library to:
- Add Web PubSub CloudEvents middleware to handle incoming client events
  - Handle abuse validation requests
  - Handle client events requests

[Source code](https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/web-pubsub/web-pubsub-express) |
[Package (NPM)](https://www.npmjs.com/package/@azure/web-pubsub-express) |
[API reference documentation](https://docs.microsoft.com/javascript/api/@azure/web-pubsub-express/) |
[Product documentation](https://aka.ms/awps/doc) |
[Samples][samples_ref]

### Getting started

#### Currently supported environments

- [Node.js](https://nodejs.org/) version 8.x.x or higher
- [Express](https://expressjs.com/) version 4.x.x or higher

#### Prerequisites

- An [Azure subscription][azure_sub].
- An existing Azure Web PubSub endpoint.

#### 1. Install the `@azure/web-pubsub-express` package

```bash
npm install @azure/web-pubsub-express
```

#### 2. Create a WebPubSubEventHandler

```js
const express = require("express");

const { WebPubSubEventHandler } = require("@azure/web-pubsub-express");
const handler = new WebPubSubEventHandler(
  "chat",
  ["https://<yourAllowedService>.webpubsub.azure.com"],
  {
    handleConnect: (req, res) => {
      // auth the connection and set the userId of the connection
      res.success({
        userId: "<userId>"
      });
    }
  }
);

const app = express();

app.use(handler.getMiddleware());

app.listen(3000, () =>
  console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${handler.path}`)
);
```

### Key concepts

#### Client Events

Events are created during the lifecycle of a client connection. For example, a simple WebSocket client connection creates a `connect` event when it tries to connect to the service, a `connected` event when it successfully connected to the service, a `message` event when it sends messages to the service and a `disconnected` event when it disconnects from the service.

#### Event Handler

Event handler contains the logic to handle the client events. Event handler needs to be registered and configured in the service through the portal or Azure CLI beforehand. The place to host the event handler logic is generally considered as the server-side.

### Troubleshooting

#### Dump request

Set `dumpRequest` to `true` to view the incoming requests.

#### Live Trace

Use **Live Trace** from the Web PubSub service portal to view the live traffic.

## Next steps

Please take a look at the
[samples][samples_ref]
directory for detailed examples on how to use this library.

## Related projects

- [Microsoft Azure SDK for Javascript](https://github.com/Azure/azure-sdk-for-js)

[azure_sub]: https://azure.microsoft.com/free/
[samples_ref]: https://github.com/Azure/azure-webpubsub/tree/main/samples/javascript