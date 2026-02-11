# Battleship

Multiplayer real-time naval combat. Each player gets a grid with randomly placed ships. Attack any opponent's grid — hits and misses appear instantly for all players. Last fleet standing wins.

## How it works

| Feature | Chat SDK API |
|---|---|
| Login | `new ChatClient(url)` + `login()` |
| Create game & invite players | `createRoom(title, playerList)` |
| Join game via invitation | `addListenerForNewRoom` |
| Deploy fleet / Fire at opponent | `sendToRoom(roomId, json)` |
| Real-time attack updates | `addListenerForNewMessage` |
| Restore game state on rejoin | `listRoomMessage` |
| See who joined | `addListenerForMemberJoined` |

## Prerequisites

1. An Azure Web PubSub resource
2. Node.js 18+

## Run

```bash
cd examples/battleship
yarn install
node server.js "<your-connection-string>"
```

Open **multiple browser tabs** at `http://localhost:3000`, login as different users, and start a game.

## How to Play

- Ships are placed **randomly** when you join a game
- **Free-for-all**: no turns — click any cell on an opponent's board to attack
- A player is **eliminated** when all their ship cells are hit
- Last player alive **wins**
