# webpubsub-apollo-experimental

## Introduction
[Microsoft Azure Web PubSub](https://docs.microsoft.com/en-us/azure/azure-web-pubsub/overview) is a real-time messaging cloud service.

In GraphQL, `subscriptions` are long-lasting GraphQL read operations that can update their result whenever a particular server-side event occurs. And it is usually implemented with WebSocket protocol. 

This package helps developers use Microsoft Azure WebPub service to avoid server-side maintenance of WebSocket connections between users clients and GraphQL server caused by `subscriptions` query from clients.

<!-- TO ADD
Secondly, this package provides a replacement for `PubSub` using Azure Web PubSub service. [PubSub](https://www.apollographql.com/docs/apollo-server/data/subscriptions/#the-pubsub-class) is an in-memory event-publishing system provided by [Apollo server](https://www.apollographql.com/docs/apollo-server/data/subscriptions/).

You can also install this package via npm:

```cmd
npm install webpubsub-apollo-subscription
```
 -->

* [Use Web PubSub to host WebSocket connections for GraphQL subscription](./how-to-host-websockets.md)