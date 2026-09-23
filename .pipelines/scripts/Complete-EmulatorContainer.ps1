[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $ContextDirectory,
    [Parameter(Mandatory)][string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$metadata = Get-Content (Join-Path $ContextDirectory 'container-input.json') -Raw | ConvertFrom-Json
if ($metadata.buildId -cne $env:BUILD_BUILDID -or $metadata.sourceVersion -cne $env:BUILD_SOURCEVERSION) {
    throw 'Container inputs must come from this exact pipeline run and source commit.'
}
$archiveFile = "webpubsub-emulator.$($metadata.version).linux-amd64.tar"
$archivePath = Join-Path $OutputDirectory $archiveFile
function Read-ImageJson([string] $Path) {
    $json = & tar -xOf $archivePath $Path
    if ($LASTEXITCODE -ne 0) { throw "Could not read $Path from the saved image." }
    ($json -join "`n") | ConvertFrom-Json
}
$manifests = @(Read-ImageJson 'manifest.json')
if ($manifests.Count -ne 1 -or @($manifests[0].RepoTags).Count -ne 1 -or
    $manifests[0].Config -cnotmatch '^(?:blobs/sha256/)?([a-f0-9]{64})(?:\.json)?$') {
    throw 'Expected one saved image with one tag and a configuration digest.'
}
$imageConfigDigest = 'sha256:' + $Matches[1]
$imageReference = [string] $manifests[0].RepoTags[0]
$configuration = Read-ImageJson $manifests[0].Config
if ($configuration.os -cne 'linux' -or $configuration.architecture -cne 'amd64' -or
    $configuration.config.Labels.'org.opencontainers.image.version' -cne $metadata.version -or
    $configuration.config.Labels.'org.opencontainers.image.revision' -cne $metadata.sourceVersion) {
    throw 'The saved image platform, version and source labels must match this build.'
}
$metadata | Add-Member -NotePropertyMembers @{
    archiveFile = $archiveFile
    imageReference = $imageReference
    imageConfigDigest = $imageConfigDigest
    archiveSha256 = (Get-FileHash $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    platform = 'linux/amd64'
}
$metadata | ConvertTo-Json | Set-Content (Join-Path $OutputDirectory 'container-release.json') -Encoding utf8NoBOM
Copy-Item (Join-Path $PSScriptRoot 'Publish-EmulatorContainer.ps1') $OutputDirectory
Copy-Item (Join-Path $PSScriptRoot '../templates/push-tested-emulator-image.yml') $OutputDirectory
Write-Host "Recorded tested OneBranch image $imageReference ($imageConfigDigest). No registry writes were performed."
