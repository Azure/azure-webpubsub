# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

#Requires -Version 7.2
<#
.SYNOPSIS
Exercises a local emulator image through real HTTP, WebSocket, and upstream traffic.
.DESCRIPTION
Requires PowerShell 7.2+, Node.js 22+, and a running Linux Docker engine. No npm,
NuGet, SDK, or Azure credentials are needed. The emulator image must already exist
locally; this script never builds, pulls, or publishes it. The small Node helper
image is pulled only if missing (preload it for offline runs).

Runs the same protocol checks against a dynamically published loopback port from
this host and against Docker DNS from a helper container. A real HTTP server in
that helper handles upstream validation, connect/connected, and user events.
Only containers, the configuration volume, and the network labeled for this
invocation are removed. A helper writes appsettings.json to the shared volume;
the emulator mounts it read-only and must reload handlers on existing sockets.

The runner must reach the Docker daemon's published ports on 127.0.0.1. A remote
Docker daemon or containerized ACR Tasks step needs equivalent host networking;
mounting a Docker socket alone is insufficient. Such a step also needs pwsh,
Node.js 22+, and the Docker CLI. No host directory mounts are used.
.EXAMPLE
pwsh -File tools/emulator/docker/Test-EmulatorContainer.ps1 -Image awps-emulator:local
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $Image,

    [ValidateNotNullOrEmpty()]
    [string] $HelperImage = 'node:22-bookworm-slim',

    [ValidateRange(5, 300)]
    [int] $StartupTimeoutSeconds = 60,

    [ValidateRange(30, 600)]
    [int] $TestTimeoutSeconds = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$runId = [Guid]::NewGuid().ToString('N')
$network = "awps-smoke-$runId"
$emulator = "$network-emulator"
$upstream = "$network-upstream"
$configurationVolume = "$network-config"
$label = 'com.azure.webpubsub.emulator.smoke'
$accessKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$helperScript = Join-Path $PSScriptRoot 'emulator-container-test.mjs'
$containerScript = '/home/node/emulator-container-test.mjs'
$hub = 'dockersmoke'
$failed = $false
$cleanupFailed = $false
$resourcesAttempted = [Collections.Generic.List[object]]::new()

function Invoke-Tool {
    param(
        [string] $File,
        [string[]] $Arguments,
        [int] $TimeoutSeconds = 60,
        [switch] $AllowFailure,
        [hashtable] $Environment = @{}
    )
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $File
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
    foreach ($entry in $Environment.GetEnumerator()) { $start.Environment[$entry.Key] = $entry.Value }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { throw "Could not start $File." }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            # This is only the exact CLI/client process started above, never the Docker daemon.
            $process.Kill($true)
            [void] $process.WaitForExit(5000)
            throw "$File $($Arguments[0]) exceeded ${TimeoutSeconds}s."
        }
        $output = ($stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()).Trim()
        $output = $output.Replace($accessKey, '[test access key]')
        $result = [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $output }
        if ($result.ExitCode -ne 0 -and -not $AllowFailure) {
            throw "$File $($Arguments[0]) failed ($($result.ExitCode)):`n$output"
        }
        return $result
    }
    finally { $process.Dispose() }
}

function Invoke-Docker {
    param([string[]] $Arguments, [int] $TimeoutSeconds = 60, [switch] $AllowFailure)
    Invoke-Tool -File 'docker' -Arguments $Arguments -TimeoutSeconds $TimeoutSeconds -AllowFailure:$AllowFailure
}

function Get-MappedEndpoint {
    param([string] $Container)
    $result = Invoke-Docker -Arguments @('inspect', '--format', '{{json .NetworkSettings.Ports}}', $Container)
    $ports = $result.Output | ConvertFrom-Json -AsHashtable
    $binding = @($ports['8080/tcp']) | Where-Object { $_.HostIp -eq '127.0.0.1' } | Select-Object -First 1
    if (-not $binding -or -not $binding.HostPort) { throw "No loopback port was published for $Container." }
    return "http://127.0.0.1:$($binding.HostPort)"
}

function Wait-Endpoint {
    param([string] $Uri, [int] $Status, [string] $Container)
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.UseProxy = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(2)
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    $last = 'No response'
    try {
        while ([DateTime]::UtcNow -lt $deadline) {
            try {
                $response = $client.GetAsync($Uri).GetAwaiter().GetResult()
                try {
                    if ([int] $response.StatusCode -eq $Status) { return }
                    $last = "HTTP $([int] $response.StatusCode)"
                }
                finally { $response.Dispose() }
            }
            catch { $last = $_.Exception.GetBaseException().Message }
            $state = Invoke-Docker -Arguments @('inspect', '--format', '{{.State.Running}}', $Container) -TimeoutSeconds 10
            if ($state.Output -ne 'true') { throw "$Container stopped before becoming ready." }
            Start-Sleep -Milliseconds 250
        }
        throw "Timed out waiting for $Uri (expected HTTP $Status; $last)."
    }
    finally { $client.Dispose() }
}

function Remove-OwnedResource {
    param([string] $Kind, [string] $Name)
    $format = if ($Kind -eq 'container') { '{{json .Config.Labels}}' } else { '{{json .Labels}}' }
    $result = Invoke-Docker -Arguments @($Kind, 'inspect', '--format', $format, $Name) -TimeoutSeconds 15 -AllowFailure
    if ($result.ExitCode -ne 0) {
        if ($result.Output -match '(?i)(no such (container|network|volume|object)|network .+ not found)') { return }
        throw "Could not check ownership of ${Name}: $($result.Output)"
    }
    $labels = $result.Output | ConvertFrom-Json -AsHashtable
    if (-not $labels -or $labels[$label] -ne $runId) {
        throw "Refusing to remove $Name without this invocation's ownership label."
    }
    $arguments = if ($Kind -eq 'container') { @('container', 'rm', '--force', $Name) } else { @($Kind, 'rm', $Name) }
    [void] (Invoke-Docker -Arguments $arguments -TimeoutSeconds 30)
}

try {
    foreach ($tool in @('docker', 'node')) { [void] (Get-Command $tool -CommandType Application -ErrorAction Stop) }
    $nodeVersion = Invoke-Tool -File 'node' -Arguments @('--version')
    if ([int] ($nodeVersion.Output.TrimStart('v').Split('.')[0]) -lt 22) { throw 'Node.js 22 or later is required on the runner host.' }
    if (-not (Test-Path -LiteralPath $helperScript -PathType Leaf)) { throw "Missing helper: $helperScript" }
    $engine = Invoke-Docker -Arguments @('info', '--format', '{{.OSType}}') -TimeoutSeconds 20
    if ($engine.Output -ne 'linux') { throw 'A Linux Docker engine is required (use Linux containers in Docker Desktop).' }
    $imageInfo = Invoke-Docker -Arguments @('image', 'inspect', '--format', '{{.Id}}', $Image) -AllowFailure
    if ($imageInfo.ExitCode -ne 0) { throw "The emulator image '$Image' must already exist locally. Build or load it before running this script." }
    # Pin the local content, so a concurrently retagged image cannot change this run.
    $emulatorImageId = $imageInfo.Output
    $helperInfo = Invoke-Docker -Arguments @('image', 'inspect', '--format', '{{.Id}}', $HelperImage) -AllowFailure
    if ($helperInfo.ExitCode -ne 0) {
        Write-Host "Pulling test helper $HelperImage (the emulator image is never pulled)."
        [void] (Invoke-Docker -Arguments @('pull', $HelperImage) -TimeoutSeconds 180)
        $helperInfo = Invoke-Docker -Arguments @('image', 'inspect', '--format', '{{.Id}}', $HelperImage)
    }

    Write-Host "Creating isolated Docker validation resources ($runId)."
    $resourcesAttempted.Add([pscustomobject]@{ Kind = 'network'; Name = $network })
    [void] (Invoke-Docker -Arguments @('network', 'create', '--label', "$label=$runId", $network))
    $resourcesAttempted.Add([pscustomobject]@{ Kind = 'volume'; Name = $configurationVolume })
    [void] (Invoke-Docker -Arguments @('volume', 'create', '--label', "$label=$runId", $configurationVolume))
    $resourcesAttempted.Add([pscustomobject]@{ Kind = 'container'; Name = $upstream })
    [void] (Invoke-Docker -Arguments @(
        'create', '--pull=never', '--name', $upstream, '--label', "$label=$runId",
        '--network', $network, '--network-alias', 'upstream', '--publish', '127.0.0.1::8080',
        '--mount', "type=volume,source=$configurationVolume,target=/home/node",
        '--user', 'node', '--cap-drop=ALL', '--security-opt', 'no-new-privileges',
        '--env', "EMULATOR_TEST_ACCESS_KEY=$accessKey", '--entrypoint', 'node',
        $helperInfo.Output, $containerScript, 'serve', $hub
    ))
    [void] (Invoke-Docker -Arguments @('cp', $helperScript, "${upstream}:$containerScript"))
    [void] (Invoke-Docker -Arguments @('start', $upstream))
    $upstreamEndpoint = Get-MappedEndpoint -Container $upstream
    Wait-Endpoint -Uri "$upstreamEndpoint/ready" -Status 200 -Container $upstream

    $resourcesAttempted.Add([pscustomobject]@{ Kind = 'container'; Name = $emulator })
    [void] (Invoke-Docker -Arguments @(
        'create', '--pull=never', '--name', $emulator, '--label', "$label=$runId",
        '--network', $network, '--network-alias', 'emulator', '--publish', '127.0.0.1::8080',
        '--mount', "type=volume,source=$configurationVolume,target=/app,readonly",
        '--env', "WebPubSub__AccessKey=$accessKey",
        $emulatorImageId
    ))
    [void] (Invoke-Docker -Arguments @('start', $emulator))
    $userId = Invoke-Docker -Arguments @('exec', $emulator, 'id', '-u')
    if ($userId.Output -notmatch '^[1-9]\d*$') { throw 'The emulator must run as a non-root user.' }
    $sdks = Invoke-Docker -Arguments @('exec', $emulator, 'dotnet', '--list-sdks')
    if ($sdks.Output) { throw 'The runtime image must not contain a .NET SDK.' }
    $endpoint = Get-MappedEndpoint -Container $emulator
    Wait-Endpoint -Uri "$endpoint/api/hubs/$hub/groups/ready/connections?api-version=2024-01-01" -Status 401 -Container $emulator

    Write-Host "Testing host-to-container at $endpoint."
    $result = Invoke-Tool -File 'node' -Arguments @($helperScript, 'test', $endpoint, $upstreamEndpoint, $hub, 'host') `
        -TimeoutSeconds $TestTimeoutSeconds -Environment @{ EMULATOR_TEST_ACCESS_KEY = $accessKey }
    Write-Host $result.Output
    Write-Host 'Testing container-to-container at http://emulator:8080.'
    $result = Invoke-Docker -Arguments @('exec', $upstream, 'node', $containerScript, 'test',
        'http://emulator:8080', 'http://127.0.0.1:8080', $hub, 'network') -TimeoutSeconds $TestTimeoutSeconds
    Write-Host $result.Output
    Write-Host 'PASS: both network paths verified authentication, REST/group delivery, HTTP upstream roundtrips, and mounted configuration reload.'
}
catch {
    $failed = $true
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
    foreach ($container in @($emulator, $upstream)) {
        try {
            $owned = Invoke-Docker -Arguments @('inspect', '--format', '{{json .Config.Labels}}', $container) -TimeoutSeconds 10 -AllowFailure
            if ($owned.ExitCode -eq 0 -and ($owned.Output | ConvertFrom-Json -AsHashtable)[$label] -eq $runId) {
                Write-Host "--- $container (last 80 log lines) ---"
                $logs = Invoke-Docker -Arguments @('logs', '--tail', '80', $container) -TimeoutSeconds 10 -AllowFailure
                Write-Host $logs.Output.Substring(0, [Math]::Min(16000, $logs.Output.Length))
            }
        }
        catch { Write-Warning "Could not read bounded logs for ${container}: $($_.Exception.Message)" }
    }
}
finally {
    for ($index = $resourcesAttempted.Count - 1; $index -ge 0; $index--) {
        $resource = $resourcesAttempted[$index]
        try { Remove-OwnedResource -Kind $resource.Kind -Name $resource.Name }
        catch { $cleanupFailed = $true; Write-Warning "Cleanup failed for $($resource.Name): $($_.Exception.Message)" }
    }
}
if ($failed -or $cleanupFailed) { exit 1 }
exit 0
