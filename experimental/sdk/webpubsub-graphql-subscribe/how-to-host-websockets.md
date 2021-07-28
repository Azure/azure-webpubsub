# Use Web PubSub to host WebSocket connections for GraphQL subscription

## Introduction
[GraphQL Subscription](https://graphql.org/blog/subscriptions-in-graphql-and-relay/) is a GraphQL supported long-lasting operation. When a GraphQL client defines a `subscription` operation, the client gets real-time update pushes from the server. The client maintains a persistent connection to the GraphQL server so that the server can push the subscription's result to the client. The most commonly used technology is via WebSocket. Azure Web PubSub helps to host and manage WebSocket connections for you and sounds perfect fit into this GraphQL Subscription scenario. In this article, we show how to enable Azure Web PubSub in the popular open-source GraphQL platform [Apollo](https://www.apollographql.com/) to host the WebSocket clients. We start from the [subscription example](https://github.com/apollographql/docs-examples/tree/50808f11c5cfeaf029422dee3a3b324a6e93783e/apollo-server/v3/subscriptions) provided by Apollo.

## Architecture

The default implementation for [apollo-subscription] uses [subscriptions-transport-ws] package. When the GraphQL server starts, it also starts a WebSocket server. When the GraphQL client starts a subscription operation, it starts a WebSocket connection to the server. The below diagram describes the code structure of `subscription-transport-ws`:

![The code structure of `subscription-transport-ws`](images/original-code-structure.png)

When using Azure Web PubSub, the clients starts the WebSocket connections with the Azure Web PubSub, and Azure Web PubSub turns the lifecycle of the client connection into events, and invoke the upstream GraphQL server through HTTP invokes. The below diagram describes the updated code structure when using Azure Web PubSub:

![The code structure when using Azure Web PubSub](images/updated-code-structure.png)

## Implementation

As the code structure shows, what we need to do is to replace the transport layer of the GraphQL subscription server. Instead of receiving and sending messages directly through the WebSocket server, we now override the logic to receive from the HTTP event handler listen and send messages through Azure Web PubSub SDK. We achieve this by adding a virtual WebSocket server [WebPubSubServerAdapter](./src/WebPubSubServerAdapter.ts). Inside this virtual server, it listens to the incoming Azure Web PubSub events and dispatches the events into logical client connections. We also override the `send` method for the client connection to call the `sendToConnection` method provided by the Azure Web PubSub SDK.

## Authentication

GraphQL Subscription has its own Authentication mechanism, so we [allow anonymous] WebSocket connect to the Azure Web PubSub service and configure `connect` event handler to delegate the auth process to the upstream GraphQL server.


### Set event handler

## Next step

In this article, we show how to use Azure Web PubSub to host and manage GraphQL Subscription WebSocket connections. Actually Web PubSub can also be used as a Pub/Sub backend engine to sync data between GraphQL servers. [Use Azure Web PubSub for GraphQL Pub/Sub]() describes how to.