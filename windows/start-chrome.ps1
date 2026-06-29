param(
  [int]$Port = 9224,
  [string]$UserDataDir = "$env:USERPROFILE\.thread-x-chrome"
)

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  Write-Error "Google Chrome executable was not found. Install Chrome or edit windows/start-chrome.ps1."
  exit 1
}

New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null

Write-Host "Starting Chrome remote debugging on port $Port"
Write-Host "Profile: $UserDataDir"
Start-Process -FilePath $chrome -ArgumentList @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$UserDataDir"
)

