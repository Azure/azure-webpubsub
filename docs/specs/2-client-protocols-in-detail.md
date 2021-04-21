---
layout: docs
toc: true
title: Client Protocols in Detail
group: specs
---

## Table of Content
- [Service Endpoint](#endpoint)
- [Auth](#auth)
- [The simple WebSocket client](#simple_client)
- [The PubSub WebSocket client](#pubsub_client)
    - [Requests](#requests)
        - [Join Group Request](#join)
        - [Leave Group Request](#leave)
        - [Publish to Group Request](#publish)
        - [Send Events Request](#events)
    - [Responses](#responses)
        - [Ack Response](#ack)
        - [Message Response](#message)
        - [Service Response](#service)

## Service Endpoint
The service provides 2 types of endpoints for the clients to connect to:
1. `/client/hubs/{hub}`
2. `/client/?hub={hub}`

`{hub}` is a mandatory parameter that acts as isolation for different applications. It can be set either in the path or in the query.

## Auth
1. Client connects to the service with JWT token

### 1. The client connects using the JWT token

JWT token can be either in query string `/client/?hub={hub}&access_token={token}` or in `Authorization` header: `Authorization: Bearer {token}`.

A general workflow is:
1. Client negotiates with your application server. The application server has Auth middleware to handle the client request and sign a JWT token for the client to connect to the service.
2. The application server returns the JWT token and the service URL to the client
3. The client tries to connect to the Web PubSub service using the URL and JWT token returned from the application server

<a name="simple_client"></a>

## The simple WebSocket client
A simple WebSocket client, as the naming indicates, is a simple WebSocket connection. It can also have its custom subprotocol. 

For example, in JS, a simple WebSocket client can be created using:
```js
// simple WebSocket client1
var client1 = new WebSocket('wss://test.webpubsub.azure.com/client/hubs/hub1');

// simple WebSocket client2 with some custom subprotocol
var client2 = new WebSocket('wss://test.webpubsub.azure.com/client/hubs/hub1', 'custom.subprotocol')

```

## The PubSub WebSocket client

The PubSub WebSocket client connects with subprotocol `json.webpubsub.azure.v1`.

For example, in JS, a PubSub WebSocket client can be created using:
```js
// PubSub WebSocket client
var pubsub = new WebSocket('wss://test.webpubsub.azure.com/client/hubs/hub1', 'json.webpubsub.azure.v1');
```

When the client is using this subprotocol, both outgoing data frame and incoming data frame are expected to be JSON payloads.

Details of the subprotocol is described in [./../references/pubsub-websocket-subprotocol.md].