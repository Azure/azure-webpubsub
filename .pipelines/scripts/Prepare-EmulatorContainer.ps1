[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $PackageDirectory,
    [Parameter(Mandatory)][string] $Version,
    [Parameter(Mandatory)][string] $NodePath,
    [Parameter(Mandatory)][string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
# Build-EmulatorPackage has already validated this release package.
$package = Get-Item (Join-Path $PackageDirectory "Microsoft.Azure.WebPubSub.Emulator.$Version.nupkg")
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force $output | Out-Null
Copy-Item $package.FullName $output
Copy-Item (Join-Path $repoRoot 'tools/emulator/Dockerfile') $output
$smoke = Join-Path $output 'smoke'
New-Item -ItemType Directory $smoke | Out-Null
# Use the portable Node installed by UseNode, not the build image's system Node.
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $smoke 'node')
Copy-Item (Join-Path $repoRoot 'tools/emulator/docker/emulator-container-test.mjs') $smoke
Copy-Item (Join-Path $repoRoot 'tools/emulator/docker/onebranch-container-test.mjs') $smoke
# Expand only the known download path; OneBranch's Docker job runs the test file.
$testConfig = Get-Content (Join-Path $repoRoot '.pipelines/templates/emulator-container-tests.json') -Raw
$testConfig.Replace('__SMOKE_DIRECTORY__', "/tmp/awps-container-$($env:BUILD_BUILDID)/container") |
    Set-Content (Join-Path $output 'container-tests.json') -Encoding utf8NoBOM
@{
    schemaVersion = 1
    buildId = $env:BUILD_BUILDID
    sourceVersion = $env:BUILD_SOURCEVERSION
    version = $version
    packageSha256 = (Get-FileHash $package.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json | Set-Content (Join-Path $output 'container-input.json') -Encoding utf8NoBOM
Write-Host "Prepared release-package container context for $version. OneBranch builds and tests the image."
