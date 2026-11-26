# Teams-Lite Server

Express server that provides the `/api/negotiate` endpoint for the Teams-Lite chat demo.

## Quick Start

```bash
yarn install
node index.js "<your-connection-string>"
```

Server runs on port 3000 (override with `PORT` env var).

## API

### GET /api/negotiate?userId=\<userId\>

Returns a client access URL for WebSocket connection.
