$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$PackageJson = Get-Content -LiteralPath (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
$Version = [string]$PackageJson.version
$ReleaseDate = (Get-Date).ToString("yyyy-MM-dd")
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$ProductName = "Sugaryfish$([char]0x7684)$([char]0x5F39)$([char]0x5E55)$([char]0x59EC)"
$AppDir = Join-Path $Root "release\$ProductName-win32-x64\resources\app"
$UpdatesDir = Join-Path $Root "updates"
$PackageName = "Sugaryfish-Danmaku-Hime-App-$Version.zip"
$PackagePath = Join-Path $UpdatesDir $PackageName
$ManifestPath = Join-Path $UpdatesDir "latest.json"
$NotesPath = Join-Path $Root "RELEASE_NOTES_$Version.md"

function Assert-UpdatePackageMetadata {
  param(
    [string]$ZipPath,
    [string]$ExpectedVersion,
    [string]$ExpectedReleaseDate
  )

  $VerifyStage = Join-Path $env:TEMP ("sugaryfish-update-verify-" + [guid]::NewGuid().ToString("N"))
  try {
    [System.IO.Directory]::CreateDirectory($VerifyStage) | Out-Null
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $VerifyStage -Force

    $PackageFile = Join-Path $VerifyStage "app\package.json"
    if (!(Test-Path -LiteralPath $PackageFile)) {
      throw "Update package is missing app/package.json"
    }

    $Package = Get-Content -LiteralPath $PackageFile -Raw | ConvertFrom-Json
    $ActualVersion = [string]$Package.version
    $ActualReleaseDate = [string]$Package.releaseDate

    if ($ActualVersion -ne $ExpectedVersion) {
      throw "Update package version mismatch: expected $ExpectedVersion, got $ActualVersion"
    }
    if ($ActualReleaseDate -ne $ExpectedReleaseDate) {
      throw "Update package releaseDate mismatch: expected $ExpectedReleaseDate, got $ActualReleaseDate"
    }
  } finally {
    Remove-Item -LiteralPath $VerifyStage -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Assert-ManifestMetadata {
  param(
    [string]$ManifestFile,
    [string]$ExpectedVersion,
    [string]$ExpectedPackageSha256
  )

  try {
    $Manifest = [System.IO.File]::ReadAllText($ManifestFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $ActualVersion = [string]$Manifest.version
    $ActualPackageSha256 = [string]$Manifest.package.sha256
    $ActualTitle = [string]$Manifest.title

    if ($ActualVersion -ne $ExpectedVersion) {
      throw "Manifest version mismatch: expected $ExpectedVersion, got $ActualVersion"
    }
    if ($ActualPackageSha256 -ne $ExpectedPackageSha256) {
      throw "Manifest package sha256 mismatch: expected $ExpectedPackageSha256, got $ActualPackageSha256"
    }
    if (!$ActualTitle.Contains($ProductName)) {
      throw "Manifest title encoding check failed: $ActualTitle"
    }
  } catch {
    throw "Manifest validation failed: $($_.Exception.Message)"
  }
}

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

Assert-UpdatePackageMetadata -ZipPath $PackagePath -ExpectedVersion $Version -ExpectedReleaseDate $ReleaseDate

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
  releaseDate = $ReleaseDate
  publishedAt = $ReleaseDate
  releaseUrl = "https://github.com/Sugaryf1sh/sugaryfish-danmaku-hime/releases/tag/v$Version"
  features = @($Features)
  notes = $Notes.Trim()
  package = [ordered]@{
    type = "app-dir-zip"
    name = $PackageName
    url = "https://github.com/Sugaryf1sh/sugaryfish-danmaku-hime/releases/download/v$Version/$PackageName"
    sha256 = $Hash
  }
}

$ManifestJson = $Manifest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($ManifestPath, $ManifestJson, $Utf8NoBom)
Assert-ManifestMetadata -ManifestFile $ManifestPath -ExpectedVersion $Version -ExpectedPackageSha256 $Hash
Write-Host $PackagePath
Write-Host $Hash
