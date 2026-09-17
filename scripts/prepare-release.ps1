$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'release'))
$workRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.tools'))
$repoUrl = 'https://github.com/Danny731/pagewise'
$utf8 = New-Object Text.UTF8Encoding($false)

function Assert-ChildPath([string]$Path, [string]$Root) {
    $absolute = [IO.Path]::GetFullPath($Path)
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $absolute.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the expected directory: $absolute"
    }
    return $absolute
}
function Assert-NoLinks([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked path: $Path" }
    if ($item.PSIsContainer) {
        $links = @(Get-ChildItem -LiteralPath $Path -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
        if ($links.Count -gt 0) { throw "Refusing directory containing links: $Path" }
    }
}
function Get-Sha256([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$package.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a stable semantic version.' }
$tauri = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri/tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($tauri.version -ne $version) { throw 'Package and Tauri versions differ.' }
$exe = Get-Item -LiteralPath (Join-Path $projectRoot 'src-tauri/target/release/pagewise.exe')
if ($exe.VersionInfo.ProductVersion -ne $version) { throw 'Build the current version with npm run package first.' }
$installerName = "Pagewise_${version}_x64-setup.exe"
$installer = Get-Item -LiteralPath (Join-Path $projectRoot "src-tauri/target/release/bundle/nsis/$installerName")
$zipName = "Pagewise-docs-v$version.zip"
$guideName = 'USER_GUIDE.md'
$signatureName = "$installerName.sig"
$signatureFile = Get-Item -LiteralPath (Join-Path $projectRoot "src-tauri/target/release/bundle/nsis/$signatureName")
$manifestFile = Get-Item -LiteralPath (Join-Path $projectRoot 'src-tauri/target/release/bundle/nsis/latest.json')
$manifest = Get-Content -LiteralPath $manifestFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -ne $version) { throw 'Updater manifest version differs. Run npm run package first.' }
if ($manifest.platforms.'windows-x86_64'.signature -ne ([IO.File]::ReadAllText($signatureFile.FullName).Trim())) { throw 'Updater signature differs from manifest.' }
$keep = @('Pagewise.exe', $installerName, $signatureName, 'latest.json', $zipName, $guideName, 'SHA256SUMS.txt')

Assert-ChildPath $releaseRoot $projectRoot | Out-Null
if (Test-Path -LiteralPath $releaseRoot) {
    if ((Get-Item -LiteralPath $releaseRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Release directory must not be a link.' }
}
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and $_.Path.StartsWith($releaseRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
})
if ($running.Count -gt 0) { throw 'Close Pagewise running from release/ before preparing the release. No files have been changed.' }

# Only known build artifacts are removed; unrelated user files are left alone.
$obsolete = @()
if (Test-Path -LiteralPath $releaseRoot) {
    $obsolete = @(Get-ChildItem -LiteralPath $releaseRoot -Force | Where-Object {
        ($_.PSIsContainer -and $_.Name -match '^(?:Pagewise-docs-v|v)\d+\.\d+\.\d+$') -or
        (-not $_.PSIsContainer -and $_.Name -notin $keep -and $_.Name -match '^Pagewise(?:_\d+\.\d+\.\d+_x64-setup\.exe(?:\.sig)?|-docs-v\d+\.\d+\.\d+\.zip)$')
    })
    foreach ($item in $obsolete) {
        Assert-ChildPath $item.FullName $releaseRoot | Out-Null
        Assert-NoLinks $item.FullName
    }
}
if (Test-Path -LiteralPath $workRoot) {
    if ((Get-Item -LiteralPath $workRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '.tools must not be a link.' }
}
$stage = Assert-ChildPath (Join-Path $workRoot ('release-docs-' + [guid]::NewGuid().ToString('N'))) $workRoot
$payload = Join-Path $stage 'documentation'
New-Item -ItemType Directory -Path $payload -Force | Out-Null
try {
    foreach ($name in @('README.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $payload
    }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'docs') -Destination $payload -Recurse
    $iconDir = Join-Path $payload 'src-tauri/icons'
    New-Item -ItemType Directory -Path $iconDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'src-tauri/icons/app.svg') -Destination $iconDir
    # A documentation-only archive points code links to GitHub, while retaining local document/image links.
    foreach ($markdown in Get-ChildItem -LiteralPath $payload -Filter '*.md' -Recurse) {
        $content = [IO.File]::ReadAllText($markdown.FullName)
        $content = [regex]::Replace($content, '\]\((?:\.\./)?((?:src|src-tauri|scripts)/[^)#]+\.(?:tsx?|rs|ps1|mjs|toml|json))(#[^)]*)?\)', {
            param($match)
            '](' + $repoUrl + '/blob/main/' + $match.Groups[1].Value + $match.Groups[2].Value + ')'
        })
        [IO.File]::WriteAllText($markdown.FullName, $content, $utf8)
    }
    $archive = Join-Path $stage $zipName
    Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $archive
    $guide = [IO.File]::ReadAllText((Join-Path $projectRoot 'docs/USER_GUIDE.md')).Replace('](../README.md)', '](' + $repoUrl + '#readme)')
    [IO.File]::WriteAllText((Join-Path $stage $guideName), $guide, $utf8)

    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
    Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $releaseRoot 'Pagewise.exe') -Force
    Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $releaseRoot $installerName) -Force
    Copy-Item -LiteralPath $signatureFile.FullName, $manifestFile.FullName -Destination $releaseRoot -Force
    Copy-Item -LiteralPath $archive, (Join-Path $stage $guideName) -Destination $releaseRoot -Force
    if ((Get-Sha256 $exe.FullName) -ne (Get-Sha256 (Join-Path $releaseRoot 'Pagewise.exe'))) { throw 'Executable copy verification failed.' }

    # Verify every absolute deletion target again immediately before removing it.
    foreach ($item in $obsolete) {
        $target = Assert-ChildPath $item.FullName $releaseRoot
        Assert-NoLinks $target
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    $hashes = foreach ($name in $keep | Where-Object { $_ -ne 'SHA256SUMS.txt' }) {
        $hash = Get-Sha256 (Join-Path $releaseRoot $name)
        $hash + '  ' + $name
    }
    [IO.File]::WriteAllText((Join-Path $releaseRoot 'SHA256SUMS.txt'), ($hashes -join "`n") + "`n", $utf8)
    Write-Output "Prepared Pagewise $version. Removed $($obsolete.Count) obsolete artifacts."
    Get-ChildItem -LiteralPath $releaseRoot | Select-Object Name, Length
} finally {
    $target = Assert-ChildPath $stage $workRoot
    Assert-NoLinks $target
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}
