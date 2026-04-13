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
client.addListenerForNewMessage((notification) => {
  const msg = notification.message;
  console.log(`${msg.createdBy}: ${msg.content.text}`);
});

client.addListenerForNewRoom((room) => {
  console.log(`Joined room: ${room.title}`);
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

All `addListenerFor*` methods return a dispose function that removes the listener when called.

| Method | Callback Parameter | Description |
|--------|-------------------|-------------|
| `addListenerForNewMessage(callback)` | `NewMessageNotificationBody` | New message received |
| `addListenerForNewRoom(callback)` | `RoomInfo` | Joined a new room |
| `addListenerForMemberJoined(callback)` | `MemberJoinedNotificationBody` | Member joined a room |
| `addListenerForMemberLeft(callback)` | `MemberLeftNotificationBody` | Member left a room |
| `addListenerForRoomLeft(callback)` | `RoomLeftNotificationBody` | Self left a room |
| `onConnected(callback)` | `OnConnectedArgs` | Connection established |
| `onDisconnected(callback)` | `OnDisconnectedArgs` | Connection lost |
| `onStopped(callback)` | `OnStoppedArgs` | Connection stopped |

## Examples

See the [examples](./examples) directory for complete working examples.

## License

MIT
