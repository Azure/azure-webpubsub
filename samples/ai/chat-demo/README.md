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
2. (Recommended) Create and activate a virtual environment:
   * macOS/Linux (bash/zsh):
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     python -m pip install --upgrade pip
     ```
   * Windows (PowerShell):
     ```pwsh
     python -m venv .venv
     .venv\Scripts\Activate.ps1
     python -m pip install --upgrade pip
     ```
   Deactivate anytime with:
   ```bash
   deactivate
   ```
3. Install backend + frontend deps (inside the venv):
   ```bash
   pip install -r requirements.txt
   # optional (tests, typing): pip install -r requirements-dev.txt
   ```
4. (Set token if you want AI answers)
   ```bash
   export GITHUB_TOKEN=<your_pat>        # bash/zsh
   # PowerShell
   $env:GITHUB_TOKEN="<your_pat>"
   ```
   Alternatively, you can update GITHUB_TOKEN in [./python_server/.env](./python_server/.env)
5. Start everything (serves React build automatically):
   ```bash
   python start_dev.py
   ```
6. Open http://localhost:5173

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

## Deploy to Azure
Install the Azure Developer CLI if you haven't: https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd

```bash
azd env new chatenv
azd env set githubModelsToken ghp_your_token_here   # store token for this env
azd up
```
```pwsh
azd env new chatenv
azd env set githubModelsToken ghp_your_token_here   # PowerShell
azd up
```

Security note: `azd env set` persists the value in the environment state on disk; avoid committing the `.azure` folder.

That single `azd up` command:
1. Provisions Azure Web PubSub + Storage + App Service (with Managed Identity)
2. Builds the React client
3. Deploys the Python backend
4. Applies app settings sourced from previously persisted environment values (e.g. `githubModelsToken` set via `azd env set`)
5. Prints your site URL + negotiate endpoint

### Enable AI Features (One-time Setup)
**Recommended Default:** Pass the token via secure Bicep parameter at provision time (Option A). This avoids surprise hooks and keeps behavior explicit. For production, prefer Key Vault (Option D).

**Option A (Secure Bicep Parameter – default)**
```bash
# First-time environment (bash/zsh)
export GITHUB_TOKEN=ghp_your_token_here
azd env set githubModelsToken $GITHUB_TOKEN
azd up

# First-time environment (PowerShell)
$env:GITHUB_TOKEN="ghp_your_token_here"
azd env set githubModelsToken $env:GITHUB_TOKEN
azd up
```
Notes:
- Updating only the token: `azd provision` (no need for `azd deploy`) since it changes an app setting.
- Rotate securely by switching to Key Vault (Option D) if frequency is high.
- Remove token: `azd env unset githubModelsToken` then `azd provision` (clears the app setting on the next provision).

**Option B (Manual CLI – update anytime)**
```bash
az webapp config appsettings set \
   --resource-group <your-resource-group> \
   --name <your-web-app-name> \
   --settings GITHUB_TOKEN="ghp_your_github_token_here"

az webapp restart \
   --resource-group <your-resource-group> \
   --name <your-web-app-name>
```

**Option C (Portal)** Azure Portal → App Service → Configuration → Application settings → New application setting: Name=`GITHUB_TOKEN`, Value=`your-token`

**Option D (Key Vault Reference – production / rotation)**
1. Store the PAT as a secret in a Key Vault you control.
2. Grant the web app’s managed identity `get` permissions.
3. Add an app setting: `GITHUB_TOKEN=@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/<secret-name>/<version>)`
4. Restart the web app.

### Next Changes
```bash
azd deploy   # code only (frontend or backend)
```
Infra template changes:
```bash
azd provision && azd deploy
```

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
azd env set webPubSubNameOverride mywps1234
azd env set webAppNameOverride mychatweb1234
azd provision
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

## Troubleshooting
**App Service setting `GITHUB_TOKEN` missing after `azd up`**
1. Make sure you set the value *before* the first `azd provision`: `azd env set githubModelsToken <token>`.
3. If you added the token *after* the first deployment, run `azd provision` (you don't need `azd deploy` for an app setting change). Use `azd provision --no-state` if it claims no changes.

**Changed token but app setting didn’t update**
- Confirm the parameter file or environment value is non-empty.
- Run `azd env get githubModelsToken` to verify what azd stored.
- Re-run `azd provision`. (Only a code change needs `azd deploy`.)

**Early `ECONNREFUSED` errors in the browser during local dev**
- The React dev server starts first and immediately proxies `/api/*` to Flask while it’s still binding.
- These transient errors vanish once `Flask app running` appears in the terminal. Safe to ignore.

**Web PubSub negotiate failing (401/403 or missing access)**
- Ensure the web app’s Managed Identity has necessary roles (e.g. Web PubSub Service Owner / Contributor) on the Web PubSub resource.
- If using the `createRoleAssignments` parameter and you turned it off after first provision, assign roles manually.

**`Unauthorized` error when calling openai**
- Check if the GitHub PAT has **model read** permission

**General diagnostic tips**
- Show current environment values: `azd env get`.
- List effective app settings (Azure): `az webapp config appsettings list --name <app-name> --resource-group <rg>`.

---
Happy hacking! Open an issue or PR in [our GitHub repo](https://github.com/Azure/azure-webpubsub) with feedback.

