# Create a Chat app with client SDK and react

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource

## Overview
The sample demonstrates building a chat app on a webpage with the Web PubSub client SDK and react.

The functionality of the following files:

* `/server.js` Host a server exposing endpoints for returning `Client Access URI` for clients.
* `/src/App.js` Contains a Web PubSub client receiving messages from a group and sending messages to the group with the react framework.

## Setup

```bash
npm install
```

## Start the app

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../../docs/images/portal_conn.png)

```bash
npm run start -- "<connection_string>"
```

## Start the chat

Open http://localhost:8080/, input your user name, and send messages. You can see messages are broadcasted between clients.
