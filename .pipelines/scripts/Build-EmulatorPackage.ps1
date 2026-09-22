[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $OutputDirectory,
    [Parameter(Mandatory)][ValidatePattern('^[1-9]\d*$')][string] $BuildId,
    [switch] $ReleaseVersion,
    [ValidateSet('All', 'Build', 'Pack', 'Validate')][string] $Phase = 'All',
    [switch] $RequireSignature
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-DotNet {
    & dotnet @args
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet $($args[0]) failed with exit code $LASTEXITCODE."
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$emulatorRoot = Join-Path $repoRoot 'tools/emulator'
$solution = Join-Path $emulatorRoot 'Microsoft.Azure.WebPubSub.Emulator.sln'
$project = Join-Path $emulatorRoot 'src/Microsoft.Azure.WebPubSub.Emulator/Microsoft.Azure.WebPubSub.Emulator.csproj'
$config = Join-Path $emulatorRoot 'NuGet.Config'
[xml] $props = Get-Content (Join-Path $emulatorRoot 'version.props') -Raw
$prefix = $props.Project.PropertyGroup.VersionPrefix
$suffix = $props.Project.PropertyGroup.VersionSuffix
$version = if ($suffix) { "$prefix-$suffix" } else { $prefix }
if ($version -notmatch '^\d+\.\d+\.\d+(-beta\.\d+)?$') {
    throw "Unsupported emulator version: $version"
}
if (-not $ReleaseVersion) {
    $version = if ($suffix) { "$version.ci.$BuildId" } else { "$version-ci.$BuildId" }
}

$output = [IO.Path]::GetFullPath($OutputDirectory)
if ($Phase -ne 'Validate') {
    if ((Test-Path $output) -and (Get-ChildItem $output -Force | Select-Object -First 1)) {
        throw "Package output directory must be empty: $output"
    }
    New-Item -ItemType Directory -Force $output | Out-Null
}

Push-Location $emulatorRoot
try {
    if ($Phase -in @('All', 'Build')) {
        Invoke-DotNet restore $solution --configfile $config
        Invoke-DotNet build $solution --configuration Release --no-restore "-p:Version=$version" '-p:ContinuousIntegrationBuild=true'
        Invoke-DotNet test $solution --configuration Release --no-build --no-restore
    }
    if ($Phase -in @('All', 'Pack')) {
        Invoke-DotNet pack $project --configuration Release --no-build --no-restore --output $output "-p:PackageVersion=$version"
    }
}
finally {
    Pop-Location
}
if ($Phase -in @('Build', 'Pack')) { return }

$packages = @(Get-ChildItem $output -Filter '*.nupkg')
if ($packages.Count -ne 1) {
    throw "Expected one emulator package; found $($packages.Count)."
}
$packageId = 'Microsoft.Azure.WebPubSub.Emulator'
$archive = [IO.Compression.ZipFile]::OpenRead($packages[0].FullName)
try {
    $entry = $archive.GetEntry("$packageId.nuspec")
    if ($null -eq $entry) { throw 'The emulator package is missing its nuspec.' }
    $reader = [IO.StreamReader]::new($entry.Open())
    try { [xml] $nuspec = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($nuspec.package.metadata.id -ne $packageId -or $nuspec.package.metadata.version -ne $version) {
        throw 'The packaged ID or version does not match the selected release.'
    }
    foreach ($file in @('README.md', 'CHANGELOG.md', 'SUPPORTED_FEATURES.md', 'microsoft.png')) {
        if ($null -eq $archive.GetEntry($file)) { throw "Missing packaged file: $file" }
    }
}
finally {
    $archive.Dispose()
}
if ($RequireSignature) { Invoke-DotNet nuget verify $packages[0].FullName --all }

$scratch = Join-Path ([IO.Path]::GetTempPath()) "emulator-package-$([guid]::NewGuid())"
New-Item -ItemType Directory $scratch | Out-Null
$process = $null
$client = $null
try {
    $toolDirectory = Join-Path $scratch 'tool'
    # Use only the produced package, never an already-published copy from another feed.
    $localConfig = Join-Path $scratch 'NuGet.Config'
    $escapedOutput = [Security.SecurityElement]::Escape($output)
    Set-Content $localConfig "<configuration><packageSources><clear/><add key=`"package`" value=`"$escapedOutput`"/></packageSources></configuration>"
    Invoke-DotNet tool install $packageId --version $version --tool-path $toolDirectory --configfile $localConfig --no-cache
    $toolName = if ($IsWindows) { 'awps-emulator.exe' } else { 'awps-emulator' }
    $stdout = Join-Path $scratch 'stdout.log'
    $stderr = Join-Path $scratch 'stderr.log'
    $process = Start-Process (Join-Path $toolDirectory $toolName) -ArgumentList '--urls', 'http://127.0.0.1:0' `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    $client = [Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(2)
    $healthy = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($process.HasExited) { break }
        $log = Get-Content $stdout -Raw -ErrorAction SilentlyContinue
        if ($log -match 'Now listening on: (http://127\.0\.0\.1:\d+)') {
            $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Head, "$($Matches[1])/api/health")
            $response = $null
            try {
                $response = $client.SendAsync($request).GetAwaiter().GetResult()
                if ($response.IsSuccessStatusCode) { $healthy = $true; break }
            }
            catch [Net.Http.HttpRequestException] { }
            catch [Threading.Tasks.TaskCanceledException] { }
            finally {
                if ($null -ne $response) { $response.Dispose() }
                $request.Dispose()
            }
        }
        Start-Sleep -Seconds 1
    }
    if (-not $healthy) {
        Get-Content $stdout, $stderr -ErrorAction SilentlyContinue
        throw 'The packaged emulator did not become healthy.'
    }
}
finally {
    if ($null -ne $client) { $client.Dispose() }
    if ($null -ne $process) {
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
        $process.Dispose()
    }
    Remove-Item $scratch -Recurse -Force
}

Write-Host "Validated $packageId $version"
