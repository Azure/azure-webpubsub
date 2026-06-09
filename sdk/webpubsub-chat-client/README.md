# Azure Web PubSub Chat Client SDK

A client SDK for building chat applications with Azure Web PubSub.

> ⚠️ **Internal Preview**: This package is currently for internal use only and is not ready for production.

## Installation

```bash
npm install @azure/web-pubsub-chat-client
```

## Quick Start

For a complete example, see [examples/quickstart](./examples/quickstart).

```javascript
import { ChatClient } from '@azure/web-pubsub-chat-client';

// Get client access URL from your server
const url = await fetch('/negotiate?userId=alice').then(r => r.json()).then(d => d.url);

// Start directly with a client access URL...
const client = await ChatClient.start(url);

// ...or with a credential (a callback that returns a client access URL):
// const client = await ChatClient.start({ getClientAccessUrl: async () => url });

console.log(`Started as: ${client.userId}`);

// Listen for events
client.on('message', (event) => {
  const msg = event.message;
  console.log(`${msg.createdBy}: ${msg.content.text}`);
});

client.on('room-joined', (event) => {
  console.log(`Joined room: ${event.room.title}`);
});

// Create a room and send messages
const room = await client.createRoom('My Room', ['bob']);
await client.sendToRoom(room.roomId, 'Hello!');

// Get message history (auto-paginating async iterator)
for await (const msg of client.listRoomMessages(room.roomId)) {
  console.log(`${msg.createdBy}: ${msg.content.text}`);
}

// Manage room members
await client.addUserToRoom(room.roomId, 'charlie');
await client.removeUserFromRoom(room.roomId, 'charlie');

// Cleanup
await client.stop();
```

## API

### ChatClient

#### Constructor

```typescript
new ChatClient(credential: WebPubSubClientCredential)
```

`ChatClient` is constructed from a `WebPubSubClientCredential`. It builds and owns the underlying transport: `start()` connects and authenticates, `stop()` disconnects. The instance is constructed but not started — call `start()`, or use the static `ChatClient.start(...)` factory below (which also accepts a plain client-access URL) to construct-and-start in one step.

#### Static Methods

| Method | Description |
|--------|-------------|
| `ChatClient.start(clientAccessUrl, options?)` | Construct from a client-access URL and start (`options?: StartOptions`) |
| `ChatClient.start(credential, options?)` | Construct from a `WebPubSubClientCredential` and start (`options?: StartOptions`) |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `userId` | `string` | Current user's ID (throws if not started). Read-only — set internally on `start()`. |
| `rooms` | `RoomInfo[]` | Snapshot of currently joined rooms (not live-updated) |

#### Methods

| Method | Description |
|--------|-------------|
| `start(options?)` | Connect and authenticate. Idempotent; concurrent calls share one in-flight promise. After `stop()` the client can be started again. Accepts `{ abortSignal }`. |
| `stop()` | Disconnect and reset client state. Returns `Promise<void>`. |
| `createRoom(title, members, options?)` | Create a new room with initial members. The current user is automatically added to the members list. Options: `{ roomId?, abortSignal? }` — supply `roomId` to choose an explicit id, otherwise the service assigns one. |
| `getRoomDetail(roomId, options?)` | Get the detailed view of a room (`RoomDetail`). Options: `{ withMembers?, abortSignal? }` — pass `withMembers: true` to populate the `members` list (omitted otherwise). |
| `addUserToRoom(roomId, userId, options?)` | Add user to room (admin operation) |
| `removeUserFromRoom(roomId, userId, options?)` | Remove user from room (admin operation) |
| `sendToRoom(roomId, message, options?)` | Send text message to room, returns message ID |
| `listRoomMessages(roomId, options?)` | Paged async iterator over room message history (auto-paginates). Use `for await` to stream every message, or `.byPage({ maxPageSize })` to load up to `maxPageSize` messages at a time. `options = { startId?, endId?, maxPageSize?, abortSignal? }` |
| `getUserProfile(userId, options?)` | Get user profile |

Every asynchronous method accepts an optional final `options` argument
extending `OperationOptions` (`{ abortSignal?: AbortSignalLike }`) to
cancel in-flight invocations:

```ts
const ac = new AbortController();
setTimeout(() => ac.abort(), 5000);
await client.sendToRoom(roomId, "hi", { abortSignal: ac.signal });
```

#### Errors

Operations reject with a `ChatError` (extends `Error`) carrying a
service-defined `code`. Known codes are exposed as `KnownChatErrorCode`;
the service may return additional codes in newer versions, so always
handle the unknown-code case.

```ts
import { ChatError, KnownChatErrorCode } from "@azure/web-pubsub-chat-client";

try {
  await client.sendToRoom(roomId, "hi");
} catch (err) {
  if (err instanceof ChatError && err.code === KnownChatErrorCode.UnknownRoom) {
    // re-join or refresh local state
  } else {
    throw err;
  }
}
```

| Code | Meaning |
|------|---------|
| `KnownChatErrorCode.RoomAlreadyExists` | Tried to create a room whose `roomId` is already in use. |
| `KnownChatErrorCode.UserAlreadyInRoom` | Adding a user that is already a member. |
| `KnownChatErrorCode.NoPermissionInRoom` | Caller lacks permission to perform the operation. |
| `KnownChatErrorCode.NotStarted` | An API was called before `start()` resolved. |
| `KnownChatErrorCode.UnknownRoom` | The room is not in the client's local cache (joined or created). |
| `KnownChatErrorCode.InvalidServerResponse` | The service returned a malformed response. |

#### Event Listeners

Chat events use the same shape as the underlying `WebPubSubClient`:
one `on(event, listener)` overload per event, returning `void`, paired
with `off(event, listener)` for removal. Pass the same callback
reference to `off()` to unregister.

```ts
const onMsg = (event) => {
  console.log(event.message.content.text);
};
client.on('message', onMsg);
// later
client.off('message', onMsg);
```

| Event name | Listener argument | Description |
|------------|-------------------|-------------|
| `started` | `OnStartedArgs` | `start()` completed successfully — `userId` and `rooms` are populated. |
| `stopped` | `OnStoppedArgs` | The client transitioned to not-started (explicit `stop()` or transport-driven). |
| `message` | `OnMessageArgs` | New message received (or sent by this client). |
| `room-joined` | `OnRoomJoinedArgs` | This client joined a room. |
| `room-left` | `OnRoomLeftArgs` | This client left a room. |
| `member-joined` | `OnMemberJoinedArgs` | Another user joined a room this client is in. |
| `member-left` | `OnMemberLeftArgs` | Another user left a room this client is in. |

The underlying connection is managed internally and is not exposed. Use the
chat-level `started` / `stopped` events for lifecycle notifications;
lower-level connection events (`connected`, `disconnected`) are not
currently surfaced.

## Examples

See the [examples](./examples) directory for complete working examples.

## License

MIT
