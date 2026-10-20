[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $ArtifactDirectory,
    [Parameter(Mandatory)][ValidateSet('version', 'latest')][string] $Action
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$registryResourceId = $env:CONTAINER_ACR_RESOURCE_ID
if ($registryResourceId -notmatch '^/subscriptions/([^/]+)/resourceGroups/([^/]+)/providers/Microsoft.ContainerRegistry/registries/([a-zA-Z0-9]+)$') {
    throw 'Set EmulatorContainerRegistryResourceId to the ACR resource ID.'
}
$registry = $Matches[3].ToLowerInvariant() + '.azurecr.io'
$releaseRepository = $env:CONTAINER_RELEASE_REPOSITORY
if ($releaseRepository -cnotmatch '^[a-z0-9]+(?:[._/-][a-z0-9]+)*$') { throw 'Configure a valid release repository name.' }

$artifactRoot = (Resolve-Path $ArtifactDirectory).Path
$metadata = Get-Content (Join-Path $artifactRoot 'container-release.json') -Raw | ConvertFrom-Json
if ($metadata.buildId -cne $env:BUILD_BUILDID -or $metadata.sourceVersion -cne $env:BUILD_SOURCEVERSION) {
    throw 'The image artifact must come from this exact pipeline run and source commit.'
}
$version = [string] $metadata.version
if ($version -cnotmatch '^\d+\.\d+\.\d+(?:-beta\.\d+)?$') { throw 'Invalid container release version.' }
$platforms = @($metadata.images.platform | Sort-Object)
if (($platforms -join ',') -cne 'linux/amd64,linux/arm64') {
    throw 'Expected tested AMD64 and ARM64 images.'
}
foreach ($image in $metadata.images) {
    $architecture = $image.platform.Split('/')[-1]
    if ($image.archiveFile -cne "webpubsub-emulator.$version.linux-$architecture.tar") { throw 'Invalid image archive filename.' }
    $imagePath = Join-Path $artifactRoot $image.archiveFile
    if ((Get-FileHash $imagePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $image.archiveSha256) {
        throw 'The image archive does not match the bytes validated by the build stage.'
    }
}

# Both tags use this build's tested images; the pipeline tasks handle login and push.
$tag = if ($Action -eq 'latest') { 'latest' } else { $version }
Write-Host "##vso[task.setvariable variable=emulatorRegistry]$registry"
foreach ($image in $metadata.images) {
    $architecture = $image.platform.Split('/')[-1]
    Write-Host "##vso[task.setvariable variable=emulatorImageReference_$architecture]$($image.imageReference)"
    Write-Host "##vso[task.setvariable variable=emulatorArchivePath_$architecture]$(Join-Path $artifactRoot $image.archiveFile)"
}
Write-Host "##vso[task.setvariable variable=emulatorImageReference]webpubsub-emulator:$version"
Write-Host "##vso[task.setvariable variable=emulatorTargetImage]${registry}/${releaseRepository}:$tag"
