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

// Option 1: Login with an existing WebPubSubClient
const wpsClient = new WebPubSubClient(url);
const client = await ChatClient.login(wpsClient);

// Option 2: Login directly with URL
// const client = await new ChatClient(url).login();

console.log(`Logged in as: ${client.userId}`);

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

// Get message history
const history = await client.listRoomMessage(room.roomId, null, null);

// Manage room members
await client.addUserToRoom(room.roomId, 'charlie');
await client.removeUserFromRoom(room.roomId, 'charlie');

// Cleanup
client.stop();
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

#### Static Methods

| Method | Description |
|--------|-------------|
| `ChatClient.login(wpsClient)` | Create and login using an existing WebPubSubClient |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `userId` | `string` | Current user's ID (throws if not logged in) |
| `rooms` | `RoomInfo[]` | Snapshot of currently joined rooms (not live-updated) |
| `connection` | `WebPubSubClient` | Underlying WebPubSub connection |

#### Methods

| Method | Description |
|--------|-------------|
| `login()` | Connect and authenticate, returns `ChatClient` |
| `stop()` | Disconnect |
| `createRoom(title, members, roomId?)` | Create a new room with initial members. The current user is automatically added to the members list. |
| `getRoom(roomId, withMembers)` | Get room info |
| `addUserToRoom(roomId, userId)` | Add user to room (admin operation) |
| `removeUserFromRoom(roomId, userId)` | Remove user from room (admin operation) |
| `sendToRoom(roomId, message)` | Send text message to room, returns message ID |
| `listRoomMessage(roomId, startId, endId, maxCount?)` | Get room message history |
| `getUserInfo(userId)` | Get user profile |

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
