# Infrastructure (Bicep) Overview

`main.bicep` provisions all required Azure resources for the chat demo in *App Service + Web PubSub (service) + Storage* architecture. It also wires Managed Identity RBAC and sets application settings consumed by the Python backend.

## Resources Created
| Resource | Purpose |
|----------|---------|
| App Service Plan (Linux) | Host the Python (Flask) web app |
| Linux Web App | Serves HTTP + negotiation endpoint, CloudEvents webhook |
| Azure Web PubSub Service | Real-time messaging hub (service mode) |
| Web PubSub Hub child resource | Explicit hub config for events and upstream |
| Storage Account | Chat history persistence (Azure Table) |
| System Assigned Managed Identity | Authenticates to Web PubSub + Storage |
| Role Assignments (conditional) | Web PubSub Service Owner; Storage Table Data Contributor |

## Prereqs
- Azure CLI (`az`) logged in: `az login`
- Correct subscription selected: `az account set --subscription <SUB_ID>`

## Key Parameters
| Name | Description | Default |
|------|-------------|---------|
| `baseName` | Base naming seed for resources | `chatdemo` |
| `location` | Deployment location | RG location |
| `webAppNameOverride` | Optional explicit Web App name (global uniqueness not required but must be available in region) | `` |
| `webPubSubNameOverride` | Optional explicit Web PubSub name (globally unique) | `` |
| `appServiceSku` | App Service plan SKU | `B1` |
| `webPubSubSku` | Web PubSub SKU | `Free_F1` |
| `webPubSubCapacity` | Capacity units | `1` |
| `hubName` | Hub name | `demo_ai_chat` |
| `storageSku` | Storage account SKU | `Standard_LRS` |
| `chatTableName` | Azure Table name for chat messages | `chatmessages` |
| `createRoleAssignments` | Whether to create RBAC role assignments (set false after first success if re-provisioning identity) | `true` |

## Naming & Collisions
Web PubSub names are globally unique. If an override is not supplied the template appends a short deterministic hash for uniqueness. Set overrides via environment values, then provision:

```powershell
azd env set webPubSubNameOverride mywps1234
azd env set webAppNameOverride mychatweb1234
azd provision
```

## Deploy (Standalone Bicep)
```powershell
az group create -n chatdemo-rg -l eastus
az deployment group create -g chatdemo-rg -f ./infra/main.bicep -p baseName=chatdemo
```

## Deploy (azd – recommended)
From repo root:
```powershell
azd env new mychat-env --location eastus
azd up
```
`azd up` performs: provision (Bicep) → build frontend → copy static assets → zip deploy Python backend.

Subsequent code changes:
```powershell
azd deploy
```

Infra-only changes:
```powershell
azd provision && azd deploy
```

## Outputs
| Output | Description |
|--------|-------------|
| `siteUrl` | Public base URL of the web app |
| `negotiateEndpoint` | Convenience link to negotiation endpoint |
| `webPubSubHost` | Hostname of Web PubSub service |
| `hub` | Hub configured (default chat) |
| `sitePrincipalId` | Managed Identity principal Id used for RBAC |
| `storageAccountName` | Storage account name |
| `chatTableNameOut` | Table name for chat messages |

## App Settings Injected
| Setting | Purpose |
|---------|---------|
| `TRANSPORT_MODE=webpubsub` | Selects Azure Web PubSub transport |
| `STORAGE_MODE=table` | Enables Azure Table persistence |
| `WEBPUBSUB_HUB` | Hub name used by server & client |
| `WEBPUBSUB_ENDPOINT` (or connection string) | Service endpoint (prefers endpoint + Managed Identity) |
| `AZURE_STORAGE_ACCOUNT` | Used with Managed Identity for table access |
| `CHAT_TABLE_NAME` | Azure Table used for room/message history |
| `USE_MANAGED_IDENTITY=true` | Prefer MI credential path |
| `SCM_DO_BUILD_DURING_DEPLOYMENT=1` / `ENABLE_ORYX_BUILD=true` | Force Oryx build on App Service (ensure deps installed) |
| `WEBSITES_ENABLE_APP_SERVICE_STORAGE=false` | Container optimization (if using custom container) |

The Web PubSub hub child resource sets `anonymousConnectPolicy=allow` so clients can connect without a pre-issued userId; user identity can still be embedded in tokens if desired.

## Role Assignments
Created when `createRoleAssignments=true`:
| Role | Scope |
|------|-------|
| Web PubSub Service Owner | Web PubSub resource |
| Storage Table Data Contributor | Storage account |

If you re-provision and encounter `RoleAssignmentUpdateNotPermitted`, disable creation:

```powershell
azd env set createRoleAssignments false
azd provision
```

Or remove the existing assignments manually first.

## Cleanup
```powershell
az group delete -n chatdemo-rg --yes --no-wait
```

## Notes & Best Practices
* Free tier Web PubSub has connection limits—scale SKU for load testing / prod.
* Prefer Managed Identity over connection strings for least privilege.
* Propagation for new role assignments can take a few minutes; negotiation 403 immediately after provision is usually transient.
* Keep `createRoleAssignments` disabled after first successful provision unless principal changed.
