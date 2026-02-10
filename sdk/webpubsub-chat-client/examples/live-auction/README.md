# Live Auction Example

A real-time auction app built with the **Web PubSub Chat SDK**. Bids appear instantly across all participants — every millisecond counts.

## How it works

| Action | SDK API used |
|---|---|
| User login | `new ChatClient(url)` → `login()` |
| Create an auction (invite bidders) | `createRoom(itemName, bidders)` |
| Broadcast starting price | `sendToRoom(roomId, configJson)` |
| Receive auction invitation | `addListenerForNewRoom` |
| Place a bid | `sendToRoom(roomId, bidJson)` — returns message ID as ACK |
| Real-time bid updates | `addListenerForNewMessage` |
| Load bid history | `listRoomMessage` |
| See who joined | `addListenerForMemberJoined` |

## Prerequisites

1. An Azure Web PubSub resource (**PPE portal**, region `CentralUSEUAP` or `EastUS2EUAP`)
2. Enable **Persistent Storage** (Table) and create a **Chat Hub** with chat feature enabled on the resource
3. Copy the connection string

## Quick Start

```bash
# Install dependencies
yarn install

# Start the server (pass your connection string)
export WebPubSubConnectionString="<your-connection-string>"
yarn start
```

Open `http://localhost:3000` in multiple browser tabs.

## Walkthrough

1. Open **two or more** browser tabs and log in with different usernames (e.g. `alice`, `bob`)
2. In Alice's tab, create an auction:
   - Item: `Vintage Watch`
   - Starting price: `100`
   - Bidders: `bob`
3. Bob's tab will instantly show the new auction in "Active Auctions"
4. Click the auction — the highest bid panel shows the starting price
5. Bob places a bid of `$150` → Alice sees it update **instantly** (green flash)
6. Alice outbids with `$200` → Bob sees it in real time
7. The bid history shows every bid with timestamps, newest first
