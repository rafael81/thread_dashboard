param(
  [string]$Output = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $Output) {
  $Output = Join-Path $root "thread-dashboard-runtime-$stamp.zip"
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) "thread-dashboard-runtime-$stamp"
if (Test-Path $temp) {
  Remove-Item -Recurse -Force $temp
}
New-Item -ItemType Directory -Force -Path $temp | Out-Null

$items = @(
  ".data",
  "mirror-history.json",
  "x-scheduled-slots.json"
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  if (Test-Path $source) {
    $target = Join-Path $temp $item
    $parent = Split-Path -Parent $target
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Copy-Item -Recurse -Force $source $target
  }
}

if (Test-Path $Output) {
  Remove-Item -Force $Output
}
Compress-Archive -Path (Join-Path $temp "*") -DestinationPath $Output
Remove-Item -Recurse -Force $temp

Write-Host "Exported runtime state to $Output"

