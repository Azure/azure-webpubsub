[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $ArtifactDirectory,
    [Parameter(Mandatory)][string] $OciLayout,
    [Parameter(Mandatory)][string] $OrasPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$metadata = Get-Content (Join-Path $ArtifactDirectory 'container-release.json') -Raw | ConvertFrom-Json

# The transport task creates each platform layout separately. Assemble only local
# content here; the standard pipeline task publishes the resulting image index.
foreach ($image in $metadata.images) {
    $architecture = $image.platform.Split('/')[-1]
    $tag = $image.imageReference.Split(':')[-1]
    $source = "${OciLayout}-${architecture}:$tag"
    $json = & $OrasPath manifest fetch --platform "linux/$architecture" --oci-layout $source
    if ($LASTEXITCODE -ne 0) { throw "Could not read the $architecture image manifest." }
    $manifest = $json -join "`n" | ConvertFrom-Json
    if ($manifest.config.digest -cne $image.imageConfigDigest) {
        throw "The $architecture image configuration differs from the tested archive."
    }
    & $OrasPath copy --platform "linux/$architecture" --from-oci-layout $source --to-oci-layout "${OciLayout}:$architecture"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy the tested $architecture image." }
}
& $OrasPath manifest index create --oci-layout "${OciLayout}:$($metadata.version)" amd64 arm64
if ($LASTEXITCODE -ne 0) { throw 'Could not create the multi-platform image index.' }
$json = & $OrasPath manifest fetch --oci-layout "${OciLayout}:$($metadata.version)"
if ($LASTEXITCODE -ne 0) { throw 'Could not read the multi-platform image index.' }
$index = $json -join "`n" | ConvertFrom-Json
$platforms = @($index.manifests | ForEach-Object { "$($_.platform.os)/$($_.platform.architecture)" } | Sort-Object)
if (($platforms -join ',') -cne 'linux/amd64,linux/arm64') {
    throw 'The image index must contain exactly linux/amd64 and linux/arm64.'
}

# ContainerSecurityCopyImage validates the image name on the layout descriptor.
# Annotate index.json, not the content-addressed image index, to keep its digest.
$layoutIndexPath = Join-Path $OciLayout 'index.json'
$layoutIndex = Get-Content $layoutIndexPath -Raw | ConvertFrom-Json -AsHashtable
$descriptor = @($layoutIndex.manifests | Where-Object {
    $_.annotations['org.opencontainers.image.ref.name'] -ceq $metadata.version
})
if ($descriptor.Count -ne 1) { throw 'Expected one release tag descriptor in the OCI layout.' }
$descriptor[0].annotations['io.containerd.image.name'] = "webpubsub-emulator:$($metadata.version)"
$layoutIndex | ConvertTo-Json -Depth 100 | Set-Content $layoutIndexPath -Encoding utf8NoBOM
Write-Host 'Prepared the tested AMD64 and ARM64 image index for publication.'
