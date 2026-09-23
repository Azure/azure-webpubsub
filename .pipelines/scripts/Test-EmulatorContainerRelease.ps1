# Offline guard/order tests only. Command doubles must never contact Azure or Docker.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($name in @('Prepare-EmulatorContainer.ps1', 'Complete-EmulatorContainer.ps1', 'Publish-EmulatorContainer.ps1',
    'Test-EmulatorContainerRelease.ps1')) {
    $tokens = $null
    $parseErrors = $null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name), [ref] $tokens, [ref] $parseErrors) | Out-Null
    if ($parseErrors.Count -gt 0) { throw "${name}: $($parseErrors.Message -join '; ')" }
}
Write-Host 'All container pipeline PowerShell scripts parsed successfully.'

$root = Join-Path $PSScriptRoot ('.container-release-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $root | Out-Null
$envNames = @('BUILD_BUILDID', 'BUILD_SOURCEVERSION', 'CONTAINER_ACTION',
    'CONTAINER_ACR_RESOURCE_ID', 'CONTAINER_STAGING_REPOSITORY', 'CONTAINER_RELEASE_REPOSITORY')
$savedEnv = @{}
foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name) }
$passed = 0

function az {
    $global:LASTEXITCODE = 0
    $state = $publication
    $command = $args -join ' '
    $state.calls.Add($command)
    if ($state.azureFailure -and $command -match $state.azureFailure) { $global:LASTEXITCODE = 1; return }
    switch -Regex ($command) {
        '^acr run ' {
            $state.writes++
            $result = @{ runId = 'run123'; status = $state.taskStatus; outputImages = @(@{
                registry = 'testregistry.azurecr.io'; repository = 'private/emulator'; tag = 'run123'; digest = $state.digest
            }) }; break
        }
        '^acr manifest show ' { $result = @{ config = @{ digest = $state.imageId } }; break }
        '^acr import .*:latest ' { $state.writes++; $state.latest = $true; $result = $null; break }
        '^acr import ' {
            $state.writes++
            if ($state.version) { $global:LASTEXITCODE = 1; return }
            $state.version = $true; $result = $null; break
        }
        '^acr repository update ' { $state.writes++; $result = $null; break }
        '^acr repository show ' {
            if (-not $state.version) { $global:LASTEXITCODE = 1; return }
            $result = @{ digest = $state.digest }; break
        }
        default { throw "Unexpected Azure command in offline test: $command" }
    }
    ConvertTo-Json -InputObject $result -Depth 8 -Compress
}
function Invoke-WebRequest { throw 'Release tests must not contact HTTP endpoints.' }

function Reset-Test {
    $env:BUILD_BUILDID = '123'
    $env:BUILD_SOURCEVERSION = 'a' * 40
    $env:CONTAINER_ACTION = 'version'
    $env:CONTAINER_ACR_RESOURCE_ID = '/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/test/providers/Microsoft.ContainerRegistry/registries/testregistry'
    $env:CONTAINER_STAGING_REPOSITORY = 'private/emulator'
    $env:CONTAINER_RELEASE_REPOSITORY = 'release/emulator'
    $script:publication = @{
        calls = [Collections.Generic.List[string]]::new()
        writes = 0; imageId = 'sha256:' + ('b' * 64); digest = 'sha256:' + ('c' * 64)
        taskStatus = 'Succeeded'; version = $false; latest = $false; azureFailure = ''
    }
    Set-Content (Join-Path $root 'archive-fixture') 'Offline fixture: this is not a container image.'
    $script:metadata = @{
        schemaVersion = 1; buildId = '123'; sourceVersion = $env:BUILD_SOURCEVERSION; version = '1.2.3'
        packageSha256 = 'd' * 64; archiveSha256 = (Get-FileHash (Join-Path $root 'archive-fixture')).Hash.ToLowerInvariant()
        imageReference = 'onebranch.azurecr.io/webpubsub-emulator-build:123'
        imageConfigDigest = $script:publication.imageId; platform = 'linux/amd64'
    }
}
function Invoke-Case([string] $Name, [scriptblock] $Arrange, [string] $Failure = '', [int] $Writes = 0) {
    Reset-Test
    & $Arrange
    $archiveFile = "webpubsub-emulator.$($metadata.version).linux-amd64.tar"
    $metadata.archiveFile = $archiveFile
    Copy-Item (Join-Path $root 'archive-fixture') (Join-Path $root $archiveFile)
    $metadata | ConvertTo-Json | Set-Content (Join-Path $root 'container-release.json')
    $caught = ''
    try {
        & (Join-Path $PSScriptRoot 'Publish-EmulatorContainer.ps1') -ArtifactDirectory $root -Action $env:CONTAINER_ACTION
    }
    catch { $caught = $_.Exception.Message }
    if ($Failure) {
        if ($caught -notlike "*$Failure*") { throw "${Name}: expected '$Failure', got '$caught'." }
    }
    elseif ($caught) { throw "${Name}: unexpected failure: $caught" }
    if ($script:publication.writes -ne $Writes) {
        throw "${Name}: expected $Writes registry writes, got $($script:publication.writes)."
    }
    Write-Host "PASS $Name"
    $script:passed++
}

function Use-PublishedVersion([string] $Version = '1.2.3') {
    $env:CONTAINER_ACTION = 'latest'
    $script:metadata.version = $Version
    $script:publication.version = $true
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
    Invoke-Case 'invalid action cannot publish' { $env:CONTAINER_ACTION = 'validate' } 'ValidateSet'
    Invoke-Case 'unconfigured registry fails' { $env:CONTAINER_ACR_RESOURCE_ID = '' } 'ACR resource ID'
    Invoke-Case 'staging cannot be release repository' { $env:CONTAINER_STAGING_REPOSITORY = $env:CONTAINER_RELEASE_REPOSITORY } 'must differ'
    Invoke-Case 'metadata from another build fails' { $script:metadata.buildId = '122' } 'exact pipeline run'
    Invoke-Case 'tampered archive fails' { $script:metadata.archiveSha256 = 'e' * 64 } 'bytes validated'
    Invoke-Case 'existing version is not overwritten' { $script:publication.version = $true } 'Azure CLI command failed: az acr import' -Writes 2
    Invoke-Case 'failed transport never promotes' { $script:publication.taskStatus = 'Failed' } 'status Failed' -Writes 1
    Invoke-Case 'wrong staged image never promotes' { $script:publication.imageId = 'sha256:' + ('e' * 64) } 'staged image does not match' -Writes 1
    Invoke-Case 'failed version lock fails publication' { $script:publication.azureFailure = '^acr repository update ' } 'Azure CLI command failed' -Writes 2
    Invoke-Case 'version publication never advances latest' {} -Writes 3
    if ($script:publication.latest) { throw 'Version publication advanced latest.' }
    $calls = $script:publication.calls
    $versionImport = @($calls | Where-Object { $_ -match '^acr import ' })
    if ($versionImport.Count -ne 1 -or $versionImport[0].Contains('--force')) { throw 'Version publication must not overwrite tags.' }
    $transport = @($calls | Where-Object { $_ -match '^acr run ' })
    if ($transport.Count -ne 1 -or -not $transport[0].Contains('imageReference=onebranch.azurecr.io/webpubsub-emulator-build:123') -or
        -not $transport[0].Contains('archiveFile=webpubsub-emulator.1.2.3.linux-amd64.tar') -or $transport[0].Contains('--no-wait')) {
        throw 'Archive transport must wait for completion and use the image saved by the build.'
    }
    if (@($calls | Where-Object { -not $_.Contains('--subscription 11111111-1111-1111-1111-111111111111') }).Count) {
        throw 'Registry operations must use the configured subscription.'
    }
    Invoke-Case 'beta version publication never advances latest' { $script:metadata.version = '1.2.3-beta.1' } -Writes 3
    if ($script:publication.latest) { throw 'Beta publication advanced latest.' }

    Invoke-Case 'latest requires a published version' { $env:CONTAINER_ACTION = 'latest' } 'Azure CLI command failed: az acr repository show'
    Invoke-Case 'latest rejects metadata from another build' { Use-PublishedVersion; $script:metadata.buildId = '122' } 'exact pipeline run'
    Invoke-Case 'latest requires this build image' { Use-PublishedVersion; $script:publication.imageId = 'sha256:' + ('e' * 64) } 'image tested in this build'
    Invoke-Case 'approved beta can update latest' { Use-PublishedVersion '1.2.3-beta.1' } -Writes 1
    $calls = $script:publication.calls
    $latestImport = @($calls | Where-Object { $_ -match '^acr import .*:latest ' })
    if ($latestImport.Count -ne 1 -or -not $latestImport[0].Contains("--source release/emulator@$($script:publication.digest)")) {
        throw 'Latest must use the published version digest.'
    }
    if (@($calls | Where-Object { $_ -match '^acr (run|repository update) ' }).Count) {
        throw 'Latest must not upload or re-lock the image.'
    }
    Invoke-Case 'latest can be retried without republishing version' { Use-PublishedVersion; $script:publication.latest = $true } -Writes 1
    Test-ContainerBuild
    Write-Host "All $passed offline cases passed. No Azure, Docker, or registry calls were made."
}
finally {
    foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name]) }
    $cleanup = (Resolve-Path -LiteralPath $root).Path
    if ((Split-Path -Parent $cleanup) -ne $PSScriptRoot) { throw 'Test cleanup must stay inside the scripts directory.' }
    Remove-Item -LiteralPath $cleanup -Recurse -Force
}
