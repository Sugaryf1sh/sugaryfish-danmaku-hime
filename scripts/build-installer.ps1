$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ProductName = "Sugaryfish$([char]0x7684)$([char]0x5F39)$([char]0x5E55)$([char]0x59EC)"
$PortableDir = Join-Path $Root "release\$ProductName-win32-x64"

if (!(Test-Path $PortableDir)) {
  throw "Portable app directory not found: $PortableDir. Run `corepack pnpm run package:win` first."
}

Push-Location $Root
try {
  & corepack pnpm exec electron-builder --win nsis --x64 --prepackaged $PortableDir --publish never
  if ($LASTEXITCODE -ne 0) {
    throw "electron-builder failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
