# AI Chat Demo

Simple real-time chat with AI responses using a custom Flask/WebSocket backend, with the client supports Azure Web PubSub client data protocol, enabling easy future Azure migration.

## Prerequisites
- Node.js >=16
- Python >=3.8
- Generate a personal access token (PAT) in your GitHub settings
  Create your PAT token by following instructions here: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

## Quick Start
Before we start, please copy the PAT generated and save to env, or save to `GITHUB_TOKEN=` value in [python-server/.env](./python-server/.env).
```bash
export GITHUB_TOKEN=<your PAT>
```
```bash
# Install server dependencies and start both services
pip install -r requirements.txt
python start_dev.py
```
This will run:
- Web server on http://localhost:5000
- Client on http://localhost:5173

## Usage
- Open http://localhost:5173
- Default room: `public`
- To join another room, enter its ID in the sidebar

## Transport options
By default, the backend runs a self-hosted WebSocket server. You can instead use Azure Web PubSub service as the real-time transport while keeping the same app logic and UI.

- Self-host (default):
  - CHAT_TRANSPORT=selfhost (or unset)
  - WebSocket endpoint is ws://localhost:5001
- Azure Web PubSub service:
  - Set env var CHAT_TRANSPORT=webpubsub
  - Preferred: set WEBPUBSUB_ENDPOINT and optional WEBPUBSUB_HUB (default: chat) and authenticate with DefaultAzureCredential (Azure CLI login, Managed Identity, or env vars)
  - Fallback: set WEBPUBSUB_CONNECTION_STRING
  - The negotiate endpoint will return a signed client access URL, and the client connects directly to Azure.

Example PowerShell:

```powershell
# Using endpoint + DefaultAzureCredential (requires azure-identity)
$env:CHAT_TRANSPORT = "webpubsub"
$env:WEBPUBSUB_ENDPOINT = "https://<your-wps-name>.webpubsub.azure.com"
$env:WEBPUBSUB_HUB = "chat"
# Make sure you're logged in: az login (or use Managed Identity)
python start_dev.py

# Or, using a connection string
$env:CHAT_TRANSPORT = "webpubsub"
$env:WEBPUBSUB_CONNECTION_STRING = "<your-connection-string>"
$env:WEBPUBSUB_HUB = "chat"
python start_dev.py
```

## Project Structure
```
chat-demo/
├── client/         # Frontend
└── python-server/  # Web server backend
```
