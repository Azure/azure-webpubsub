# Teams-Lite Node.js Server

A minimal Node.js server for teams-lite that provides the negotiate API for WebSocket connections.

## Features

- **Negotiate API**: Returns client connection URLs for WebSocket connections
- **Dual Mode Support**:
  - **Azure Web PubSub mode**: When `WEBPUBSUB_CONNECTION_STRING` is provided
  - **Self-host mode**: Returns a local WebSocket URL when no connection string is set

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:

```env
PORT=8080
WEBPUBSUB_CONNECTION_STRING=your_connection_string_here
WEBPUBSUB_HUB_NAME=chat
```

## Running

Development mode (with auto-reload):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## API Endpoints

### GET /api/negotiate/users/:userId

Returns a client connection URL for the specified user.

**Response:**

```json
{
  "url": "wss://your-webpubsub-url..."
}
```

### GET /health

Health check endpoint.

**Response:**

```json
{
  "status": "ok"
}
```

### GET /api/readyz

Readiness check endpoint.

**Response:**

```json
{
  "status": "ready"
}
```
