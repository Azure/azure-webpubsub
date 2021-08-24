# Streaming logs using `json.webpubsub.azure.v1` subprotocol

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource

## Setup

```bash
npm install
```

## Start the server

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
node server "<connection-string>"
```

The server is then started. Open `http://localhost:8080` in browser. If you use F12 to view the Network you can see the WebSocket connection is established.

## Start the log streamer
Run:
```bash
node stream
```

Start typing messages and you can see these messages are transferred to the browser in real-time.
