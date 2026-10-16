# Live Auction Example

A real-time auction app built with the **Web PubSub Chat SDK**. Bids appear instantly across all participants — every millisecond counts.

## How it works

| Action | SDK API used |
|---|---|
| User login | `ChatClient.start(url)` |
| Create an auction (invite bidders) | `createRoom(itemName, bidders)` |
| Broadcast starting price | `sendToRoom(roomId, configJson)` |
| Receive auction invitation | `onRoomJoined` |
| Place a bid | `sendToRoom(roomId, bidJson)` — returns message ID as ACK |
| Real-time bid updates | `onMessage` |
| Load bid history | `listRoomMessages` |
| See who joined | `onMemberJoined` |
| Show participants | `getRoomDetail(roomId, { withMembers: true })` |

## Prerequisites

1. An Azure Web PubSub resource
2. Enable **Persistent Storage** (Table) and create a **Chat Hub** with chat feature enabled on the resource
3. Copy the connection string

## Quick Start

```bash
# Install dependencies
yarn install

# Start the server
node server.js "<your-connection-string>"
```

Or set the environment variable:
```bash
export WebPubSubConnectionString="<your-connection-string>"
node server.js
```

Open `http://localhost:3000` in multiple browser tabs.

## Walkthrough

1. Open **two or more** browser tabs and log in with different usernames (e.g. `alice`, `bob`)
2. In Alice's tab, pick any item from the list and create an auction, invite `bob`
3. Bob's tab will instantly show the new auction in "Active Auctions"
4. Click the auction to enter, then click any bid increment button to place a bid
5. Both tabs see bid updates in real time
6. The bid history shows every bid with timestamps, newest first
