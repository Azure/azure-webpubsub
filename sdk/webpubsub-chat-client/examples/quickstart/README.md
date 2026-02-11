# Minimal Example

A minimal example demonstrating the basic usage of Web PubSub Chat SDK.

## Prerequisites

1. An Azure Web PubSub resource with:
   - A Persistent Storage configured (Storage Account with Table enabled)
   - A Chat hub created (with Chat feature enabled, using the Persistent Storage above)

## Quick Start

```bash
yarn install
```

### 1. Start the server

```bash
node server.js "<your-webpubsub-connection-string>"
```

Or set the environment variable:

```bash
export WebPubSubConnectionString="<your-connection-string>"
node server.js
```

### 2. Run the client

In a new terminal:

```bash
node client.js
```

## What this example does

1. Creates two chat clients (Alice and Bob)
2. Alice creates a room and invites Bob
3. Alice sends messages to the room
4. Bob receives notifications for new room and messages
5. Lists message history from the room
