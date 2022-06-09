---
id: SimpleChat
title: Simple Chat
description: A real-time chat room live demo utilizing Azure Web PubSub service
slug: /chat
hide_table_of_contents: true
---

# Create a Chat app

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource
3. [localtunnel](https://github.com/localtunnel/localtunnel) to expose our localhost to internet

## Setup

```bash
npm install
```

## Start the app

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

Linux:

```bash
export WebPubSubConnectionString="<connection_string>"
node server
```

Windows:

```cmd
SET WebPubSubConnectionString=<connection_string>
node server
```

The web app is listening to event handler requests at `http://localhost:8080/eventhandler`.

## Use localtunnel to expose localhost

[localtunnel](https://github.com/localtunnel/localtunnel) is an open-source project that help expose your localhost to public. [Install the tool](https://github.com/localtunnel/localtunnel#installation) and run:

```bash
lt --port 8080 --print-requests
```

localtunnel will print out an url (`https://<domain-name>.loca.lt`) that can be accessed from internet, e.g. `https://xxx.loca.lt`.

> Tip:
> There is one known issue that [localtunnel goes offline when the server restarts](https://github.com/localtunnel/localtunnel/issues/466) and [here is the workaround](https://github.com/localtunnel/localtunnel/issues/466#issuecomment-1030599216)

There are also other tools to choose when debugging the webhook locally, for example, [ngrok](​https://ngrok.com/), [loophole](https://loophole.cloud/docs/), [TunnelRelay](https://github.com/OfficeDev/microsoft-teams-tunnelrelay) or so. Some tools might have issue returning response headers correctly. Try the following command to see if the tool is working properly:

```bash
curl https://<domain-name>.loca.lt/eventhandler -X OPTIONS -H "WebHook-Request-Origin: *" -H "ce-awpsversion: 1.0" --ssl-no-revoke -i
```

Check if the response header contains `webhook-allowed-origin: *`. This curl command actually checks if the WebHook [abuse protection request](https://docs.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#webhook-validation) can response with the expected header.

## Configure the event handler

Event handler can be set from portal or through Azure CLI, here contains the detailed [instructions](https://docs.microsoft.com/azure/azure-web-pubsub/howto-develop-eventhandler) for how to.

Go to the **Settings** tab to configure the event handler for this `chat` hub:

1. Click "Add" to add settings for hub `sample_chat`.

2. Set URL Pattern to `https://<domain-name>.loca.lt/eventhandler` and check `connected` in System Event Pattern, click "Save".

    ![Event Handler](./../../../docs/images/portal_event_handler.png)

## Start the chat

Open http://localhost:8080/index.html, input your user name, and send messages.

You can see in the localtunnel command window that there are requests coming in with every message sent from the page.

## Client using `json.webpubsub.azure.v1` subprotocol

Besides the simple WebSocket client we show in [index.html](./public/index.html), [fancy.html](./public/fancy.html) shows a client using `json.webpubsub.azure.v1` achieving the same by sending `message` event to the service. With the help of the subprotocol, the client can get `connected` and `disconnected` messages containing some metadata of the connection.

You can open both http://localhost:8080/index.html and http://localhost:8080/fancy.html to see messages received by both clients.
