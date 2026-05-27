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

// Option 1: Start with an existing WebPubSubClient
const wpsClient = new WebPubSubClient(url);
const client = await ChatClient.start(wpsClient);

// Option 2: Start directly with URL
// const client = await ChatClient.start(url);

console.log(`Started as: ${client.userId}`);

// Listen for events
client.onMessage((event) => {
  const msg = event.message;
  console.log(`${msg.createdBy}: ${msg.content.text}`);
});

client.onRoomJoined((event) => {
  console.log(`Joined room: ${event.room.title}`);
});

// Create a room and send messages
const room = await client.createRoom('My Room', ['bob']);
await client.sendToRoom(room.roomId, 'Hello!');

// Get message history (auto-paginating async iterator)
for await (const msg of client.listRoomMessages({ roomId: room.roomId })) {
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
// With existing WebPubSubClient
new ChatClient(wpsClient: WebPubSubClient)

// With client access URL
new ChatClient(clientAccessUrl: string, options?: WebPubSubClientOptions)

// With credential
new ChatClient(credential: WebPubSubClientCredential, options?: WebPubSubClientOptions)
```

To construct and start in one step, prefer the static `ChatClient.start(...)` factory below.

When constructed from an existing `WebPubSubClient`, `ChatClient` owns that client's lifecycle: `start()` starts it and `stop()` stops it.

#### Static Methods

| Method | Description |
|--------|-------------|
| `ChatClient.start(clientAccessUrl, options?)` | Create a client and start it in one step |
| `ChatClient.start(credential, options?)` | Create a client from a credential and start it |
| `ChatClient.start(wpsClient)` | Create a client from an existing `WebPubSubClient` and start it |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `userId` | `string` | Current user's ID (throws if not started) |
| `isStarted` | `boolean` | `true` once `start()` has completed and `stop()` has not been called since |
| `rooms` | `RoomInfo[]` | Snapshot of currently joined rooms (not live-updated) |
| `connection` | `WebPubSubClient` | Underlying WebPubSub connection owned by this chat client |

#### Methods

| Method | Description |
|--------|-------------|
| `start(options?)` | Connect and authenticate. Idempotent; concurrent calls share one in-flight promise. After `stop()` the client can be started again. Accepts `{ abortSignal }`. |
| `stop()` | Disconnect and reset client state. Returns `Promise<void>`. |
| `createRoom(title, members, roomId?, options?)` | Create a new room with initial members. The current user is automatically added to the members list. |
| `getRoom(roomId, withMembers, options?)` | Get room info |
| `addUserToRoom(roomId, userId, options?)` | Add user to room (admin operation) |
| `removeUserFromRoom(roomId, userId, options?)` | Remove user from room (admin operation) |
| `sendToRoom(roomId, message, options?)` | Send text message to room, returns message ID |
| `listRoomMessages(options)` | Paged async iterator over room message history (auto-paginates). Use `for await` to stream every message, or `.byPage({ maxPageSize })` to load up to `maxPageSize` messages at a time. `options = { roomId, startId?, endId?, pageSize?, abortSignal? }` |
| `getUserInfo(userId, options?)` | Get user profile |

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

Chat events are subscribed via a single generic `on(event, callback)` API
or typed convenience methods (`onMessage`, `onRoomJoined`, ...). All
listener registrations return a `Disposable` (`() => void`) that removes
the listener when called. Use `off(event, callback)` to unsubscribe a
specific callback.

```ts
const dispose = client.on('message', (event) => {
  console.log(event.message.content.text);
});
// later
dispose();
```

| Event name | Convenience method | Payload | Description |
|------------|-------------------|---------|-------------|
| `message` | `onMessage(cb)` | `MessageEvent` | New message received (or sent by this client). |
| `roomJoined` | `onRoomJoined(cb)` | `RoomJoinedEvent` | This client joined a room. |
| `roomLeft` | `onRoomLeft(cb)` | `RoomLeftEvent` | This client left a room. |
| `memberJoined` | `onMemberJoined(cb)` | `MemberJoinedEvent` | Another user joined a room this client is in. |
| `memberLeft` | `onMemberLeft(cb)` | `MemberLeftEvent` | Another user left a room this client is in. |

Connection-lifecycle events (`connected`, `disconnected`, `stopped`) live
on the underlying `WebPubSubClient`. Subscribe through `client.connection`:

```ts
client.connection.on('connected', (e) => console.log('connected', e));
client.connection.on('disconnected', (e) => console.log('disconnected', e));
client.connection.on('stopped', () => console.log('stopped'));
```

## Examples

See the [examples](./examples) directory for complete working examples.

## License

MIT
