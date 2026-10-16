# Teams-Lite Demo

A full-featured web chat application with a Teams-like UI, built with React + TypeScript + Vite, powered by Azure Web PubSub Chat SDK.

## Features

- Multi-room chat with sidebar for room switching
- Create / join / leave rooms
- Add / remove room members
- Real-time message notifications
- User profiles with avatars
- Message history
- Markdown support
- Online status indicators
- Typing indicators

## Prerequisites

- Node.js 18+
- An Azure Web PubSub resource with a Chat hub configured

## Quick Start

**1. Install dependencies:**

```bash
npm run install:all
```

**2. Start the server (Terminal 1):**

```bash
npm run dev:server "<your-connection-string>"
```

**3. Start the client (Terminal 2):**

```bash
npm run dev:client
```

Open http://localhost:5173 in your browser.
