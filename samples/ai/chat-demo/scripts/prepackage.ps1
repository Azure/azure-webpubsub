$ErrorActionPreference = 'Stop'
Write-Host '[chat-demo] Prepackage (Windows) starting'
Write-Host "Working Directory: $(Get-Location)"
Write-Host "Script Root: $PSScriptRoot"

$clientDir = Join-Path $PSScriptRoot '..' 'client'
$distDir   = Join-Path $clientDir 'dist'
$staticDir = Join-Path $PSScriptRoot '..' 'python_server' 'static'

if (-not (Test-Path $clientDir)) { Write-Error "Client directory not found: $clientDir"; exit 65 }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Error 'npm not found in PATH. Install Node.js 18+.'; exit 64 }

Push-Location $clientDir
if (Test-Path node_modules) { Write-Host 'Reusing existing node_modules' } else { Write-Host 'Installing dependencies'; npm install }
Write-Host 'Running build (vite)'
npm run build
Pop-Location

if (-not (Test-Path $distDir)) { Write-Error "Build output missing: $distDir"; exit 66 }

if (Test-Path $staticDir) { Write-Host 'Removing existing static directory'; Remove-Item -Recurse -Force $staticDir }
Write-Host 'Creating static directory'; New-Item -ItemType Directory -Force -Path $staticDir | Out-Null
Write-Host 'Copying dist -> python_server/static'
Copy-Item -Recurse $distDir/* $staticDir
Write-Host "Static contents count: $((Get-ChildItem -Recurse $staticDir).Count)"
Write-Host '[chat-demo] Prepackage (Windows) completed successfully'
