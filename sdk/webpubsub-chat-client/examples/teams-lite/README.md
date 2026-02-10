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

**Terminal 1 - Start the server:**

```bash
cd server
yarn install
```

Set your connection string via environment variable or `.env` file:

```bash
# Option 1: environment variable
export WebPubSubConnectionString="<your-connection-string>"

# Option 2: create a .env file in the server directory
echo 'WebPubSubConnectionString=<your-connection-string>' > .env
```

```bash
yarn start
```

**Terminal 2 - Start the client:**

```bash
cd client
yarn install
yarn dev
```

Open http://localhost:5173 in your browser.

## Deploy to Azure

See [deploy/README.md](./deploy/README.md) for instructions on deploying to Azure App Service.
