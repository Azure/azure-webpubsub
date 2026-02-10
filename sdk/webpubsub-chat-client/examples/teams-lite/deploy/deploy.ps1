# Azure Deployment Script for Teams-Lite Demo
# Uses Bicep for infrastructure and handles errors properly

param(
    [switch]$SkipInfra,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$deployScriptDir = $PSScriptRoot
$rootDir = Split-Path -Parent $deployScriptDir

# Load configuration
$configFile = Join-Path $deployScriptDir "config.json"
$config = Get-Content $configFile | ConvertFrom-Json

$SubscriptionId = $config.subscriptionId
$ResourceGroup = $config.resourceGroup
$Location = $config.location
$appName = $config.appName
$sku = $config.sku

Write-Host "=== Teams-Lite Deployment ===" -ForegroundColor Cyan
Write-Host "Subscription: $SubscriptionId" -ForegroundColor Gray
Write-Host "Resource Group: $ResourceGroup" -ForegroundColor Gray
Write-Host "App Name: $appName" -ForegroundColor Gray
Write-Host "Location: $Location" -ForegroundColor Gray

# Check Azure CLI (use 'az account show' which is faster than 'az --version')
Write-Host "`nChecking Azure CLI and login status..." -ForegroundColor Yellow
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    # Not logged in, try to login
    Write-Host "Not logged in. Running 'az login'..." -ForegroundColor Yellow
    az login
    if ($LASTEXITCODE -ne 0) { 
        Write-Host "Azure CLI login failed. Make sure Azure CLI is installed." -ForegroundColor Red
        exit 1 
    }
    $account = az account show | ConvertFrom-Json
}

# Set subscription
Write-Host "Setting subscription..." -ForegroundColor Yellow
az account set --subscription $SubscriptionId
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to set subscription: $SubscriptionId" -ForegroundColor Red
    exit 1
}

# Ensure resource group exists
Write-Host "`nEnsuring resource group exists..." -ForegroundColor Yellow
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "false") {
    Write-Host "Creating resource group: $ResourceGroup in $Location" -ForegroundColor Yellow
    az group create --name $ResourceGroup --location $Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create resource group" -ForegroundColor Red
        exit 1
    }
}

if (-not $SkipInfra) {
    # Deploy infrastructure with Bicep
    Write-Host "`n[1/3] Deploying infrastructure with Bicep..." -ForegroundColor Yellow
    
    $bicepFile = Join-Path $deployScriptDir "main.bicep"
    
    if (-not (Test-Path $bicepFile)) {
        Write-Host "Bicep file not found: $bicepFile" -ForegroundColor Red
        exit 1
    }
    
    $deploymentName = "teams-lite-$(Get-Date -Format 'yyyyMMddHHmmss')"
    
    Write-Host "Running Bicep deployment: $deploymentName" -ForegroundColor Gray
    Write-Host "This may take 2-3 minutes..." -ForegroundColor Gray
    
    az deployment group create `
        --resource-group $ResourceGroup `
        --name $deploymentName `
        --template-file $bicepFile `
        --parameters appName=$appName location=$Location sku=$sku
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nBicep deployment failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Infrastructure deployed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Infrastructure deployment skipped (-SkipInfra)" -ForegroundColor Gray
}

$appUrl = "https://$appName.azurewebsites.net"

if (-not $SkipBuild) {
    # Build client
    Write-Host "`n[2/3] Building client..." -ForegroundColor Yellow
    Push-Location (Join-Path $rootDir "client")
    try {
        yarn install
        if ($LASTEXITCODE -ne 0) { throw "yarn install failed" }
        
        yarn build
        if ($LASTEXITCODE -ne 0) { throw "yarn build failed" }
    } catch {
        Write-Host "Client build failed: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location

    # Build server with esbuild (bundles all dependencies including local SDK)
    Write-Host "`nBuilding server with esbuild..." -ForegroundColor Yellow
    Push-Location (Join-Path $rootDir "server")
    try {
        yarn install
        if ($LASTEXITCODE -ne 0) { throw "yarn install failed" }
        
        yarn build
        if ($LASTEXITCODE -ne 0) { throw "yarn build failed" }
    } catch {
        Write-Host "Server build failed: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    Write-Host "`n[2/3] Client and server build skipped (-SkipBuild)" -ForegroundColor Gray
}

# Prepare and deploy application
Write-Host "`n[3/3] Deploying application..." -ForegroundColor Yellow

$packageDir = Join-Path $rootDir ".package"
$zipPath = Join-Path $rootDir "app.zip"

# Clean up
if (Test-Path $packageDir) { Remove-Item -Recurse -Force $packageDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

# Create structure (esbuild bundled server + client static files)
New-Item -ItemType Directory -Path $packageDir | Out-Null
New-Item -ItemType Directory -Path "$packageDir\client" | Out-Null

# Copy esbuild bundled server (single file, no dependencies needed)
Write-Host "Copying bundled server..." -ForegroundColor Gray
Copy-Item "$rootDir\server\dist\server.mjs" "$packageDir\"

if (Test-Path "$rootDir\server\.env") {
    Copy-Item "$rootDir\server\.env" "$packageDir\"
}

# Copy client build output (static files)
Write-Host "Copying client build..." -ForegroundColor Gray
Copy-Item -Recurse "$rootDir\client\dist\*" "$packageDir\client\"

# Create root package.json (minimal, no npm install needed since server is bundled)
Write-Host "Creating deployment package.json..." -ForegroundColor Gray
@{
    name = "teams-lite-demo"
    version = "1.0.0"
    private = $true
    type = "module"
    scripts = @{
        start = "node server.mjs"
    }
    engines = @{
        node = ">=22.0.0"
    }
} | ConvertTo-Json -Depth 10 | Out-File "$packageDir\package.json" -Encoding utf8

# Patch server.mjs to add static file hosting
Write-Host "Patching server for static file hosting..." -ForegroundColor Gray
$serverContent = Get-Content "$packageDir\server.mjs" -Raw
$staticHostCode = @"
// --- Static file hosting (injected by deploy script) ---
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname2, join as __join } from 'path';
import __fs from 'fs';
const __filename2 = __fileURLToPath(import.meta.url);
const __clientPath = __join(__dirname2(__filename2), 'client');
if (__fs.existsSync(__clientPath)) {
  const __express = (await import('express')).default;
  const __origListen = app.listen;
  app.use(__express.static(__clientPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/eventhandler')) return next();
    res.sendFile(__join(__clientPath, 'index.html'));
  });
}
// --- End static file hosting ---

"@
# Insert before app.listen
$serverContent = $serverContent -replace '(app\.listen\()', "$staticHostCode`$1"
$serverContent | Out-File "$packageDir\server.mjs" -Encoding utf8

# Create zip
Write-Host "Creating deployment zip..." -ForegroundColor Gray
Push-Location $packageDir
try {
    Compress-Archive -Path * -DestinationPath $zipPath -Force
} finally {
    Pop-Location
}

# Deploy to Azure Web App
Write-Host "Uploading to Azure (this may take a minute)..." -ForegroundColor Gray
az webapp deploy `
    --name $appName `
    --resource-group $ResourceGroup `
    --src-path $zipPath `
    --type zip `
    --async false

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    Remove-Item -Recurse -Force $packageDir -ErrorAction SilentlyContinue
    Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
    exit 1
}

# Clean up
Remove-Item -Recurse -Force $packageDir
Remove-Item -Force $zipPath

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "App URL: $appUrl" -ForegroundColor Cyan
