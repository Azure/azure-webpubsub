# CodeAgentHub

Control code agents from your browser through Azure Web PubSub Chat.

## Architecture

```
Browser  ←→  Azure Web PubSub Chat  ←→  Agent Daemon  ←→  Local Agent
  (UI)          (rooms + history)       (bridge)         (ACP / SDK)
```

## Quick Start

### Prerequisites

- Node.js 18+
- Azure Web PubSub resource or local emulator
- At least one local agent available on the daemon machine

### Setup

```bash
cd examples/code-agent-hub
npm install
```

### Pack The Web Server

```bash
npm run pack:web-server
node dist/web-server/web-server.bundle.cjs
```

The packed output lives under `dist/` and includes:

- `web-server/web-server.bundle.cjs`
- `web-server/public/index.html`
- `web-server/public/chat-client.js`
- `web-server/public/marked.js`
- `web-server/public/dompurify.js`
- `codeagenthub-web-server.zip`

`codeagenthub-web-server.zip` expands to a relocatable folder that keeps the server entrypoint separate from `public/index.html` and its browser assets.

### Pack Everything

```bash
npm run pack:all
```

This clears `dist/` first, then rebuilds:

- `dist/daemon/agent-daemon.bundle.cjs`
- `dist/web-server/...`
- `dist/codeagenthub-web-server.zip`

### Run With Azure Web PubSub

```bash
# Terminal 1
export WEB_PUBSUB_CONNECTION_STRING="Endpoint=https://<your-resource>.webpubsub.azure.com;AccessKey=<replace-me>;Version=1.0;"
npm run portal

# Terminal 2
export WEB_PUBSUB_CONNECTION_STRING="Endpoint=https://<your-resource>.webpubsub.azure.com;AccessKey=<replace-me>;Version=1.0;"
npm run daemon
```

To force the portal back to the original username login even when GitHub OAuth is configured:

```bash
npm run portal:no-oauth
```

### Run With Local Emulator

```bash
# Terminal 1
export WEB_PUBSUB_CONNECTION_STRING="Endpoint=http://localhost;Port=8080;AccessKey=<emulator-access-key>;Version=1.0;"
npm run portal

# Terminal 2
export WEB_PUBSUB_CONNECTION_STRING="Endpoint=http://localhost;Port=8080;AccessKey=<emulator-access-key>;Version=1.0;"
npm run daemon
```

Open `http://localhost:3000` in your browser.

The portal and daemon both accept `WEB_PUBSUB_CONNECTION_STRING` and `WebPubSubConnectionString`.

Portal tokens are minted from `/negotiate:portal` and daemon bot tokens are minted from `/negotiate:daemon`.

### Run on Windows PowerShell

```powershell
# Terminal 1
$env:WEB_PUBSUB_CONNECTION_STRING="Endpoint=http://localhost;Port=8080;AccessKey=<emulator-access-key>;Version=1.0;"
npm run portal

# Terminal 2
$env:WEB_PUBSUB_CONNECTION_STRING="Endpoint=http://localhost;Port=8080;AccessKey=<emulator-access-key>;Version=1.0;"
npm run daemon
```

PowerShell example with OAuth disabled:

```powershell
$env:WEB_PUBSUB_CONNECTION_STRING="Endpoint=http://localhost;Port=8080;AccessKey=<emulator-access-key>;Version=1.0;"
npm run portal:no-oauth
```

### What You Can Do

- Create sessions with a selected daemon, agent, and working directory
- Send prompts and receive streaming responses
- Inspect tool calls, file edits, shell commands, and permission requests
- Switch models and modes when the selected agent exposes runtime controls
- Share one running session across multiple browsers or devices
- Rejoin a session and replay room history

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WEB_PUBSUB_CONNECTION_STRING` | Yes* | Primary Azure Web PubSub connection string variable |
| `WebPubSubConnectionString` | Yes* | Alternative connection string variable name accepted by the portal and daemon |
| `WEB_PUBSUB_HUB` | No | Hub name, default is `chat` |
| `PORT` | No | Portal HTTP port, default is `3000` |
| `DAEMON_USER_ID` | No | Override the daemon bot identity |

*Set either `WEB_PUBSUB_CONNECTION_STRING` or `WebPubSubConnectionString`.

## How It Works

1. The portal renders the UI and issues Chat negotiation tokens.
2. The daemon joins the lobby room and advertises available agents and workspaces.
3. Creating a session creates a dedicated session room.
4. Prompts, tool calls, permission requests, and responses all flow through that room.
5. Another browser can join the same room and replay the session history.

## License

MIT
