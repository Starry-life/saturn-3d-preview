param(
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not $NoBuild) {
  npm run build
}

$serverLog = Join-Path $projectRoot "server.out.log"
$serverErr = Join-Path $projectRoot "server.err.log"
$serveoLog = Join-Path $projectRoot "serveo.log"
$serveoErr = Join-Path $projectRoot "serveo.err.log"

$listening = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Start-Process -FilePath "node.exe" `
    -ArgumentList "server.js" `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $serverLog `
    -RedirectStandardError $serverErr `
    -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

$oldTunnels = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "ssh.exe" -and $_.CommandLine -match "serveo\.net"
}
foreach ($process in $oldTunnels) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Remove-Item $serveoLog, $serveoErr -ErrorAction SilentlyContinue
Start-Process -FilePath "ssh.exe" `
  -ArgumentList @(
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=NUL",
    "-o", "ServerAliveInterval=60",
    "-R", "80:localhost:3001",
    "serveo.net"
  ) `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $serveoLog `
  -RedirectStandardError $serveoErr `
  -WindowStyle Hidden

Start-Sleep -Seconds 8
$url = Select-String -Path $serveoLog -Pattern "https://\S+" -AllMatches -ErrorAction SilentlyContinue |
  ForEach-Object { $_.Matches.Value } |
  Select-Object -First 1

Write-Host ""
Write-Host "Graduation Star Atlas is running locally at:"
Write-Host "  http://127.0.0.1:3001/"
Write-Host ""
if ($url) {
  Write-Host "Public temporary link:"
  Write-Host "  $url"
  Write-Host ""
  Write-Host "Keep this computer awake. The public link stops working if this PC sleeps, shuts down, or the tunnel closes."
} else {
  Write-Host "Serveo did not return a public URL yet. Check:"
  Write-Host "  $serveoLog"
  Write-Host "  $serveoErr"
}
