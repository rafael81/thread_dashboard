param(
  [Parameter(Mandatory = $true)]
  [string]$Archive
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $Archive)) {
  Write-Error "Archive not found: $Archive"
  exit 1
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("thread-dashboard-import-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $temp | Out-Null
Expand-Archive -Path $Archive -DestinationPath $temp -Force

$items = @(
  ".data",
  "mirror-history.json",
  "x-scheduled-slots.json"
)

foreach ($item in $items) {
  $source = Join-Path $temp $item
  if (Test-Path $source) {
    $target = Join-Path $root $item
    if (Test-Path $target) {
      Remove-Item -Recurse -Force $target
    }
    $parent = Split-Path -Parent $target
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Copy-Item -Recurse -Force $source $target
  }
}

Remove-Item -Recurse -Force $temp
Write-Host "Imported runtime state from $Archive"

