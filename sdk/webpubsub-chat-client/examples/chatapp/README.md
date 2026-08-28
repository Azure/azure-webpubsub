# Azure Web PubSub Chat client demo

This browser demo uses `@azure/web-pubsub-chat-client` to create rooms, invite users, send messages, and load persistent history. The Express server only serves static files and issues client access URLs; no Web PubSub event handler is required.

## Prerequisites

- Node.js 20 or later
- An Azure Web PubSub resource with persistent storage and a Chat-enabled hub

## Run

```bash
npm install
```

Set the connection string and optional hub name, then start the app.

```bash
export WebPubSubConnectionString="<connection-string>"
export WebPubSubHub="chat"
npm start
```

`npm start` prepares the browser assets and starts the application. The build tooling is an implementation detail of the sample; application code imports the Chat client through the standard npm package name.

Open `http://localhost:3000` in two private browser windows, then follow this flow:

1. Connect as two different users.
1. In the second window, select **Copy user ID**.
1. In the first window, paste the second user's ID into **Invite user**, and create a room.
1. The invited room is selected automatically in the second window. Exchange messages and select **Load history** to read persisted messages.

Rooms are private. The room creator supplies initial members to `createRoom`; there isn't an API to browse or join arbitrary rooms.

The query-string user ID is intentionally convenient for a local demo. A production application must authenticate the request and derive the Chat user ID from the trusted server-side identity.

## Azure end-to-end test

With `WebPubSubConnectionString` and `WebPubSubHub` set, run:

```bash
npm run test:azure
```

The test connects two real Chat clients, creates a room with the second user as an initial member, exchanges messages in both directions, and reads both messages from persistent history.
