param(
  [string]$InstallDir = "",
  [string]$PackagePath = "",
  [string]$ManifestUrl = "",
  [switch]$NoRestart,
  [switch]$Force,
  [switch]$KeepWindow
)

$ErrorActionPreference = "Stop"

$ProductName = "Sugaryfish$([char]0x7684)$([char]0x5F39)$([char]0x5E55)$([char]0x59EC)"
$ProductExeName = "$ProductName.exe"
$RepoOwner = "Sugaryf1sh"
$RepoName = "sugaryfish-danmaku-hime"
$RootDir = Split-Path -Parent $PSScriptRoot
$LocalManifestPath = Join-Path $RootDir "updates\latest.json"
$BridgeDir = Join-Path $env:TEMP "sugaryfish-danmaku-bridge"
$LogPath = Join-Path $BridgeDir ("bridge-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
$StageDir = $null
$BackupDir = $null
$MovedOldApp = $false
$UpdateSucceeded = $false

function Write-BridgeLog {
  param(
    [string]$Message,
    [string]$Level = "INFO"
  )
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "HH:mm:ss"), $Level, $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  switch ($Level) {
    "OK" { Write-Host $line -ForegroundColor Green }
    "WARN" { Write-Host $line -ForegroundColor Yellow }
    "ERROR" { Write-Host $line -ForegroundColor Red }
    "STEP" { Write-Host ""; Write-Host $line -ForegroundColor Cyan }
    default { Write-Host $line }
  }
}

function Exit-Bridge {
  param([int]$Code)
  Write-Host ""
  Write-Host "Log file: $LogPath" -ForegroundColor DarkGray
  if ($KeepWindow) {
    Write-Host ""
    Write-Host "Press any key to close..." -ForegroundColor DarkGray
    try {
      [void][System.Console]::ReadKey($true)
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  exit $Code
}

function Normalize-Version {
  param([string]$Value)
  return ([string]$Value).Trim().TrimStart("v", "V")
}

function Version-ToParts {
  param([string]$Value)
  $parts = @()
  foreach ($part in (Normalize-Version $Value).Split(".")) {
    $digits = ([string]$part) -replace "[^\d].*$", ""
    if ($digits) { $parts += [int]$digits } else { $parts += 0 }
  }
  return $parts
}

function Compare-VersionGreater {
  param(
    [string]$Next,
    [string]$Current
  )
  $nextParts = @(Version-ToParts $Next)
  $currentParts = @(Version-ToParts $Current)
  $length = [Math]::Max($nextParts.Count, $currentParts.Count)
  for ($i = 0; $i -lt $length; $i++) {
    $a = if ($i -lt $nextParts.Count) { $nextParts[$i] } else { 0 }
    $b = if ($i -lt $currentParts.Count) { $currentParts[$i] } else { 0 }
    if ($a -gt $b) { return $true }
    if ($a -lt $b) { return $false }
  }
  return $false
}

function Read-PackageVersion {
  param([string]$AppDir)
  $packageJson = Join-Path $AppDir "package.json"
  if (!(Test-Path -LiteralPath $packageJson)) {
    throw "package.json not found: $packageJson"
  }
  $data = Get-Content -LiteralPath $packageJson -Raw -Encoding UTF8 | ConvertFrom-Json
  return [string]$data.version
}

function Assert-FileContains {
  param(
    [string]$FilePath,
    [string[]]$Needles,
    [string]$Label
  )
  if (!(Test-Path -LiteralPath $FilePath)) {
    throw "$Label file not found: $FilePath"
  }
  $content = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)
  foreach ($needle in $Needles) {
    if ($content.IndexOf($needle, [System.StringComparison]::Ordinal) -lt 0) {
      throw "$Label self-check failed. Missing marker: $needle"
    }
  }
}

function Assert-AppUpdateCapability {
  param(
    [string]$AppDir,
    [string]$ExpectedVersion
  )
  $installedVersion = Read-PackageVersion -AppDir $AppDir
  if ((Normalize-Version $installedVersion) -ne (Normalize-Version $ExpectedVersion)) {
    throw "Version self-check failed. Installed=$installedVersion, expected=$ExpectedVersion."
  }

  Assert-FileContains -FilePath (Join-Path $AppDir "src\main\main.js") -Label "main updater" -Needles @(
    "app:get-info",
    "downloadFileWithFallback",
    "buildDownloadCandidates",
    "applyUpdateProxyFromEnvironment",
    "notifyUpdateStatus({ state: `"downloading`"",
    "Write-UpdateResult `"failed`"",
    "sugaryfish-update-error.log",
    "pending-update-notes.json"
  )

  Assert-FileContains -FilePath (Join-Path $AppDir "src\preload\preload.js") -Label "preload update bridge" -Needles @(
    "getAppInfo",
    "consumeUpdateNotes",
    "onUpdateStatus",
    "update:status"
  )

  Assert-FileContains -FilePath (Join-Path $AppDir "src\renderer\index.html") -Label "renderer update banner" -Needles @(
    "updateBanner",
    "updateProgress",
    "updateProgressBar"
  )

  Assert-FileContains -FilePath (Join-Path $AppDir "src\renderer\renderer.js") -Label "renderer update logic" -Needles @(
    "loadAppInfo",
    "handleUpdateStatus",
    "consumeUpdateNotes",
    "UPDATE_LATEST_TEXT",
    "showUpdateBanner",
    "status.state === `"idle`""
  )

  Assert-FileContains -FilePath (Join-Path $AppDir "src\renderer\styles.css") -Label "renderer update styles" -Needles @(
    ".update-banner",
    ".update-progress",
    ".update-progress i",
    ".update-banner.is-error"
  )

  return $installedVersion
}

function Resolve-InstallDir {
  param([string]$InputDir)

  $candidates = New-Object System.Collections.Generic.List[string]
  if ($InputDir) { $candidates.Add($InputDir) }
  if ($env:SUGARYFISH_DANMAKU_INSTALL_DIR) { $candidates.Add($env:SUGARYFISH_DANMAKU_INSTALL_DIR) }
  $candidates.Add((Get-Location).Path)
  $candidates.Add((Split-Path -Parent $RootDir))
  $candidates.Add("E:\danmuji\danmaku-hime")
  $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\danmaku-hime"))
  $candidates.Add((Join-Path $env:LOCALAPPDATA $ProductName))

  $registryRoots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  foreach ($root in $registryRoots) {
    try {
      Get-ItemProperty $root -ErrorAction SilentlyContinue |
        Where-Object { [string]$_.DisplayName -match "Sugaryfish|danmaku" } |
        ForEach-Object {
          if ($_.InstallLocation) { $candidates.Add([string]$_.InstallLocation) }
          if ($_.DisplayIcon) { $candidates.Add((Split-Path -Parent ([string]$_.DisplayIcon.Trim('"')))) }
          if ($_.UninstallString) {
            $uninstall = [string]$_.UninstallString
            if ($uninstall -match '"([^"]+)"') { $candidates.Add((Split-Path -Parent $Matches[1])) }
          }
        }
    } catch {}
  }

  foreach ($candidate in ($candidates | Where-Object { $_ } | Select-Object -Unique)) {
    try {
      $dir = [System.IO.Path]::GetFullPath($candidate)
      $exe = Join-Path $dir $ProductExeName
      $resources = Join-Path $dir "resources"
      $appDir = Join-Path $resources "app"
      if ((Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath $appDir)) {
        return $dir
      }
    } catch {}
  }

  throw "Install directory was not found. Pass -InstallDir `"E:\danmuji\danmaku-hime`"."
}

function Test-DirectoryWritable {
  param([string]$Dir)
  $probe = Join-Path $Dir (".bridge-write-test-" + [guid]::NewGuid().ToString("N"))
  try {
    Set-Content -LiteralPath $probe -Value "ok" -Encoding ASCII
    Remove-Item -LiteralPath $probe -Force
    return $true
  } catch {
    return $false
  }
}

function Get-Sha256File {
  param([string]$FilePath)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($FilePath)
  try {
    $bytes = $sha.ComputeHash($stream)
    return ([System.BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}

function ConvertTo-MirrorCandidates {
  param([string]$Url)
  $items = New-Object System.Collections.Generic.List[string]
  if ($Url) { $items.Add($Url) }
  $prefixes = @(
    "https://gh.llkk.cc/",
    "https://ghfast.top/",
    "https://ghproxy.net/"
  )
  foreach ($prefix in $prefixes) {
    if ($Url -match "github\.com|githubusercontent\.com") {
      $items.Add(($prefix.TrimEnd("/") + "/" + $Url))
    }
  }
  return @($items | Select-Object -Unique)
}

function Download-TextWithFallback {
  param([string[]]$Urls)
  foreach ($url in $Urls) {
    try {
      Write-BridgeLog "Fetch manifest: $url"
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -Headers @{ "User-Agent" = "Sugaryfish-Danmaku-Bridge/1.0" }
      return [string]$response.Content
    } catch {
      Write-BridgeLog "Manifest fetch failed: $($_.Exception.Message)" "WARN"
    }
  }
  throw "All manifest sources failed."
}

function Download-FileWithFallback {
  param(
    [string[]]$Urls,
    [string]$Destination
  )
  foreach ($url in $Urls) {
    try {
      Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
      Write-BridgeLog "Download package: $url"
      Invoke-WebRequest -Uri $url -OutFile $Destination -UseBasicParsing -TimeoutSec 120 -Headers @{ "User-Agent" = "Sugaryfish-Danmaku-Bridge/1.0" }
      if ((Test-Path -LiteralPath $Destination) -and ((Get-Item -LiteralPath $Destination).Length -gt 0)) {
        return $Destination
      }
    } catch {
      Write-BridgeLog "Package download failed: $($_.Exception.Message)" "WARN"
    }
  }
  throw "All package download sources failed."
}

function Load-ReleaseManifest {
  if ((Test-Path -LiteralPath $LocalManifestPath) -and !$ManifestUrl) {
    Write-BridgeLog "Use local manifest: $LocalManifestPath"
    return Get-Content -LiteralPath $LocalManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  }

  $urls = New-Object System.Collections.Generic.List[string]
  if ($ManifestUrl) { $urls.Add($ManifestUrl) }
  if ($env:DANMAKU_UPDATE_MANIFEST_URL) { $urls.Add($env:DANMAKU_UPDATE_MANIFEST_URL) }
  $raw = "https://raw.githubusercontent.com/$RepoOwner/$RepoName/main/updates/latest.json"
  foreach ($candidate in (ConvertTo-MirrorCandidates $raw)) { $urls.Add($candidate) }
  $urls.Add("https://cdn.jsdelivr.net/gh/$RepoOwner/$RepoName@main/updates/latest.json")
  $urls.Add("https://fastly.jsdelivr.net/gh/$RepoOwner/$RepoName@main/updates/latest.json")

  $text = Download-TextWithFallback -Urls @($urls | Select-Object -Unique)
  return $text | ConvertFrom-Json
}

function Resolve-UpdatePackage {
  param($Release)

  if ($PackagePath) {
    $resolved = [System.IO.Path]::GetFullPath($PackagePath)
    if (!(Test-Path -LiteralPath $resolved)) { throw "Package not found: $resolved" }
    Write-BridgeLog "Use specified package: $resolved"
    return $resolved
  }

  $packageName = [string]$Release.package.name
  $localPackage = Join-Path $RootDir ("updates\" + $packageName)
  if ($packageName -and (Test-Path -LiteralPath $localPackage)) {
    Write-BridgeLog "Use local package: $localPackage"
    return $localPackage
  }

  $downloadPath = Join-Path $BridgeDir $packageName
  $urls = ConvertTo-MirrorCandidates ([string]$Release.package.url)
  return Download-FileWithFallback -Urls $urls -Destination $downloadPath
}

function Stop-InstalledApp {
  param([string]$ExePath)
  $resolvedExe = [System.IO.Path]::GetFullPath($ExePath)
  $processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try {
      $_.Path -and ([System.IO.Path]::GetFullPath($_.Path) -ieq $resolvedExe)
    } catch {
      $false
    }
  })

  if (!$processes.Count) {
    Write-BridgeLog "No running app process found."
    return
  }

  Write-BridgeLog "Closing running app process..."
  foreach ($process in $processes) {
    try { [void]$process.CloseMainWindow() } catch {}
  }
  Start-Sleep -Seconds 2
  $processes = @($processes | Where-Object { try { !$_.HasExited } catch { $false } })
  foreach ($process in $processes) {
    Write-BridgeLog "Force stop PID $($process.Id)." "WARN"
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 600
}

function Write-PendingUpdateNotes {
  param($Release)
  try {
    $userData = Join-Path $env:APPDATA $ProductName
    [System.IO.Directory]::CreateDirectory($userData) | Out-Null
    $payload = [ordered]@{
      version = [string]$Release.version
      title = [string]$Release.title
      notes = [string]$Release.notes
      features = @($Release.features)
      releaseUrl = [string]$Release.releaseUrl
      publishedAt = [string]$Release.publishedAt
      shownAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $userData "pending-update-notes.json") -Encoding UTF8
  } catch {
    Write-BridgeLog "Could not write update notes: $($_.Exception.Message)" "WARN"
  }
}

[System.IO.Directory]::CreateDirectory($BridgeDir) | Out-Null
Set-Content -LiteralPath $LogPath -Value "Sugaryfish Danmaku Hime Bridge Fixer" -Encoding UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
  Write-Host "Sugaryfish Danmaku Hime 1.1.3 update bridge" -ForegroundColor Cyan
  Write-Host "This tool replaces resources/app directly and bypasses the old 1.1.3 updater." -ForegroundColor DarkGray

  Write-BridgeLog "Resolve install directory" "STEP"
  $resolvedInstallDir = Resolve-InstallDir -InputDir $InstallDir
  $resourcesDir = Join-Path $resolvedInstallDir "resources"
  $targetAppDir = Join-Path $resourcesDir "app"
  $exePath = Join-Path $resolvedInstallDir $ProductExeName
  Write-BridgeLog "Install dir: $resolvedInstallDir" "OK"

  if (!(Test-Path -LiteralPath $targetAppDir)) { throw "resources\app not found: $targetAppDir" }
  if (!(Test-Path -LiteralPath $exePath)) { throw "App exe not found: $exePath" }
  if (!(Test-DirectoryWritable -Dir $resourcesDir)) {
    throw "Install directory is not writable. Run this fixer as administrator."
  }

  $currentVersion = Read-PackageVersion -AppDir $targetAppDir
  Write-BridgeLog "Current version: $currentVersion"

  Write-BridgeLog "Load latest release manifest" "STEP"
  $release = Load-ReleaseManifest
  $latestVersion = Normalize-Version ([string]$release.version)
  if (!$latestVersion) { throw "Manifest has no version field." }
  if (!$release.package -or !$release.package.sha256) { throw "Manifest has no package or sha256 field." }
  Write-BridgeLog "Target version: $latestVersion" "OK"

  if (!$Force -and !(Compare-VersionGreater -Next $latestVersion -Current $currentVersion)) {
    Write-BridgeLog "Already up to date. Use -Force to reinstall app resources." "OK"
    Exit-Bridge 0
  }

  Write-BridgeLog "Prepare update package" "STEP"
  $resolvedPackage = Resolve-UpdatePackage -Release $release
  $expectedSha = ([string]$release.package.sha256).Trim().ToLowerInvariant()
  $actualSha = Get-Sha256File -FilePath $resolvedPackage
  Write-BridgeLog "SHA256: $actualSha"
  if ($actualSha -ne $expectedSha) {
    throw "SHA256 mismatch. Expected $expectedSha, got $actualSha."
  }
  Write-BridgeLog "Package hash verified." "OK"

  Write-BridgeLog "Extract and verify package structure" "STEP"
  $StageDir = Join-Path $BridgeDir ("stage-" + [guid]::NewGuid().ToString("N"))
  [System.IO.Directory]::CreateDirectory($StageDir) | Out-Null
  Expand-Archive -LiteralPath $resolvedPackage -DestinationPath $StageDir -Force
  $sourceAppDir = Join-Path $StageDir "app"
  if (!(Test-Path -LiteralPath (Join-Path $sourceAppDir "package.json"))) {
    $sourceAppDir = $StageDir
  }
  $packageVersion = Assert-AppUpdateCapability -AppDir $sourceAppDir -ExpectedVersion $latestVersion
  Write-BridgeLog "Package version verified: $packageVersion" "OK"
  Write-BridgeLog "Package update capability self-check passed." "OK"

  Write-BridgeLog "Close app and replace resources" "STEP"
  Stop-InstalledApp -ExePath $exePath
  $BackupDir = Join-Path $resourcesDir ("app.backup.bridge." + (Get-Date -Format "yyyyMMddHHmmss"))
  Move-Item -LiteralPath $targetAppDir -Destination $BackupDir -Force
  $MovedOldApp = $true
  Move-Item -LiteralPath $sourceAppDir -Destination $targetAppDir -Force
  Write-BridgeLog "Backup created: $BackupDir"

  $installedVersion = Assert-AppUpdateCapability -AppDir $targetAppDir -ExpectedVersion $latestVersion
  Write-PendingUpdateNotes -Release $release
  $UpdateSucceeded = $true
  Write-BridgeLog "Bridge repair succeeded. Installed version: $installedVersion." "OK"
  Write-BridgeLog "Installed app update capability self-check passed." "OK"

  if (!$NoRestart) {
    Write-BridgeLog "Starting updated app..."
    Start-Process -FilePath $exePath -WorkingDirectory $resolvedInstallDir
  } else {
    Write-BridgeLog "NoRestart is set; app start skipped."
  }

  Exit-Bridge 0
} catch {
  Write-BridgeLog $_.Exception.Message "ERROR"
  if (!$UpdateSucceeded -and $MovedOldApp -and $BackupDir -and (Test-Path -LiteralPath $BackupDir)) {
    try {
      Write-BridgeLog "Rollback old resources..." "WARN"
      Remove-Item -LiteralPath $targetAppDir -Recurse -Force -ErrorAction SilentlyContinue
      Move-Item -LiteralPath $BackupDir -Destination $targetAppDir -Force
      Write-BridgeLog "Rollback completed." "OK"
    } catch {
      Write-BridgeLog "Rollback failed: $($_.Exception.Message)" "ERROR"
    }
  }
  Exit-Bridge 1
} finally {
  if ($StageDir -and (Test-Path -LiteralPath $StageDir)) {
    Remove-Item -LiteralPath $StageDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
