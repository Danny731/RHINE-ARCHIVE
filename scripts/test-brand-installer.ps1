$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$compiler = Join-Path $env:LOCALAPPDATA 'tauri/NSIS/makensis.exe'
$utils = Join-Path $projectRoot 'src-tauri/target/release/nsis/x64/utils.nsh'
$generated = Join-Path $projectRoot 'src-tauri/target/release/nsis/x64/installer.nsi'
if (!(Test-Path -LiteralPath $compiler) -or !(Test-Path -LiteralPath $utils)) { throw 'Build the local NSIS installer first.' }
$template = Get-Content -LiteralPath $generated -Raw
foreach ($expected in @(
    '!define PRODUCTNAME "RHINE ARCHIVE"',
    '!define MANUFACTURER "RHINE ARCHIVE"',
    '!define MAINBINARYNAME "RHINE ARCHIVE"',
    '!define BUNDLEID "com.pagewise.reader"',
    '!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pagewise"',
    '!define MANUKEY "Software\pagewise"',
    '!define MANUPRODUCTKEY "${MANUKEY}\Pagewise"'
)) {
    if (!$template.Contains($expected)) { throw "Installer identity mismatch: $expected" }
}
$testRoot = Join-Path $projectRoot ('.tools/brand-shortcuts-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$testExe = Join-Path $testRoot 'shortcut-test.exe'
& $compiler '/V2' "/DTEST_OUTPUT=$testExe" "/DTEST_ROOT=$testRoot" "/DTAURI_UTILS=$utils" (Join-Path $projectRoot 'src-tauri/windows/test-shortcuts.nsi')
if ($LASTEXITCODE -ne 0) { throw 'Shortcut harness did not compile.' }
$process = Start-Process -FilePath $testExe -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw 'Shortcut harness failed.' }
$links = New-Object -ComObject WScript.Shell
function Assert-Target([string]$Relative, [string]$Expected) {
    $path = Join-Path $testRoot $Relative
    if (!(Test-Path -LiteralPath $path)) { throw "Missing test shortcut: $Relative" }
    $target = $links.CreateShortcut($path).TargetPath
    if ($target -ne (Join-Path $testRoot $Expected)) { throw "Wrong target for $Relative" }
}
function Assert-Absent([string]$Relative) {
    if (Test-Path -LiteralPath (Join-Path $testRoot $Relative)) { throw "Unexpected test shortcut: $Relative" }
}
Assert-Target 'fresh/RHINE ARCHIVE.lnk' 'RHINE ARCHIVE.exe'
Assert-Absent 'fresh/Pagewise.lnk'
Assert-Target 'existing/RHINE ARCHIVE.lnk' 'RHINE ARCHIVE.exe'
Assert-Absent 'existing/Pagewise.lnk'
Assert-Target 'unrelated/Pagewise.lnk' 'unrelated.exe'
Assert-Absent 'unrelated/RHINE ARCHIVE.lnk'
Assert-Target 'collision/Pagewise.lnk' 'RHINE ARCHIVE.exe'
Assert-Target 'collision/RHINE ARCHIVE.lnk' 'unrelated.exe'
Write-Output 'PASS: installer display/data identities and all four isolated shortcut migration cases.'
