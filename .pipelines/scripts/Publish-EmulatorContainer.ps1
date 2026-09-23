[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $ArtifactDirectory,
    [Parameter(Mandatory)][ValidateSet('version', 'latest')][string] $Action
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-AzJson {
    $result = & az @args --subscription $subscription --only-show-errors --output json
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI command failed: az $($args[0..([Math]::Min(2, $args.Count - 1))] -join ' ')" }
    if ($result) { ($result -join "`n") | ConvertFrom-Json }
}

$registryResourceId = $env:CONTAINER_ACR_RESOURCE_ID
if ($registryResourceId -notmatch '^/subscriptions/([^/]+)/resourceGroups/([^/]+)/providers/Microsoft.ContainerRegistry/registries/([^/]+)$') {
    throw 'Set EmulatorContainerRegistryResourceId to the ACR resource ID.'
}
$subscription = $Matches[1]
$resourceGroup = $Matches[2]
$registryName = $Matches[3]
$stagingRepository = $env:CONTAINER_STAGING_REPOSITORY
$releaseRepository = $env:CONTAINER_RELEASE_REPOSITORY
if ($stagingRepository -eq $releaseRepository) { throw 'Staging and release repositories must differ.' }

$artifactRoot = (Resolve-Path $ArtifactDirectory).Path
$metadata = Get-Content (Join-Path $artifactRoot 'container-release.json') -Raw | ConvertFrom-Json
if ($metadata.buildId -cne $env:BUILD_BUILDID -or $metadata.sourceVersion -cne $env:BUILD_SOURCEVERSION) {
    throw 'The image artifact must come from this exact pipeline run and source commit.'
}
$version = [string] $metadata.version

if ($Action -eq 'latest') {
    $published = Invoke-AzJson acr repository show --name $registryName --image "${releaseRepository}:$version"
    $digest = $published.digest
    $manifest = Invoke-AzJson acr manifest show --registry $registryName --name "${releaseRepository}@$digest"
    if ($manifest.config.digest -cne $metadata.imageConfigDigest) {
        throw 'The published version does not reference the image tested in this build.'
    }
    Invoke-AzJson acr import --name $registryName --resource-group $resourceGroup --registry $registryResourceId `
        --source "${releaseRepository}@$digest" --image "${releaseRepository}:latest" --force | Out-Null
    Write-Host "Updated ${releaseRepository}:latest to $version."
    return
}

$imagePath = Join-Path $artifactRoot $metadata.archiveFile
if ((Get-FileHash $imagePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $metadata.archiveSha256) {
    throw 'The image archive does not match the bytes validated by the build stage.'
}

# The release pool has no Docker daemon. ACR Tasks loads and pushes the tested archive.
$run = Invoke-AzJson acr run $artifactRoot --registry $registryName --resource-group $resourceGroup `
    --file push-tested-emulator-image.yml --platform linux/amd64 --timeout 1800 --no-logs --source-acr-auth-id '[caller]' `
    --set "archiveFile=$($metadata.archiveFile)" "imageReference=$($metadata.imageReference)" "repository=$stagingRepository"
if ($run.status -ne 'Succeeded') { throw "ACR transport run $($run.runId) ended with status $($run.status)." }
$digest = $run.outputImages[0].digest
$manifest = Invoke-AzJson acr manifest show --registry $registryName --name "${stagingRepository}@$digest"
if ($manifest.config.digest -cne $metadata.imageConfigDigest) { throw 'The staged image does not match the tested image.' }

# Import without --force rejects an existing version tag.
Invoke-AzJson acr import --name $registryName --resource-group $resourceGroup --registry $registryResourceId `
    --source "${stagingRepository}@$digest" --image "${releaseRepository}:$version" | Out-Null
Invoke-AzJson acr repository update --name $registryName --image "${releaseRepository}:$version" `
    --write-enabled false --delete-enabled false | Out-Null
Write-Host "Published ${releaseRepository}:$version."
