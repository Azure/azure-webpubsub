# Create a Chat app with reliable subprotocol

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource

## Overview

When using reliable subprotocol, the client can handle intermittent network issue. It's important for a chat app when the connection drops by network issue, you can recover the connection with all group info and unreceived message. The sample demonstrate how to use reliable json subprotocol to build a chat app.

## Setup

```bash
npm install
```

## Start the app

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
node server <connection-string>
```

The web app is listening to request at `http://localhost:8080`.


## Start the chat

Open http://localhost:8080, input your user name, and send messages.

## Recover from network issue

You can try to disable and enable LTE network or switch from LTE to Wifi to simulate network issue. The client can recover from network issue and resume all unreceived messages.