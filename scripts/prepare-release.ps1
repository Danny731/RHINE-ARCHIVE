param([string]$OutputDirectory = 'release')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
if (!$releaseRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output directory must stay inside the project.' }
if ((Test-Path -LiteralPath $releaseRoot) -and ((Get-Item -LiteralPath $releaseRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Output directory must not be a link.' }
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and $_.Path.StartsWith($releaseRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
})
if ($running.Count -gt 0) { throw 'Close programs running from the output directory before preparing artifacts.' }

$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$package.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a stable semantic version.' }
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri/tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.version -ne $version) { throw 'Package and Tauri versions differ.' }
$binaryName = 'RHINE ARCHIVE.exe'
$installerName = "RHINE ARCHIVE_${version}_x64-setup.exe"
$bundleDir = Join-Path $projectRoot 'src-tauri/target/release/bundle/nsis'
$manifestFile = Join-Path $bundleDir 'latest.json'
$manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
$signature = [IO.File]::ReadAllText((Join-Path $bundleDir "$installerName.sig")).Trim()
$expectedUrl = 'https://github.com/Danny731/RHINE-ARCHIVE/releases/download/v' + $version + '/' + [Uri]::EscapeDataString($installerName)
if ($manifest.version -ne $version -or $manifest.platforms.'windows-x86_64'.signature -ne $signature -or $manifest.platforms.'windows-x86_64'.url -ne $expectedUrl) { throw 'Updater metadata does not match this version. Run npm run package first.' }

# An explicit binary-only allowlist prevents local notes from entering releases.
$sources = [ordered]@{}
$sources[$binaryName] = Join-Path $projectRoot 'src-tauri/target/release/RHINE ARCHIVE.exe'
$sources[$installerName] = Join-Path $bundleDir $installerName
$sources["$installerName.sig"] = Join-Path $bundleDir "$installerName.sig"
$sources['latest.json'] = $manifestFile
foreach ($name in $sources.Keys) {
    if (!(Test-Path -LiteralPath $sources[$name] -PathType Leaf)) { throw "Missing artifact: $name" }
    $destination = Join-Path $releaseRoot $name
    if ((Test-Path -LiteralPath $destination) -and ((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Artifact destination must not be a link.' }
}
$exe = Get-Item -LiteralPath $sources[$binaryName]
if ($exe.VersionInfo.ProductVersion -ne $version -or $exe.VersionInfo.ProductName -ne 'RHINE ARCHIVE') { throw 'Executable version or product name is incorrect.' }
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
$hashLines = foreach ($name in $sources.Keys) {
    $source = $sources[$name]
    $destination = Join-Path $releaseRoot $name
    Copy-Item -LiteralPath $source -Destination $destination -Force
    $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    if ($sourceHash -ne $destinationHash) { throw "Artifact copy verification failed: $name" }
    $destinationHash.ToLowerInvariant() + '  ' + $name
}
[IO.File]::WriteAllText((Join-Path $releaseRoot 'SHA256SUMS.txt'), ($hashLines -join "`n") + "`n", (New-Object Text.UTF8Encoding($false)))
Write-Output "Prepared RHINE ARCHIVE ${version}: executable, installer, signature, update manifest, and checksums. No development documents were packaged."
