# Use Web PubSub to host WebSocket connections for GraphQL subscription

## Introduction
[GraphQL Subscription](https://graphql.org/blog/subscriptions-in-graphql-and-relay/) is a GraphQL supported long-lasting operation. When a GraphQL client defines a `subscription` operation, the client gets real-time update pushes from the server. The client maintains a persistent connection to the GraphQL server so that the server can push the subscription's result to the client. The most commonly used technology is via WebSocket. Azure Web PubSub helps to host and manage WebSocket connections for you and sounds perfect fit into this GraphQL Subscription scenario. In this article, we show how to enable Azure Web PubSub in the popular open-source GraphQL platform [Apollo](https://www.apollographql.com/) to host the WebSocket clients. We start from the [subscription demo](./demos/client-websockets/demo-without-awps.ts) which is a fork from the [subscription sample](https://github.com/apollographql/docs-examples/tree/50808f11c5cfeaf029422dee3a3b324a6e93783e/apollo-server/v3/subscriptions) provided by Apollo.

## Architecture

The default implementation for [apollo-subscription] uses [subscriptions-transport-ws] package. When the GraphQL server starts, it also starts a WebSocket server. When the GraphQL client starts a subscription operation, it starts a WebSocket connection to the server. The below diagram describes the code structure of `subscription-transport-ws`:

![The code structure of `subscription-transport-ws`](images/original-code-structure.png)

When using Azure Web PubSub, the clients starts the WebSocket connections with the Azure Web PubSub, and Azure Web PubSub turns the lifecycle of the client connection into events, and invoke the upstream GraphQL server through HTTP invokes. The below diagram describes the updated code structure when using Azure Web PubSub:

![The code structure when using Azure Web PubSub](images/updated-code-structure.png)

## Implementation

As the code structure shows, what we need to do is to replace the transport layer of the GraphQL subscription server. Instead of receiving and sending messages directly through the WebSocket server, we now override the logic to receive from the HTTP event handler listen and send messages through Azure Web PubSub SDK. [WebPubSubServerAdapter.ts](./src/WebPubSubServerAdapter.ts) contains the complete code for the replaced transport layer. 

Inside this [WebPubSubServerAdapter.ts](./src/WebPubSubServerAdapter.ts):

1. `ClientConnectionContext` class: A logical `ClientConnectionContext` that stands for a GraphQL client connection, every connection has a unique `connectionId`. It overrides method `send` and send messages back to its connection through Azure Web PubSub using `WebPubSubServiceClient`. 
1. `WebPubSubServerAdapter` class: It replaces original `WebSocket.Server` to communicate between the GraphQL server and the Azure Web PubSub service. It listens to the incoming Azure Web PubSub events using `WebPubSubEventHandler` provided by the Azure Web PubSub SDK and dispatches message to different `ClientConnectionContext` using the `connectionId` of each client.

## Using `WebPubSubServerAdapter`

Let's update the [subscription demo](./demos/client-websockets/demo-without-awps.ts) to use `WebPubSubServerAdapter`. The usage is pretty straight forward, simply create a `WebPubSubServerAdapter` object and use this `WebPubSubServerAdapter` when creating `SubscriptionServer`:

```typescript
const serverAdapter = new WebPubSubServerAdapter(
{
    connectionString: process.env.WebPubSubConnectionString,
    hub: "graphql_subscription",
    path: "/graphql_subscription",
},
app
);
server.applyMiddleware({ app });
SubscriptionServer.create({ schema, execute, subscribe }, serverAdapter);

```

Compare [subscription demo using Azure Web PubSub](./demos/client-websockets/demo-awps.ts) with the [original subscription demo](./demos/client-websockets/demo-without-awps.ts) to see the complete code changes.

## Run the demo locally and use Azure Web PubSub

### 1. Create a Azure Web PubSub service

Follow the [instruction](https://docs.microsoft.com/en-us/azure/azure-web-pubsub/quickstart-cli-create) to create an Azure Web PubSub service.

Get the ConnectionString of the service for later use:

```azurecli
az webpubsub key show --name "<your-unique-resource-name>" --resource-group "myResourceGroup" --query primaryConnectionString
```

Copy the fetched ConnectionString and it will be used later in this article as the value of `<connection_string>`.

### 2. Run the local demo

Run the below command with `<connection_string>` replaced by the value fetched in the above step:

Linux:

```bash
export WebPubSubConnectionString="<connection_string>"
npm install
npm run demo:client
```

Windows:

```cmd
SET WebPubSubConnectionString=<connection_string>
npm install
npm run demo:client
```

The console log shows that the exposed endpoint for Azure Web PubSub event handlers is `http://localhost:4000/graphql_subscription/`. Let's expose this local endpoint to public so that the Azure Web PubSub can redirect traffic to your localhost.

### Use localtunnel to expose localhost

[localtunnel](https://github.com/localtunnel/localtunnel) is an open-source project that help expose your localhost to public. [Install the tool](https://github.com/localtunnel/localtunnel#installation) and run:

```bash
lt --port 4000 --print-requests
```

localtunnel will print out an url (`https://<domain-name>.loca.lt`) that can be accessed from internet, e.g. `https://xxx.loca.lt`.

> Tip:
> There is one known issue that [localtunnel goes offline when the server restarts](https://github.com/localtunnel/localtunnel/issues/466) and [here is the workaround](https://github.com/localtunnel/localtunnel/issues/466#issuecomment-1030599216)  

There are also other tools to choose when debugging the webhook locally, for example, [ngrok](​https://ngrok.com/), [loophole](https://loophole.cloud/docs/), [TunnelRelay](https://github.com/OfficeDev/microsoft-teams-tunnelrelay) or so. Some tools might have issue returning response headers correctly. Try the following command to see if the tool is working properly:

```bash
curl https://<domain-name>.loca.lt/graphql_subscription/validate -X OPTIONS -H "WebHook-Request-Origin: *" -H "ce-awpsversion: 1.0" --ssl-no-revoke -i
```

Check if the response header contains `webhook-allowed-origin: *`. This curl command actually checks if the WebHook [abuse protection request](https://docs.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#webhook-validation) can response with the expected header.


### Configure event handlers

Since GraphQL has its own Authentication logic, `graphql_subscription` hub can allow anonymous connect and delegate all the event handling to the upstream. Setting the event handler through Azure CLI with below command (don't forget to replace `<your-unique-resource-name>` and `<your-localtunnel-id>` with your own one):

```azurecli
az webpubsub hub create --hub-name graphql_subscription --name "<your-unique-resource-name>" --resource-group "myResourceGroup" --allow-anonymous --event-handler url-template=http://<your-localtunnel-id>.loca.lt/{hub}/{event} user-event-pattern=* system-event=connect system-event=disconnected system-event=connected
```

### Open GraphQL Explorer and update the subscription URL

1. Open http://localhost:4000/graphql and click **Query your server**, click the top settings gear, and update the subscription URL to the Web PubSub endpoint `wss://<your-unique-resource-name>.webpubsub.azure.com/client/hubs/graphql_subscription`. 

![Set the subscription URL to use the Web PubSub endpoint.](images/graphql-explorer.png)

2. Update the operations to query the incremental number and run:

```graphql
subscription IncrementingNumber {
  numberIncremented
}
```

You can see that the subscription updates are consistently pushed to the GraphQL clients through the WebSocket connection.

![Run the subscription operation to use the Web PubSub endpoint.](images/graphql-explorer-run.png)


<!-- TODO: Add PubSub part
## Next step

In this article, we show how to use Azure Web PubSub to host and manage GraphQL Subscription WebSocket connections. Actually Web PubSub can also be used as a Pub/Sub backend engine to sync data between GraphQL servers. [Use Azure Web PubSub for GraphQL Pub/Sub]() describes how to.

 -->