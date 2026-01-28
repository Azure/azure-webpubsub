# Minimal Example

A minimal example demonstrating the basic usage of Web PubSub Chat SDK.

## Prerequisites

1. An Azure Web PubSub resource with a hub named `chat`
2. Configure the event handler URL to point to your server (e.g., `http://localhost:3000/eventhandler`)

## Quick Start

```bash
pnpm i
```

### 1. Start the server

```bash
npm run server -- "<your-webpubsub-connection-string>"
```

Or set the environment variable:

```bash
export WebPubSubConnectionString="<your-connection-string>"
npm run server
```

### 2. Run the client

In a new terminal:

```bash
npm run client
```

## What this example does

1. Creates two chat clients (Alice and Bob)
2. Alice creates a room and invites Bob
3. Alice sends messages to the room
4. Bob receives notifications for new room and messages
5. Lists message history from the room
