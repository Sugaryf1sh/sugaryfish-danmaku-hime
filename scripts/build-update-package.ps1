$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$PackageJson = Get-Content -LiteralPath (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
$Version = [string]$PackageJson.version
$ProductName = "Sugaryfish$([char]0x7684)$([char]0x5F39)$([char]0x5E55)$([char]0x59EC)"
$AppDir = Join-Path $Root "release\$ProductName-win32-x64\resources\app"
$UpdatesDir = Join-Path $Root "updates"
$PackageName = "Sugaryfish-Danmaku-Hime-App-$Version.zip"
$PackagePath = Join-Path $UpdatesDir $PackageName
$ManifestPath = Join-Path $UpdatesDir "latest.json"
$NotesPath = Join-Path $Root "RELEASE_NOTES_$Version.md"

if (!(Test-Path -LiteralPath $AppDir)) {
  throw "Portable app directory not found: $AppDir. Run `corepack pnpm run package:win` first."
}

[System.IO.Directory]::CreateDirectory($UpdatesDir) | Out-Null
Remove-Item -LiteralPath $PackagePath -Force -ErrorAction SilentlyContinue

$Stage = Join-Path $env:TEMP ("sugaryfish-update-package-" + [guid]::NewGuid().ToString("N"))
try {
  $StageApp = Join-Path $Stage "app"
  [System.IO.Directory]::CreateDirectory($StageApp) | Out-Null
  Copy-Item -Path (Join-Path $AppDir "*") -Destination $StageApp -Recurse -Force
  Compress-Archive -LiteralPath $StageApp -DestinationPath $PackagePath -CompressionLevel Optimal -Force
} finally {
  Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue
}

$Sha256 = [System.Security.Cryptography.SHA256]::Create()
$Stream = [System.IO.File]::OpenRead($PackagePath)
try {
  $HashBytes = $Sha256.ComputeHash($Stream)
  $Hash = ([System.BitConverter]::ToString($HashBytes) -replace "-", "").ToLowerInvariant()
} finally {
  $Stream.Dispose()
  $Sha256.Dispose()
}
$Notes = ""
$Features = @()
if (Test-Path -LiteralPath $NotesPath) {
  $Notes = [System.IO.File]::ReadAllText($NotesPath, [System.Text.Encoding]::UTF8)
  $Features = [regex]::Split($Notes, "\r?\n") |
    Where-Object { $_ -match '^\s*[-*]\s+' } |
    ForEach-Object { ($_ -replace '^\s*[-*]\s+', '').Trim() } |
    Where-Object { $_ -and ($_ -notmatch '[a-f0-9]{64}') } |
    Select-Object -First 6
}

$Manifest = [ordered]@{
  version = $Version
  tag = "v$Version"
  title = "$ProductName $Version"
  releaseUrl = "https://github.com/Sugaryf1sh/sugaryfish-danmaku-hime/releases/tag/v$Version"
  features = @($Features)
  notes = $Notes.Trim()
  package = [ordered]@{
    type = "app-dir-zip"
    name = $PackageName
    url = "https://raw.githubusercontent.com/Sugaryf1sh/sugaryfish-danmaku-hime/v$Version/updates/$PackageName"
    sha256 = $Hash
  }
}

$ManifestJson = $Manifest | ConvertTo-Json -Depth 6
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($ManifestPath, $ManifestJson, $Utf8NoBom)
Write-Host $PackagePath
Write-Host $Hash
