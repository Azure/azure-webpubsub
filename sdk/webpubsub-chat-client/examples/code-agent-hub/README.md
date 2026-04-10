# CodeAgentHub

Control code agents from any device through Azure Web PubSub Chat.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│              Azure Web PubSub Chat                   │
│ bootstrap lobby  daemon ACL rooms   session rooms    │
└────────┬─────────────────┬───────────────────────────┘
         │                 │
    ┌────┴────┐       ┌────┴─────────────────────────┐
    │  Web    │       │       Agent Daemon            │
    │  Portal │       │  Copilot · Claude · Codex     │
    │         │       │  Gemini · OpenCode · ...      │
    └─────────┘       └──────────────────────────────┘
```

- **Web Portal** — browser UI, GitHub OAuth, browser token negotiation, and daemon/session control-plane APIs
- **Agent Daemon** — runs next to code, registers and heartbeats with the portal, spawns agents via [ACP protocol](https://agentclientprotocol.com), bridges session events to Chat rooms
- **Azure Web PubSub Chat** — bootstrap lobby membership, daemon ACL rooms (`daemon-acl-{daemonId}`) for metadata/access requests/session sync, session rooms for prompts/history/tooling

Session traffic flows through WPS Chat rooms, membership, and message history instead of a local control-plane JSON file. The daemon only calls the portal directly for registration, heartbeat, offline reporting, and bot token issuance.

Daemon access is now split into Chat-native roles:

- **Member** (`room.member`) — can discover the daemon and inspect its session list
- **Admin** (`room.operator`) — can also browse directories, create sessions, and manage daemon sessions
- **Owner** — initial daemon manager recorded in daemon metadata; owner and daemon admins can approve daemon access from the portal

## Supported Agents

| Agent | Protocol | Mode |
|---|---|---|
| GitHub Copilot | ACP | CLI spawned via `@github/copilot` |
| Claude Code | ACP | CLI spawned via `@agentclientprotocol/claude-agent-acp` |
| Codex | ACP | CLI spawned via `@zed-industries/codex-acp` |

## Quick Start (Local Emulator)

### Prerequisites

- Node.js 22+
- [Azure Web PubSub Emulator](https://learn.microsoft.com/azure/azure-web-pubsub/howto-use-emulator) running on port 8080
- At least one agent CLI available (e.g. `@github/copilot`)

### Setup

```bash
cd examples/code-agent-hub
npm install
```

### Run

```bash
# Terminal 1 — Portal
export WEB_PUBSUB_CONNECTION_STRING="Endpoint=http://localhost;Port=8080;AccessKey=<emulator-key>;Version=1.0;"
npm run portal

# Terminal 2 — Daemon
export WEB_PUBSUB_CONNECTION_STRING="Endpoint=http://localhost;Port=8080;AccessKey=<emulator-key>;Version=1.0;"
npm run daemon
```

Open http://localhost:3000. Enter any username (OAuth is skipped without `.env`).

### With GitHub OAuth

Create a `.env` file:

```
GITHUB_OAUTH_CLIENT_ID=your-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-client-secret
```

The portal auto-detects `.env` and enables "Sign in with GitHub". To explicitly disable OAuth even when `.env` exists:

```bash
npm run portal:no-oauth
```

### PowerShell

```powershell
$env:WEB_PUBSUB_CONNECTION_STRING="Endpoint=http://localhost;Port=8080;AccessKey=<emulator-key>;Version=1.0;"
npm run portal    # Terminal 1
npm run daemon    # Terminal 2
```

## Building Deployable Packages

```bash
npm run pack:all
```

Produces:

| Output | Description |
|---|---|
| `dist/web-server/web-server.bundle.cjs` | Single-file portal server (includes express, session, OAuth) |
| `dist/web-server/public/` | Browser assets (index.html, chat-client.js, marked.js, dompurify.js) |
| `dist/codeagenthub-web-server.zip` | Zip archive of the above, ready for App Service deployment |
| `dist/daemon/agent-daemon.bundle.cjs` | Single-file daemon (ACP agent CLIs remain external) |

Individual pack commands:

```bash
npm run pack:web-server   # Portal only
npm run pack:daemon       # Daemon only
```

## Docker Daemon

Build and run a Docker daemon with pre-installed agent CLIs:

```bash
npm run pack:daemon
docker build -t codeagenthub-daemon -f Dockerfile.daemon ../../
docker run --network host \
  -e WebPubSubConnectionString="..." \
  -e DAEMON_USER_ID="docker-daemon" \
  -v ~/.claude:/root/.claude \
  codeagenthub-daemon
```

Or use the helper script:

```powershell
.\scripts\start-daemon-docker.ps1 -Build
```

## Azure Deployment

See [docs/azure-deployment.md](docs/azure-deployment.md) for the full step-by-step guide covering:

- App Service for the portal (with GitHub OAuth)
- Remote VM for the daemon
- SSH tunneling for Agent Maestro
- Environment variable reference

## What You Can Do

- Create sessions with a selected daemon, agent, and working directory
- Send prompts and receive streaming responses with reasoning
- Inspect tool calls, file edits, shell commands, and permission requests
- Approve or deny permissions (per-request or auto-approve mode)
- Share a session across multiple browsers / devices
- Rejoin a session and replay full room history
- Resume a session after daemon restart (agents that support `session/load`)

## Environment Variables

### Portal

| Variable | Required | Description |
|---|---|---|
| `WEB_PUBSUB_CONNECTION_STRING` | Yes | Azure Web PubSub connection string |
| `GITHUB_OAUTH_CLIENT_ID` | No | GitHub OAuth App client ID (enables OAuth) |
| `GITHUB_OAUTH_CLIENT_SECRET` | No | GitHub OAuth App client secret |
| `SESSION_SECRET` | No | Session cookie signing (random default) |
| `PORT` | No | HTTP port (default `3000`) |
| `WEB_PUBSUB_HUB` | No | Hub name (default `chat`) |

### Daemon

| Variable | Required | Description |
|---|---|---|
| `WEB_PUBSUB_CONNECTION_STRING` | Yes | Azure Web PubSub connection string |
| `PORTAL_URL` | No | Portal URL for daemon registration, heartbeat, offline reporting, and bot token issuance (default `http://localhost:3000`) |
| `DAEMON_USER_ID` | No | Unique daemon identity (default `copilot-bot`) |
| `DAEMON_OWNER_USER_ID` | Recommended | User who initially owns the daemon ACL room and approves daemon access |
| `SESSION_STORE_PATH` | No | Path for session persistence file |

`WEB_PUBSUB_CONNECTION_STRING` and `WebPubSubConnectionString` are both accepted.

## Project Structure

```
code-agent-hub/
├── agent-daemon.js          # Daemon — ACP bridge + Chat bot
├── web-server.js            # Portal — Express server + OAuth + daemon/session control plane
├── workspace-rpc.js         # Daemon workspace RPC helpers
├── public/
│   └── index.html           # Single-page browser UI
├── scripts/
│   ├── pack-all.mjs         # Build all packages
│   ├── pack-daemon.mjs      # Bundle daemon via esbuild
│   ├── pack-web-server.mjs  # Bundle portal + assets via esbuild
│   └── start-daemon-docker.ps1
├── Dockerfile.daemon        # Docker image with pre-installed agents
├── docs/
│   ├── azure-deployment.md  # Full Azure deployment guide
│   ├── architecture.md      # Internal architecture details
│   ├── slide.md             # Presentation deck
│   └── ...
└── test/
```

## How It Works

1. The browser gets a Chat token from `/negotiate:portal` and joins the bootstrap lobby; the daemon registers through `/api/daemons/register` and receives its bot token from the portal.
2. The portal persists daemon metadata in `daemon-acl-{daemonId}` room titles and uses the same rooms for member/admin ACL, daemon access request history, and session create/delete sync.
3. Daemon heartbeats keep hostname, platform, agents, and workspaces current; `/api/daemons` and `/api/sessions` read that Chat-backed state to render the portal.
4. Creating a session creates a dedicated Chat room; the portal grants room membership and daemon admins implicitly get write/manage rights for that daemon's sessions.
5. Prompts, streaming messages, tool calls, permissions, and status updates all flow through the session room.
6. Other browsers can replay history, request daemon or session access, and stay in sync through Chat room history plus portal polling.

## License

MIT
