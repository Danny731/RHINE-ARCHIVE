$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# This test installs software only on a disposable GitHub runner, never on a
# developer's workstation or the user's active Windows installation.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or !$env:RUNNER_TEMP) {
    throw 'Installer migration tests must run on a disposable Windows CI runner.'
}
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Pagewise'
if (Test-Path -LiteralPath $key) { throw 'An existing installation is present; refusing to modify it.' }
$fixtureRoot = Join-Path $env:RUNNER_TEMP ('rhine-upgrade-' + [guid]::NewGuid().ToString('N'))
$installDir = Join-Path $fixtureRoot 'Installed Reader'
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$oldInstaller = Join-Path $fixtureRoot 'old-setup.exe'
Invoke-WebRequest -Uri 'https://github.com/Danny731/RHINE-ARCHIVE/releases/download/v0.3.0/Pagewise_0.3.0_x64-setup.exe' -OutFile $oldInstaller
$expected = 'b4ebd94967627bc3215eeca85cc0b232bc6d8be8f2c7c3789c4b511672e891ca'
if ((Get-FileHash -LiteralPath $oldInstaller -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Published baseline installer checksum mismatch.' }
$old = Start-Process -FilePath $oldInstaller -ArgumentList "/S /D=$installDir" -WindowStyle Hidden -Wait -PassThru
if ($old.ExitCode -ne 0 -or !(Test-Path -LiteralPath (Join-Path $installDir 'pagewise.exe'))) { throw 'Baseline install failed.' }
$dataDir = Join-Path $env:APPDATA 'com.pagewise.reader'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$dbPath = Join-Path $dataDir 'pagewise.sqlite'
if (Test-Path -LiteralPath $dbPath) { throw 'Unexpected existing library database.' }
$pdf = Join-Path $fixtureRoot 'original.pdf'
Copy-Item -LiteralPath (Join-Path $repoRoot 'public/sample.pdf') -Destination $pdf
$env:RHINE_TEST_DATABASE = $dbPath
$env:RHINE_TEST_PDF = $pdf
$seed = @'
import json, os, sqlite3
pos = {"page": 4, "offset": 0.25, "zoom": 1.2, "rotation": 0}
book = {"id":"legacy-upgrade-fixture", "title":"Legacy library", "path":os.environ["RHINE_TEST_PDF"], "source":"file", "pages":8, "opened":1, "position":pos, "secondary":pos, "mode":"continuous", "split":False, "pageOffset":0, "bookmarks":[{"id":"b1","page":4,"title":"Keep"}], "marks":[{"id":"m1","page":4,"kind":"note","rects":[],"quote":"","note":"Keep this note","created":1}]}
db=sqlite3.connect(os.environ["RHINE_TEST_DATABASE"])
db.execute("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
db.execute("INSERT INTO settings VALUES('library',?)", (json.dumps({"version":1,"books":[book],"dark":False}),))
db.commit()
db.close()
'@
$seedPath = Join-Path $fixtureRoot 'seed.py'
[IO.File]::WriteAllText($seedPath, $seed, (New-Object Text.UTF8Encoding($false)))
python $seedPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot seed synthetic legacy library.' }
$dbHash = (Get-FileHash -LiteralPath $dbPath -Algorithm SHA256).Hash
$pdfHash = (Get-FileHash -LiteralPath $pdf -Algorithm SHA256).Hash
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
$oldLinks = @($desktop, $programs) | ForEach-Object { Join-Path $_ 'Pagewise.lnk' } | Where-Object { Test-Path -LiteralPath $_ }
$candidate = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'src-tauri/target/release/bundle/nsis') -Filter 'RHINE ARCHIVE_*-setup.exe')
if ($candidate.Count -ne 1) { throw 'Expected a single candidate installer.' }
$upgrade = Start-Process -FilePath $candidate[0].FullName -ArgumentList '/S /UPDATE' -WindowStyle Hidden -Wait -PassThru
if ($upgrade.ExitCode -ne 0) { throw 'Upgrade installer failed.' }
$record = Get-ItemProperty -LiteralPath $key
if ($record.DisplayName -ne 'RHINE ARCHIVE' -or $record.MainBinaryName -ne 'RHINE ARCHIVE.exe') { throw 'Upgrade did not replace the registered product.' }
if (!(Test-Path -LiteralPath (Join-Path $installDir 'RHINE ARCHIVE.exe')) -or (Test-Path -LiteralPath (Join-Path $installDir 'pagewise.exe'))) { throw 'Main executable migration failed.' }
if (Test-Path -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\RHINE ARCHIVE') { throw 'Upgrade created a second uninstall record.' }
$shell = New-Object -ComObject WScript.Shell
foreach ($oldLink in $oldLinks) {
    $newLink = Join-Path (Split-Path -Parent $oldLink) 'RHINE ARCHIVE.lnk'
    if ((Test-Path -LiteralPath $oldLink) -or !(Test-Path -LiteralPath $newLink)) { throw 'Shortcut rename failed.' }
    if ($shell.CreateShortcut($newLink).TargetPath -ne (Join-Path $installDir 'RHINE ARCHIVE.exe')) { throw 'Shortcut points to the wrong executable.' }
}
if ((Get-FileHash -LiteralPath $dbPath -Algorithm SHA256).Hash -ne $dbHash -or (Get-FileHash -LiteralPath $pdf -Algorithm SHA256).Hash -ne $pdfHash) { throw 'Upgrade changed the user library or PDF.' }
Write-Output 'PASS: published baseline upgraded in place; executable, registry and shortcuts migrated; library database and PDF bytes preserved.'
