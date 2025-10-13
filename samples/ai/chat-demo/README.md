# AI Chat Demo

Multi‑room real‑time chat with optional AI answers. Start locally in a minute. Move to Azure when you're ready—no code changes.

> Want architecture diagrams, CloudEvents/tunnel details, RBAC & env matrix? See **[docs/ADVANCED.md](./docs/ADVANCED.md)**.
> Release history: **[RELEASE_NOTES.md](./RELEASE_NOTES.md)**

## What You Get
- Real‑time rooms (create / join instantly)
- AI bot responses (GitHub Models via your PAT)
- Persistence + scale when on Azure Web PubSub
- Same React UI + Python backend in all modes

## Quick Start

Prereqs:
* Python 3.12+
* Node 18+

1. Create a PAT with **Models – Read**: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
2. Install backend + frontend deps:
  ```bash
  pip install -r requirements.txt
  # optional (tests, typing): pip install -r requirements-dev.txt
  ```
3. (Set token if you want AI answers)
  ```bash
  export GITHUB_TOKEN=<your_pat>        # bash/zsh
  # PowerShell
  $env:GITHUB_TOKEN="<your_pat>"
  ```
4. Start everything (serves React build automatically):
  ```bash
  python start_dev.py
  ```
5. Open http://localhost:5173

Running services:
* HTTP API :5000
* Local WebSocket :5001 (self transport)

## Using the App
1. Browse to http://localhost:5173
2. You're placed in room `public`
3. Create / join a room: type a name → Enter
4. Ask something; the AI bot replies (uses your GitHub token)
5. Open a second window to watch live streaming & room isolation

### Tests

Install dev extras first:
```bash
pip install -r requirements-dev.txt
```

Backend (pytest):
```bash
python -m pytest python_server/tests -q
```
Single file:
```bash
python -m pytest python_server/tests/test_runtime_config.py -q
```
Verbose / timing:
```bash
python -m pytest -vv
```

Frontend (Vitest + RTL):
```bash
npm --prefix client test
```
Selected coverage areas (backend): config merge, room store limits, transport factory, room lifecycle, streaming send path.
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
Run the backend locally while using a real Web PubSub instance (and optionally Table storage) in Azure:
1. `azd up` (once) provisions resources.
2. Create a local `.env` with:
   ```
   TRANSPORT_MODE=webpubsub
   WEBPUBSUB_ENDPOINT=https://<name>.webpubsub.azure.com
   # optional persistence
   STORAGE_MODE=table
   ```
3. `python start_dev.py`
4. (Optional) Tunnel for CloudEvents (see ADVANCED.md §2.3)

More: **[ADVANCED.md](./docs/ADVANCED.md#2-local-development-paths)**

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

