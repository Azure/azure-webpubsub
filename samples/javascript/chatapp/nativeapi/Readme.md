---
id: SimpleChat
title: Simple Chat
description: A real-time chat room live demo using Azure Web PubSub service
slug: /chat
hide_table_of_contents: true
live_demo_link: https://awps-demos-client-chat.azurewebsites.net/fancy.html
preview_image_name: SimpleChat
---

# Create a Chat app

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource
3. Use GitHub Codespaces

## Overview
The sample demonstrates building and run a chat app with Web PubSub service.

## Setup and run the app

In this sample, we use [awps-tunnel](../../../../tools/awps-tunnel/server/README.md) tool to route traffic to localhost.
1. Configure the event handler
    
    Event handler can be set from portal or through Azure CLI, here contains the detailed [instructions](https://docs.microsoft.com/azure/azure-web-pubsub/howto-develop-eventhandler) for how to.

    In the Web PubSub service portal, go to the **Settings** tab to configure the event handler for this `sample_chat` hub:

        * Hub: `sample_chat`
        * Configure Event Handlers -> Add
            * URL Template:  `tunnel:///eventhandler`
            * System event: `connected`
            * Others keep unchanged
        * **Confirm** and **Save**

    ![Event Handler](../../../images/portal_event_handler_chat.png)

1. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and set the value to the environment
    
    ```bash
    export WebPubSubConnectionString="<your-web-pubsub-service-connection-string>"
    ```

    ![Connection String](./../../../../docs/images/portal_conn.png)

1. Navigate to current folder
    ```bash
    cd samples/javascript/chatapp/nativeapi
    ```

1. Run the project on port 8080
    ```bash
    npm install
    node server
    ```

1. Install and run `awps-tunnel` tool
    Start another terminal and run:
    ```bash
    npm install -g @azure/web-pubsub-tunnel-tool
    export WebPubSubConnectionString="<your-web-pubsub-service-connection-string>"
    awps-tunnel run --hub sample_chat --upstream http://localhost:8080
    ```

1. Open the application in multiple browser tabs with your copied local address and start your chat.

    Besides the simple WebSocket client we show in [index.html](./public/index.html), [fancy.html](./public/fancy.html) shows a client using `json.webpubsub.azure.v1` achieving the same by sending `message` event to the service. With the help of the subprotocol, the client can get `connected` and `disconnected` messages containing some metadata of the connection.

    You can open both http://localhost:8080/index.html and http://localhost:8080/fancy.html to see messages received by both clients.
