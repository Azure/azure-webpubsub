# Teams-Lite Demo Deployment

All deployment configuration and scripts are in this folder.

## Configuration

Edit `config.json` to configure:

```json
{
  "subscriptionId": "your-subscription-id",
  "resourceGroup": "your-resource-group",
  "appName": "your-app-name",
  "location": "eastus2",
  "sku": "B1"
}
```

## Quick Start

```bash
# From the teams-lite directory
npm run deploy
```

Or run directly:

```powershell
# Full deployment (infra + build + deploy)
.\deploy\deploy.ps1

# Skip infrastructure (app already exists)
.\deploy\deploy.ps1 -SkipInfra

# Skip client build (already built)
.\deploy\deploy.ps1 -SkipBuild
```

## Files

| File | Description |
|------|-------------|
| `config.json` | Deployment configuration (subscription, resource group, app name, etc.) |
| `main.bicep` | Azure infrastructure definition (App Service Plan + Web App) |
| `deploy.ps1` | Deployment script |

## What Gets Deployed

1. **Infrastructure** (via Bicep):
   - App Service Plan (Linux, B1 SKU)
   - Web App (Node.js 22)

2. **Application**:
   - `server/` - Backend (with node_modules)
   - `client/` - Frontend build output (dist)
   - `sdk/` - Chat SDK

## Application URL

After deployment:
```
https://<appName>.azurewebsites.net
```
