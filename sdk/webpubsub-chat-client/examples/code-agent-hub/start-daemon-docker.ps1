# start-daemon-docker.ps1 — Start CodeAgentHub daemon in Docker
#
# Maps local Claude/Codex/Copilot configs into the container.
# Optionally maps a local project directory to /workspace/external.
#
# Usage:
#   .\start-daemon-docker.ps1
#   .\start-daemon-docker.ps1 -LocalDir "G:\my-project"
#   .\start-daemon-docker.ps1 -Build

param(
    [string]$LocalDir = "",
    [switch]$Build,
    [string]$ConnectionString = ('Endpoint=http://localhost;Port=8080;AccessKey=' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + '0123456789ABCDEFGH' + ';Version=1.0;'),
    [string]$Image = "codeagenthub-daemon",
    [string]$Name = "codeagenthub-daemon"
)

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
# $root = sdk/webpubsub-chat-client

# Build if requested or image doesn't exist
if ($Build -or !(docker images -q $Image 2>$null)) {
    Write-Host "[BUILD] Building $Image..." -ForegroundColor Cyan
    Push-Location $root
    docker build -t $Image -f examples/copilot-mobile/Dockerfile.daemon .
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }
}

# Stop existing container
docker rm -f $Name 2>$null | Out-Null

# Build volume mounts
$volumes = @()

function Get-FirstExistingPath {
    param([string[]]$Candidates)

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    return $null
}

# Claude config (~/.claude/settings.json → /root/.claude/)
$claudeDir = Join-Path $HOME ".claude"
if (Test-Path $claudeDir) {
    $volumes += "-v", "${claudeDir}:/root/.claude"
    Write-Host "[CONFIG] Claude: $claudeDir" -ForegroundColor Green
}

# Codex config (~/.codex/config.toml → /root/.codex/)
$codexDir = Join-Path $HOME ".codex"
if (Test-Path $codexDir) {
    $volumes += "-v", "${codexDir}:/root/.codex"
    Write-Host "[CONFIG] Codex: $codexDir" -ForegroundColor Green
}

# Copilot config (~/.copilot/ → /root/.copilot/)
$copilotDir = Join-Path $HOME ".copilot"
if (Test-Path $copilotDir) {
    $volumes += "-v", "${copilotDir}:/root/.copilot"
    Write-Host "[CONFIG] Copilot: $copilotDir" -ForegroundColor Green
}

# GitHub Copilot auth
# Windows Copilot CLI stores OAuth state under %LOCALAPPDATA%\github-copilot.
# The Linux language server looks for the same files under ~/.config/github-copilot.
$ghCopilotDir = Get-FirstExistingPath @(
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "github-copilot" }),
    (Join-Path $HOME ".config" "github-copilot")
)
if (Test-Path $ghCopilotDir) {
    $volumes += "-v", "${ghCopilotDir}:/root/.config/github-copilot"
    $volumes += "-v", "${ghCopilotDir}:/root/.local/share/github-copilot"
    Write-Host "[CONFIG] GitHub Copilot auth: $ghCopilotDir" -ForegroundColor Green
} else {
    Write-Host "[CONFIG] GitHub Copilot auth: not found" -ForegroundColor Yellow
}

# Local project directory
if ($LocalDir -and (Test-Path $LocalDir)) {
    $volumes += "-v", "${LocalDir}:/workspace/external"
    Write-Host "[MOUNT] Project: $LocalDir → /workspace/external" -ForegroundColor Yellow
}

$copilotToken = $env:COPILOT_GITHUB_TOKEN
$copilotTokenSource = $null
if ($copilotToken) {
    $copilotTokenSource = 'COPILOT_GITHUB_TOKEN'
} elseif ($env:GH_TOKEN) {
    $copilotToken = $env:GH_TOKEN
    $copilotTokenSource = 'GH_TOKEN'
} elseif ($env:GITHUB_TOKEN) {
    $copilotToken = $env:GITHUB_TOKEN
    $copilotTokenSource = 'GITHUB_TOKEN'
} else {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($gh) {
        try {
            $ghToken = gh auth token 2>$null
            if ($LASTEXITCODE -eq 0 -and $ghToken) {
                $copilotToken = $ghToken.Trim()
                $copilotTokenSource = 'gh auth token'
            }
        } catch {}
    }
}

$envArgs = @(
    "-e", "WebPubSubConnectionString=$ConnectionString",
    "-e", "DAEMON_USER_ID=docker-daemon"
)

if ($copilotToken) {
    $envArgs += "-e", "COPILOT_GITHUB_TOKEN=$copilotToken"
    Write-Host "[AUTH] Copilot token: $copilotTokenSource" -ForegroundColor Green
} else {
    Write-Host "[AUTH] Copilot token: not found (container Copilot may require login)" -ForegroundColor Yellow
}

Write-Host "[START] Starting $Name..." -ForegroundColor Cyan
$cmd = @(
    "run", "-d", "--name", $Name, "--network", "host"
) + $envArgs + $volumes + @($Image)

docker @cmd
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to start container"; exit 1 }

Start-Sleep 2
Write-Host ""
Write-Host "[LOGS] Container output:" -ForegroundColor Cyan
docker logs $Name 2>&1

Write-Host ""
Write-Host "Daemon running. Open http://localhost:3000 in your browser." -ForegroundColor Green
Write-Host "Stop: docker rm -f $Name" -ForegroundColor DarkGray
