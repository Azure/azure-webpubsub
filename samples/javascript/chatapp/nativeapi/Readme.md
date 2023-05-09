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

In some of the other samples, we show how to run the app locally and expose the local app through some local tunnel tools like ngrok or localtunnel.

In this sample, we open this project from [GitHub codespaces](https://github.com/features/codespaces) and run it from inside.

1. In this GitHub repo, click **Code** and choose `Codespaces` tab to open the project in codespace. If there is no codespace yet, click *Create codespace on main* to create one for you. Codespace starts in seconds with up to 60 hours a month free.

2. Inside Codespace, switch to the Terminal tab
    1. Navigate to current folder
        ```bash
        cd samples/javascript/chatapp/nativeapi
        ```
    2. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and set the value to the environment
        
        ```bash
        export WebPubSubConnectionString="<your-web-pubsub-service-connection-string>"
        ```
        ![Connection String](./../../../../docs/images/portal_conn.png)

    3. Run the project on port 8080
    ```bash
    npm install
    node server
    ```
3. Expose port 8080 to public

    In Codespaces **PORTS** tab (next to the **TERMINAL** tab), right click to change *Port Visibility* to **Public** so that Azure Web PubSub can connect to it. Right click and select *Copy Local Address*, this address will be used in next step for Azure Web PubSub to push events to.

4. Configure the event handler
    
    Event handler can be set from portal or through Azure CLI, here contains the detailed [instructions](https://docs.microsoft.com/azure/azure-web-pubsub/howto-develop-eventhandler) for how to.

    In the Web PubSub service portal, go to the **Settings** tab to configure the event handler for this `sample_chat` hub:

        * Hub: `sample_chat`
        * Configure Event Handlers -> Add
            * URL Template:  `<copied_local_address>/eventhandler` (Don't forget to add path `/eventhandler`)
            * System event: `connected`
            * Others keep unchanged
        * **Confirm** and **Save**

    ![Event Handler](../../../images/portal_event_handler_chat.png)

5. Switch back to your codespace and open the application in multiple browser tabs with your copied local address and start your chat.

    Besides the simple WebSocket client we show in [index.html](./public/index.html), [fancy.html](./public/fancy.html) shows a client using `json.webpubsub.azure.v1` achieving the same by sending `message` event to the service. With the help of the subprotocol, the client can get `connected` and `disconnected` messages containing some metadata of the connection.

    You can open both http://localhost:8080/index.html and http://localhost:8080/fancy.html to see messages received by both clients.
