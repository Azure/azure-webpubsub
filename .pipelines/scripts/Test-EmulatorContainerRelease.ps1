# Offline guard/order tests only. Command doubles must never contact Azure or Docker.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($name in @('Prepare-EmulatorContainer.ps1', 'Complete-EmulatorContainer.ps1', 'Publish-EmulatorContainer.ps1',
    'Verify-EmulatorContainer.ps1', 'Test-EmulatorContainerRelease.ps1')) {
    $tokens = $null
    $parseErrors = $null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name), [ref] $tokens, [ref] $parseErrors) | Out-Null
    if ($parseErrors.Count -gt 0) { throw "${name}: $($parseErrors.Message -join '; ')" }
}
Write-Host 'All container pipeline PowerShell scripts parsed successfully.'

$root = Join-Path $PSScriptRoot ('.container-release-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $root | Out-Null
$envNames = @('BUILD_BUILDID', 'BUILD_SOURCEVERSION', 'CONTAINER_ACTION',
    'CONTAINER_ACR_RESOURCE_ID', 'CONTAINER_RELEASE_REPOSITORY')
$savedEnv = @{}
foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name) }
$passed = 0

function az { throw 'Release tests must not invoke Azure CLI.' }
function Invoke-WebRequest { throw 'Artifact preparation must not contact the registry.' }

function Reset-Test {
    $env:BUILD_BUILDID = '123'
    $env:BUILD_SOURCEVERSION = 'a' * 40
    $env:CONTAINER_ACTION = 'version'
    $env:CONTAINER_ACR_RESOURCE_ID = '/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/test/providers/Microsoft.ContainerRegistry/registries/testregistry'
    $env:CONTAINER_RELEASE_REPOSITORY = 'release/emulator'
    Set-Content (Join-Path $root 'archive-fixture') 'Offline fixture: this is not a container image.'
    $script:metadata = @{
        schemaVersion = 1; buildId = '123'; sourceVersion = $env:BUILD_SOURCEVERSION; version = '1.2.3'
        packageSha256 = 'd' * 64; archiveSha256 = (Get-FileHash (Join-Path $root 'archive-fixture')).Hash.ToLowerInvariant()
        imageReference = 'onebranch.azurecr.io/webpubsub-emulator-build:123'
        imageConfigDigest = ('sha256:' + ('b' * 64)); platform = 'linux/amd64'
    }
}
function Invoke-Case([string] $Name, [scriptblock] $Arrange, [string] $Failure = '') {
    Reset-Test
    & $Arrange
    $archiveFile = "webpubsub-emulator.$($metadata.version).linux-amd64.tar"
    $metadata.archiveFile = $archiveFile
    Copy-Item (Join-Path $root 'archive-fixture') (Join-Path $root $archiveFile)
    $metadata | ConvertTo-Json | Set-Content (Join-Path $root 'container-release.json')
    $caught = ''
    $variables = @{}
    try {
        & (Join-Path $PSScriptRoot 'Publish-EmulatorContainer.ps1') -ArtifactDirectory $root -Action $env:CONTAINER_ACTION 6>&1 |
            ForEach-Object {
                if ("$_" -match '^##vso\[task.setvariable variable=([^\]]+)\](.*)$') { $variables[$Matches[1]] = $Matches[2] }
            }
    }
    catch { $caught = $_.Exception.Message }
    if ($Failure) {
        if ($caught -notlike "*$Failure*") { throw "${Name}: expected '$Failure', got '$caught'." }
        if ($variables.Count) { throw "${Name}: invalid artifacts must not emit publication inputs." }
    }
    elseif ($caught) { throw "${Name}: unexpected failure: $caught" }
    else {
        $tag = if ($env:CONTAINER_ACTION -eq 'latest') { 'latest' } else { $metadata.version }
        if ($variables.emulatorRegistry -cne 'testregistry.azurecr.io' -or
            $variables.emulatorTargetImage -cne "testregistry.azurecr.io/release/emulator:$tag" -or
            $variables.emulatorArchivePath -cne (Join-Path $root $archiveFile) -or
            $variables.emulatorImageReference -cne $metadata.imageReference) {
            throw "${Name}: incorrect 1ES image publication inputs."
        }
    }
    Write-Host "PASS $Name"
    $script:passed++
}

function Test-PublicationVerification {
    $digest = 'sha256:' + ('b' * 64)
    function oras {
        $isLocal = $args -contains '--oci-layout'
        $reference = if ($isLocal) { 'fixture:123' } else { 'testregistry.azurecr.io/release/emulator:latest' }
        if ($args -notcontains $reference -or $args -notcontains '--descriptor') { throw 'Incorrect manifest query.' }
        $global:LASTEXITCODE = if ($isLocal) { $case.localExit } else { $case.remoteExit }
        @{ digest = $(if ($isLocal) { $case.localDigest } else { $case.remoteDigest }) } | ConvertTo-Json
    }
    foreach ($case in @(
        @{ name = 'published tag matches'; localDigest = $digest; remoteDigest = $digest; localExit = 0; remoteExit = 0; failure = '' },
        @{ name = 'wrong published digest'; localDigest = $digest; remoteDigest = 'sha256:' + ('c' * 64); localExit = 0; remoteExit = 0; failure = 'does not match' },
        @{ name = 'published tag cannot be read'; localDigest = $digest; remoteDigest = ''; localExit = 0; remoteExit = 1; failure = 'Could not read the published' },
        @{ name = 'local manifest cannot be read'; localDigest = ''; remoteDigest = $digest; localExit = 1; remoteExit = 0; failure = 'Could not read the local' },
        @{ name = 'empty digests cannot pass'; localDigest = ''; remoteDigest = ''; localExit = 0; remoteExit = 0; failure = 'does not match' }
    )) {
        $caught = ''
        try {
            & (Join-Path $PSScriptRoot 'Verify-EmulatorContainer.ps1') -OciLayout fixture `
                -ImageReference 'onebranch.azurecr.io/webpubsub-emulator-build:123' `
                -TargetImage 'testregistry.azurecr.io/release/emulator:latest' -OrasPath oras
        }
        catch { $caught = $_.Exception.Message }
        if (($case.failure -and $caught -notlike "*$($case.failure)*") -or (-not $case.failure -and $caught)) {
            throw "$($case.name): unexpected result '$caught'."
        }
        Write-Host "PASS $($case.name)"
        $script:passed++
    }
}

function Test-ContainerBuild {
    Reset-Test
    $packageId = 'Microsoft.Azure.WebPubSub.Emulator'
    $nodeFixture = Join-Path $root 'node-fixture'
    Set-Content $nodeFixture 'Offline Linux Node binary fixture'
    $systemNodeFixture = Join-Path $root 'system-node-fixture'
    Set-Content $systemNodeFixture 'System Node with build-image-only shared libraries'
    function Get-Command { param($Name, $CommandType) @{ Source = $systemNodeFixture } }
    function dotnet { throw 'Context preparation must not require NuGet package signing or the .NET SDK.' }
    $packageDirectory = Join-Path $root 'packages'
    New-Item -ItemType Directory $packageDirectory | Out-Null
    $packagePath = Join-Path $packageDirectory "$packageId.1.2.3.nupkg"
    Set-Content $packagePath 'Release package already validated by the package build.'
    $contextDirectory = Join-Path $root 'prepare'
    & (Join-Path $PSScriptRoot 'Prepare-EmulatorContainer.ps1') -PackageDirectory $packageDirectory `
        -Version '1.2.3' -NodePath $nodeFixture -OutputDirectory $contextDirectory
    $saved = Get-Content (Join-Path $contextDirectory 'container-input.json') -Raw | ConvertFrom-Json
    $packageHash = (Get-FileHash $packagePath).Hash.ToLowerInvariant()
    if ($saved.buildId -cne '123' -or $saved.version -cne '1.2.3' -or $saved.packageSha256 -cne $packageHash -or
        (Get-FileHash (Join-Path $contextDirectory "$packageId.1.2.3.nupkg")).Hash.ToLowerInvariant() -cne $packageHash) {
        throw 'Preparation must preserve the release package and record its version, build and hash.'
    }
    if ((Get-FileHash (Join-Path $contextDirectory 'smoke/node')).Hash -cne (Get-FileHash $nodeFixture).Hash) {
        throw 'Container tests must use the explicitly selected portable Node, not system Node from PATH.'
    }
    $tests = Get-Content (Join-Path $contextDirectory 'container-tests.json') -Raw | ConvertFrom-Json
    if ($tests.containerRunOptions.bindMounts[0] -cne '/tmp/awps-container-123/container/smoke:/container-smoke:ro') {
        throw 'The structure test must mount the prepared smoke tools.'
    }
    Write-Host 'PASS prepare preserves the package and portable Node'
    $script:passed++
    $configHash = 'b' * 64
    function tar {
        $global:LASTEXITCODE = 0
        if ($args[-1] -eq 'manifest.json') {
            ConvertTo-Json -InputObject @(@{ Config = $case.config; RepoTags = @($case.tag) }) -Compress
        }
        else {
            @{ os = 'linux'; architecture = 'amd64'; config = @{ Labels = @{
                'org.opencontainers.image.version' = $case.version
                'org.opencontainers.image.revision' = $case.source
            } } } | ConvertTo-Json -Depth 4 -Compress
        }
    }
    $defaults = @{
        config = "$configHash.json"; tag = 'onebranch.azurecr.io/webpubsub-emulator-build:123'
        source = $env:BUILD_SOURCEVERSION; version = '1.2.3'; failure = ''
    }
    foreach ($overrides in @(
        @{ name = 'classic' },
        @{ name = 'containerd'; config = "blobs/sha256/$configHash" },
        @{ name = 'invalid-config'; config = 'invalid'; failure = 'configuration digest' },
        @{ name = 'wrong-source'; source = 'e' * 40; failure = 'source labels' },
        @{ name = 'wrong-version'; version = '1.2.4'; failure = 'source labels' }
    )) {
        $case = $defaults.Clone()
        foreach ($entry in $overrides.GetEnumerator()) { $case[$entry.Key] = $entry.Value }
        $output = Join-Path $root ('complete-' + $case.name)
        New-Item -ItemType Directory $output | Out-Null
        $archivePath = Join-Path $output 'webpubsub-emulator.1.2.3.linux-amd64.tar'
        Copy-Item (Join-Path $root 'archive-fixture') $archivePath
        $archiveHash = (Get-FileHash $archivePath).Hash.ToLowerInvariant()
        $caught = ''
        try { & (Join-Path $PSScriptRoot 'Complete-EmulatorContainer.ps1') -ContextDirectory $contextDirectory -OutputDirectory $output }
        catch { $caught = $_.Exception.Message }
        if ($case.failure) {
            if ($caught -notlike "*$($case.failure)*") { throw "Complete $($case.name): expected '$($case.failure)', got '$caught'." }
            if (Test-Path (Join-Path $output 'container-release.json')) { throw 'Invalid archive emitted publication metadata.' }
        }
        else {
            if ($caught) { throw "Complete $($case.name): $caught" }
            if (-not (Test-Path (Join-Path $output 'Verify-EmulatorContainer.ps1'))) { throw 'Release artifact is missing the verification script.' }
            $saved = Get-Content (Join-Path $output 'container-release.json') -Raw | ConvertFrom-Json
            if ($saved.archiveFile -cne 'webpubsub-emulator.1.2.3.linux-amd64.tar' -or
                $saved.imageConfigDigest -cne "sha256:$configHash" -or $saved.imageReference -cne $case.tag -or
                $saved.archiveSha256 -cne $archiveHash -or (Get-FileHash $archivePath).Hash.ToLowerInvariant() -cne $archiveHash) {
                throw 'Recorded archive provenance does not match the saved image.'
            }
        }
        Write-Host "PASS complete $($case.name)"
        $script:passed++
    }
}

try {
    Invoke-Case 'unconfigured registry fails' { $env:CONTAINER_ACR_RESOURCE_ID = '' } 'ACR resource ID'
    Invoke-Case 'invalid release repository fails' { $env:CONTAINER_RELEASE_REPOSITORY = '../invalid' } 'valid release repository'
    Invoke-Case 'metadata from another build fails' { $script:metadata.buildId = '122' } 'exact pipeline run'
    Invoke-Case 'metadata from another commit fails' { $script:metadata.sourceVersion = 'e' * 40 } 'exact pipeline run'
    Invoke-Case 'tampered archive fails before transport' { $script:metadata.archiveSha256 = 'e' * 64 } 'bytes validated'
    Invoke-Case 'version prepares a direct release target' {}
    Invoke-Case 'beta prepares a version tag without advancing latest' { $script:metadata.version = '1.2.3-beta.1' }
    Invoke-Case 'latest uses the same tested archive' { $env:CONTAINER_ACTION = 'latest' }
    Invoke-Case 'latest rejects a tampered archive' {
        $env:CONTAINER_ACTION = 'latest'
        $script:metadata.archiveSha256 = 'e' * 64
    } 'bytes validated'
    Test-ContainerBuild
    Test-PublicationVerification
    Write-Host "All $passed offline cases passed. No Azure, Docker, or registry calls were made."
}
finally {
    foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name]) }
    $cleanup = (Resolve-Path -LiteralPath $root).Path
    if ((Split-Path -Parent $cleanup) -ne $PSScriptRoot) { throw 'Test cleanup must stay inside the scripts directory.' }
    Remove-Item -LiteralPath $cleanup -Recurse -Force
}
