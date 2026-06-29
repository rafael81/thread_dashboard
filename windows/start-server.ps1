param(
  [int]$Port = 3131,
  [int]$ChromePort = 9224,
  [string]$XHandle = "terafabXai"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path "node_modules")) {
  npm install
}

$env:PORT = "$Port"
$env:CHROME_PORT = "$ChromePort"
$env:X_HANDLE = "$XHandle"

Write-Host "Starting Threads discovery dashboard on http://localhost:$Port/discovery"
Write-Host "Chrome debugging port: $ChromePort"
Write-Host "Required X account: @$XHandle"
npm run mirror-server

