# Serverless Azure Web PubSub Chat client demo

This Azure Functions JavaScript v4 demo hosts a browser app and issues client access URLs from the signed-in user's App Service authentication identity. The browser uses `@azure/web-pubsub-chat-client` directly for rooms, membership, messages, and persistent history. It doesn't use a Web PubSub trigger, output binding, or event handler.

## Prerequisites

- Node.js 20 or later
- Azure Functions Core Tools 4
- An Azure Web PubSub resource with persistent storage and a Chat-enabled hub

## Run locally

```bash
npm install
```

Run `npm start` to prepare the browser assets and start the HTTP functions locally. The script explicitly selects the JavaScript worker, so a checked-in `local.settings.json` isn't required. App Service authentication isn't emulated by the local Functions host. To enable the local-only user ID form, set `AllowLocalUserId=true`; never enable this setting in a deployed app.

Open `http://localhost:7071/api/index` in two different browsers or two independent browser profiles, then follow this flow:

1. Connect as two different local users.
1. Copy the second user's ID.
1. Paste the second user's ID into **Invite user**, and create a room as the first user.
1. Exchange messages and load the persisted history.

Rooms are private. The room creator supplies initial members to `createRoom`; there isn't an API to browse or join arbitrary rooms.

## Deploy

Publish the project and configure these app settings:

- `WebPubSubConnectionString`: the Web PubSub connection string
- `WebPubSubHub`: the Chat-enabled hub name, such as `chat`

```bash
npm run build
func azure functionapp publish <function-app-name>
```

The build prepares the browser assets, and Azure Functions Core Tools publishes the function app. Application code continues to import the Chat client through the standard npm package name.

In the Azure portal, add Microsoft as the Function App authentication identity provider. Allow unauthenticated access so `/api/index` and its assets can show the sign-in link. The `/api/negotiate` function still returns `401` unless App Service authentication supplies `x-ms-client-principal-name`.

## Azure end-to-end test

With `WebPubSubConnectionString` and `WebPubSubHub` set, run:

```bash
npm run test:azure
```

The test calls the same negotiate handler with simulated Easy Auth identities, connects two real Chat clients, creates a room with the second user as an initial member, exchanges messages in both directions, and reads both messages from persistent history.
