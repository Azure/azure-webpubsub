# AI Chat Demo

Multi‑room real‑time chat with optional AI answers. Start locally in a minute. Move to Azure when you're ready—no code changes.

> Want architecture diagrams, CloudEvents/tunnel details, RBAC & env matrix? See **[docs/ADVANCED.md](./docs/ADVANCED.md)**.

## What You Get
- Real‑time rooms (create / join instantly)
- AI bot responses (GitHub Models via your PAT)
- Persistence + scale when on Azure Web PubSub
- Same React UI + Python backend in all modes

## Quick Start

Create your PAT token with permission **Models** *Access: Read-only* by following instructions here: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

```bash
pip install -r requirements.txt
export GITHUB_TOKEN=<your_pat>   # (PowerShell: $env:GITHUB_TOKEN="<your_pat>")
python start_dev.py
```
Open http://localhost:5173

You now have:
- HTTP API on :5000
- Local WebSocket on :5001

## Using the App
1. Browse to http://localhost:5173
2. You're placed in room `public`
3. Create / join a room: type a name → Enter
4. Ask something; the AI bot replies (uses your GitHub token)
5. Open a second window to watch live streaming & room isolation

## Deploy to Azure
Install the Azure Developer CLI if you haven't: https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd

```bash
azd env new chatenv
azd up
```
That single `azd up` command:
1. Provisions Azure Web PubSub + Storage + App Service (with Managed Identity)
2. Builds the React client
3. Deploys the Python backend
4. Prints your site URL + negotiate endpoint

Next changes:
```bash
azd deploy   # code only (frontend or backend)
```
Infra template changes?
```bash
azd provision && azd deploy
```

### Tests

#### Backend (pytest)
Location: `python_server/tests`

Prereqs:
1. (Optional) Create & activate a virtualenv
2. `pip install -r python_server/requirements.txt`

Run all:
```
python -m pytest python_server/tests -q
```
Single file:
```
python -m pytest python_server/tests/test_runtime_config.py -q
```
Verbose:
```
python -m pytest -vv
```
Coverage snapshot:
* Runtime config validation & merging
* In‑memory room store behavior / limits
* Chat service builder (self vs webpubsub path & credential preconditions)
* Room lifecycle (add/remove)
* Streaming send path basic invariants

#### Frontend (Vitest + RTL)
Location: `client/src/__tests__`

Run:
```
npm --prefix client test
```
Included tests:
* Room switching: cached messages isolated & textarea present after switch
* Sender fallback: history messages without `from` show `AI Assistant`

Add more ideas:
* Mid‑stream room switch preserves previous room’s partial content when returning
* Simulated error banner rendering
* Theme / avatar contexts snapshot


## Core Environment Variables
| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Enables AI responses (GitHub Models) |
| `TRANSPORT_MODE` | `self` (default) or `webpubsub` to use Azure Web PubSub service |
| `STORAGE_MODE` | `memory` (default) or `table` for Azure Table / Azurite persistence |
| `WEBPUBSUB_ENDPOINT` or `WEBPUBSUB_CONNECTION_STRING` | The Azure Web PubSub endpoint when transport_mode is `webpubsub` |
| `AZURE_STORAGE_ACCOUNT` or `AZURE_STORAGE_CONNECTION_STRING`| The Azure Storage endpoint when storage_mode is `table` |
| `WEBPUBSUB_HUB` | (Optional) Override the hub name used for the chat app when using Web PubSub (default: demo_ai_chat) |
| `CHAT_TABLE_NAME` | (Optional) Override Azure Table name (default: chatmessages) |

Notes:
- In Azure deployment the Bicep sets `TRANSPORT_MODE=webpubsub` and `STORAGE_MODE=table`.
- Locally you can mix and match (e.g. `self+table` with Azurite or `webpubsub+memory`).

## Custom Resource Names (Optional)
Want predictable names? Provide overrides (must be globally unique where required):
```bash
azd provision --set webPubSubNameOverride=mywps1234 --set webAppNameOverride=mychatweb1234
```

## Iteration Cheatsheet
| Change | Command |
|--------|---------|
| Backend / frontend code | `azd deploy` |
| Infra (Bicep) changes | `azd provision && azd deploy` |
| New environment | `azd env new <name> --location <region>` then `azd up` |

## Hybrid Local + Azure (Short Version)
Run the backend locally while using a real Azure Web PubSub instance (and optionally Table storage):
1. `azd up` (once) to provision resources
2. In your local `.env` set:
  - `TRANSPORT_MODE=webpubsub`
  - `WEBPUBSUB_ENDPOINT=https://<name>.webpubsub.azure.com` (exported by azd env)
  - Optionally `STORAGE_MODE=table` plus storage creds (or rely on connection string output)
3. Run `python start_dev.py`
4. (Optional) Add a tunnel + update hub handler for full CloudEvents (see ADVANCED doc)

Details & tunnel steps: **[Hybrid section in ADVANCED.md](./docs/ADVANCED.md#2-local-development-paths)**.

## FAQ (Quick)
**Do I need Azure to try it?** No—local mode works offline.

**Why Web PubSub?** Managed scale, groups, CloudEvents, secure client negotiation.

**Where are advanced knobs?** All in `docs/ADVANCED.md` (RBAC, credential chain, persistence, CloudEvents, tunnels).

## Next Steps
- Explore advanced capabilities: [docs/ADVANCED.md](./docs/ADVANCED.md)
- Try hybrid tunnel mode for full lifecycle locally
- Customize AI logic in `python_server/chat_model_client.py`
- Review how scalable history works now (Table storage) in the persistence section of the advanced doc.

---
Happy hacking! Open an issue or PR in [our GitHub repo](https://github.com/Azure/azure-webpubsub) with feedback.

