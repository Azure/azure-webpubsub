[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $ArtifactDirectory,
    [Parameter(Mandatory)][ValidateSet('version', 'latest')][string] $Action,
    [ValidateSet('Prepare', 'Publish')][string] $Phase = 'Publish'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$registryResourceId = $env:CONTAINER_ACR_RESOURCE_ID
if ($registryResourceId -notmatch '^/subscriptions/([^/]+)/resourceGroups/([^/]+)/providers/Microsoft.ContainerRegistry/registries/([a-zA-Z0-9]+)$') {
    throw 'Set EmulatorContainerRegistryResourceId to the ACR resource ID.'
}
$registry = $Matches[3].ToLowerInvariant() + '.azurecr.io'
$stagingRepository = $env:CONTAINER_STAGING_REPOSITORY
$releaseRepository = $env:CONTAINER_RELEASE_REPOSITORY
foreach ($repository in @($stagingRepository, $releaseRepository)) {
    if ($repository -cnotmatch '^[a-z0-9]+(?:[._/-][a-z0-9]+)*$') { throw 'Configure valid staging and release repository names.' }
}
if ($stagingRepository -eq $releaseRepository) { throw 'Staging and release repositories must differ.' }

$artifactRoot = (Resolve-Path $ArtifactDirectory).Path
$metadata = Get-Content (Join-Path $artifactRoot 'container-release.json') -Raw | ConvertFrom-Json
if ($metadata.buildId -cne $env:BUILD_BUILDID -or $metadata.sourceVersion -cne $env:BUILD_SOURCEVERSION) {
    throw 'The image artifact must come from this exact pipeline run and source commit.'
}
$version = [string] $metadata.version
if ($version -cnotmatch '^\d+\.\d+\.\d+(?:-beta\.\d+)?$') { throw 'Invalid container release version.' }
if ($metadata.archiveFile -cne "webpubsub-emulator.$version.linux-amd64.tar") { throw 'Invalid image archive filename.' }
$imagePath = Join-Path $artifactRoot $metadata.archiveFile
if ($Action -eq 'version' -and
    (Get-FileHash $imagePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $metadata.archiveSha256) {
    throw 'The image archive does not match the bytes validated by the build stage.'
}
if ($Phase -eq 'Prepare') {
    Write-Host "##vso[task.setvariable variable=emulatorRegistry]$registry"
    Write-Host "##vso[task.setvariable variable=emulatorImageReference]$($metadata.imageReference)"
    Write-Host "##vso[task.setvariable variable=emulatorArchivePath]$imagePath"
    Write-Host "##vso[task.setvariable variable=emulatorStagingImage]${registry}/${stagingRepository}:$($metadata.buildId)"
    return
}

# Docker's ARM/WIF login provides an ACR refresh token. These requests only
# publish registry content; no Azure resource deployment or ACR Task is invoked.
if (-not $env:DOCKER_CONFIG) { throw 'Registry authentication must run before publication.' }
$dockerConfig = Get-Content (Join-Path $env:DOCKER_CONFIG 'config.json') -Raw | ConvertFrom-Json -AsHashtable
$auth = $dockerConfig.auths[$registry].auth
if (-not $auth) { throw "Docker login did not provide credentials for $registry." }
$credentials = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($auth)).Split(':', 2)
if ($credentials.Count -ne 2 -or $credentials[0] -ne '00000000-0000-0000-0000-000000000000') {
    throw 'Registry publication requires workload identity federation authentication.'
}
$scopes = "repository:${releaseRepository}:pull,push,metadata_read,metadata_write"
if ($Action -eq 'version') { $scopes += " repository:${stagingRepository}:pull" }
$tokenResponse = Invoke-WebRequest -Method Post -Uri "https://$registry/oauth2/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
        grant_type = 'refresh_token'; service = $registry; scope = $scopes; refresh_token = $credentials[1]
    } -SkipHttpErrorCheck -MaximumRedirection 0
if ($tokenResponse.StatusCode -ne 200) { throw "Registry authentication failed (HTTP $($tokenResponse.StatusCode))." }
$accessToken = ($tokenResponse.Content | ConvertFrom-Json).access_token
if (-not $accessToken) { throw 'Registry authentication returned no access token.' }

function Invoke-Registry([string] $Method, [string] $Path, [int[]] $Expected = @(200),
    [object] $Body = $null, [string] $ContentType = 'application/json') {
    if ($Path.StartsWith('/acr/v1/')) { $Path += '?api-version=2021-07-01' }
    $request = @{
        Method = $Method; Uri = "https://$registry$Path"
        Headers = @{
            Authorization = "Bearer $accessToken"
            Accept = 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'
        }
        SkipHttpErrorCheck = $true; MaximumRedirection = 0
    }
    if ($null -ne $Body) { $request.Body = $Body; $request.ContentType = $ContentType }
    $response = Invoke-WebRequest @request
    if ($response.StatusCode -notin $Expected) {
        throw "Registry $Method $Path failed (HTTP $($response.StatusCode))."
    }
    return $response
}

function Read-Manifest([string] $Repository, [string] $Reference) {
    $response = Invoke-Registry GET "/v2/$Repository/manifests/$Reference"
    $manifest = $response.Content | ConvertFrom-Json
    if ($manifest.config.digest -cne $metadata.imageConfigDigest) {
        throw 'The registry image does not match the image tested in this build.'
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes([string] $response.Content)
    $digest = 'sha256:' + [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    if ($digest -cne [string] $response.Headers['Docker-Content-Digest'][0]) {
        throw 'The registry manifest does not match its digest.'
    }
    return @{ manifest = $manifest; bytes = $bytes; digest = $digest; mediaType = $manifest.mediaType }
}

function Assert-VersionAbsent {
    $response = Invoke-Registry GET "/acr/v1/$releaseRepository/_tags/$version" -Expected @(200, 404)
    if ($response.StatusCode -ne 404) { throw "Version ${releaseRepository}:$version already exists; it will not be overwritten." }
}

if ($Action -eq 'latest') {
    $tag = (Invoke-Registry GET "/acr/v1/$releaseRepository/_tags/$version").Content | ConvertFrom-Json
    if ($tag.tag.changeableAttributes.writeEnabled -or $tag.tag.changeableAttributes.deleteEnabled) {
        throw 'Latest requires a locked release version.'
    }
    $published = Read-Manifest $releaseRepository $tag.tag.digest
    Invoke-Registry PUT "/v2/$releaseRepository/manifests/latest" -Expected @(201) `
        -Body $published.bytes -ContentType $published.mediaType | Out-Null
    Write-Host "Updated ${releaseRepository}:latest to $version ($($published.digest))."
    return
}

Assert-VersionAbsent
$staged = Read-Manifest $stagingRepository $metadata.buildId
# Mount existing blobs within this registry, then publish the exact same manifest.
# Both publishers are serialized by the service connection's Exclusive lock.
foreach ($blob in @($staged.manifest.config) + @($staged.manifest.layers)) {
    if ($blob.digest -cnotmatch '^sha256:[a-f0-9]{64}$') { throw 'Invalid image blob digest.' }
    $digest = [Uri]::EscapeDataString($blob.digest)
    $source = [Uri]::EscapeDataString($stagingRepository)
    Invoke-Registry POST "/v2/$releaseRepository/blobs/uploads/?mount=$digest&from=$source" -Expected @(201) | Out-Null
}
Assert-VersionAbsent
Invoke-Registry PUT "/v2/$releaseRepository/manifests/$version" -Expected @(201) `
    -Body $staged.bytes -ContentType $staged.mediaType | Out-Null
Invoke-Registry PATCH "/acr/v1/$releaseRepository/_tags/$version" -Body '{"writeEnabled":false,"deleteEnabled":false}' | Out-Null
$published = Read-Manifest $releaseRepository $version
if ($published.digest -cne $staged.digest) { throw 'The release tag does not reference the staged manifest.' }
Write-Host "Published and locked ${releaseRepository}:$version ($($published.digest))."
