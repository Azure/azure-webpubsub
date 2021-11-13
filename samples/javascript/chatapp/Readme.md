# Create a Chat app

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource
3. [ngrok](https://ngrok.com/download) to expose our localhost to internet

## Setup

```bash
npm install
```

## Start the app

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
export WebPubSubConnectionString="<connection-string>"
node server
```

The web app is listening to event handler requests at `http://localhost:8080/eventhandler`.

## Use ngrok to expose localhost

```bash
ngrok http 8080
```

`nrgok` will print out an url (`https://<domain-name>.ngrok.io`) that can be accessed from internet, e.g. `http://xxx.ngrok.io`.

## Configure the event handler

Event handler can be set from portal or through Azure CLI, here contains the detailed [instructions](https://docs.microsoft.com/azure/azure-web-pubsub/howto-develop-eventhandler) for how to.

Go to the **Settings** tab to configure the event handler for this `chat` hub:

1. Click "Add" to add settings for hub `chat`.

2. Set URL Pattern to `https://<domain-name>.ngrok.io/eventhandler` and check `connected` in System Event Pattern, click "Save".

    ![Event Handler](./../../../docs/images/portal_event_handler.png)

## Start the chat

Open http://localhost:8080, input your user name, and send messages.

You can see in the ngrok command window that there are requests coming in with every message sent from the page.

## Client using `json.webpubsub.azure.v1` subprotocol
Besides the simple WebSocket client we show in [index.html](./public/index.html), [fancy.html](./public/fancy.html) shows a client using `json.webpubsub.azure.v1` achieving the same by sending `message` event to the service. With the help of the subprotocol, the client can get `connected` and `disconnected` messages containing some metadata of the connection.

You can open both http://localhost:8080/index.html and http://localhost:8080/fancy.html to see messages received by both clients.
