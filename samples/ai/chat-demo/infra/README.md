# Infrastructure Deployment (Bicep)

This folder contains a `main.bicep` template to provision the Azure resources for the Chat Demo using Azure Web PubSub + App Service + optional blob persistence.

## Deploys
- App Service Plan (Linux)
- Linux Web App (Python 3.12)
- Azure Web PubSub service + hub (event handler pointing to web app)
- Storage account + blob container for room history persistence

## Prereqs
- Azure CLI (`az`) logged in: `az login`
- Correct subscription selected: `az account set --subscription <SUB_ID>`

## Parameters
| Name | Description | Default |
|------|-------------|---------|
| `baseName` | Base resource name prefix. | `chatdemo` |
| `location` | Azure location. | resource group location |
| `appServiceSku` | App Service Plan SKU. | `B1` |
| `webPubSubSku` | Web PubSub SKU. | `Free_F1` |
| `webPubSubCapacity` | Capacity units (1 for Free). | `1` |
| `hubName` | Hub name for Web PubSub. | `chat` |
| `storageSku` | Storage SKU. | `Standard_LRS` |
| `storageContainer` | Blob container for chat state. | `chatdemo` |
| `storageBlobName` | Blob name for chat state. | `state.json` |

## Deploy
Create a resource group if needed:
```powershell
az group create -n chatdemo-rg -l eastus
```
Deploy:
```powershell
az deployment group create -g chatdemo-rg -f ./infra/main.bicep -p baseName=chatdemo hubName=chat
```

Or use the helper script (builds client, deploys infra, zips and publishes code):
```powershell
python deploy_azure.py -g chatdemo-rg --base-name chatdemo --location eastus --create-group
```

Outputs will include:
- `webAppUrl`
- `negotiateEndpoint`
- `webPubSubHost`
- `hub`
- `storageAccountName`
- `storageContainerName`
- `storageBlobName`

## App Configuration
The template injects these App Settings:
- `AZURE=true` (enables Azure transport mode)
- `WEBPUBSUB_HUB=<hubName>`
- `WEBPUBSUB_CONNECTION_STRING` (internal use by server)
- `AZURE_STORAGE_CONNECTION_STRING` (for persistence)
- `CHAT_STORAGE_CONTAINER`
- `CHAT_STORAGE_BLOB`
- `ALLOWED_ORIGINS=*` (adjust for production)

Your Python server already exposes `/negotiate` for clients to obtain access URLs. For the Web PubSub event handler we used the pattern:
```
https://<webapp>.azurewebsites.net/api/{event}
```
If you do not yet implement these system event routes (`/api/connect`, `/api/connected`, `/api/disconnected`, etc.), you can:
1. Add minimal Flask routes matching those paths that return 200.
2. Or remove the event handler resource block and rely only on direct service client negotiation (already supported).

## Next Steps
1. Build and deploy the Python + React app code (Zip deploy or GitHub Actions) to the created Web App.
2. Application already uses `AZURE=true` so `/negotiate` returns Web PubSub URL; no frontend changes needed.
3. Tighten CORS (`ALLOWED_ORIGINS`) and rotate/regenerate keys as needed.

## Remove Resources
```powershell
az group delete -n chatdemo-rg --yes --no-wait
```

## Notes
- Free tier Web PubSub supports limited connections; upgrade for production.
- Consider enabling Managed Identity and using `DefaultAzureCredential` instead of connection string (adjust template accordingly).
