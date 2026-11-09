$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $projectRoot 'Backend'
$frontendPath = Join-Path $projectRoot 'Frontend'
$logPath = Join-Path $env:LOCALAPPDATA 'VertexTechPOS\logs'
$backendLog = Join-Path $logPath 'backend.log'
$backendErrorLog = Join-Path $logPath 'backend-error.log'
$frontendLog = Join-Path $logPath 'frontend.log'
$frontendErrorLog = Join-Path $logPath 'frontend-error.log'
$backendUrl = 'http://localhost:5000/api/health'
$frontendUrl = 'http://localhost:3000'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeRoot = if ($nodeCommand) { Split-Path $nodeCommand.Source }
$npmCliPath = $null
if ($nodeRoot) {
  $npmCliCandidates = @(
    (Join-Path $nodeRoot 'node_modules\npm\bin\npm-cli.js'),
    (Join-Path ${env:ProgramFiles} 'nodejs\node_modules\npm\bin\npm-cli.js')
  )
  $npmCliPath = $npmCliCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
$managedProcesses = @{
  Backend = $null
  Frontend = $null
}

New-Item -ItemType Directory -Path $logPath -Force | Out-Null

function Write-StartupLog {
  param([string]$Message)
  Add-Content -Path (Join-Path $logPath 'startup.log') -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
}

function Test-Endpoint {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
    return [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400
  } catch {
    return $false
  }
}

function Start-AppServer {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string[]]$NpmArguments,
    [string]$StandardOutput,
    [string]$StandardError
  )

  if (-not $npmCliPath) {
    throw 'npm-cli.js was not found under the installed Node.js directories.'
  }

  try {
    $quotedNpmCliPath = '"{0}"' -f $npmCliPath
    $process = Start-Process `
      -FilePath $nodeCommand.Source `
      -ArgumentList (@($quotedNpmCliPath) + $NpmArguments) `
      -WorkingDirectory $WorkingDirectory `
      -WindowStyle Hidden `
      -RedirectStandardOutput $StandardOutput `
      -RedirectStandardError $StandardError `
      -PassThru
    Write-StartupLog "Started $Name server (PID $($process.Id))."
    return $process
  } catch {
    Write-StartupLog "Failed to start $Name server: $($_.Exception.Message)"
    return $null
  }
}

function Wait-ForEndpoint {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Endpoint $Url) {
      Write-StartupLog "$Name is ready at $Url."
      return $true
    }
    Start-Sleep -Seconds 2
  }

  Write-StartupLog "$Name did not become ready at $Url within $TimeoutSeconds seconds."
  return $false
}

if (-not $nodeCommand) {
  Write-StartupLog 'Node.js was not found on PATH; the POS servers cannot start.'
  exit 1
}
if (-not $npmCliPath) {
  Write-StartupLog 'npm-cli.js was not found under the installed Node.js directories; the POS servers cannot start.'
  exit 1
}
if (-not (Test-Path (Join-Path $backendPath '.env'))) {
  Write-StartupLog "Backend .env is missing; API cannot start."
  exit 1
}
if (-not (Test-Path (Join-Path $backendPath 'node_modules'))) {
  Write-StartupLog 'Backend dependencies are missing; run npm install in Backend.'
  exit 1
}
if (-not (Test-Path (Join-Path $frontendPath 'node_modules'))) {
  Write-StartupLog 'Frontend dependencies are missing; run npm install in Frontend.'
  exit 1
}

try {
  $mongo = Get-Service -Name 'MongoDB' -ErrorAction Stop
  if ($mongo.Status -ne 'Running') {
    Start-Service -Name 'MongoDB' -ErrorAction Stop
    Write-StartupLog 'Started the MongoDB Windows service.'
  }
} catch {
  Write-StartupLog "MongoDB Windows service could not be started: $($_.Exception.Message)"
  exit 1
}

if (-not (Test-Endpoint $backendUrl)) {
  $managedProcesses.Backend = Start-AppServer `
    -Name 'Backend' `
    -WorkingDirectory $backendPath `
    -NpmArguments @('start') `
    -StandardOutput $backendLog `
    -StandardError $backendErrorLog
}

if (-not (Test-Endpoint $frontendUrl)) {
  $managedProcesses.Frontend = Start-AppServer `
    -Name 'Frontend' `
    -WorkingDirectory $frontendPath `
    -NpmArguments @('run', 'dev') `
    -StandardOutput $frontendLog `
    -StandardError $frontendErrorLog
}

if (-not (Wait-ForEndpoint -Name 'Backend' -Url $backendUrl)) {
  exit 1
}
if (-not (Wait-ForEndpoint -Name 'Frontend' -Url $frontendUrl)) {
  exit 1
}

try {
  Start-Process $frontendUrl
  Write-StartupLog "Opened $frontendUrl in the default browser."
} catch {
  Write-StartupLog "Could not open the POS in a browser: $($_.Exception.Message)"
  exit 1
}

Write-StartupLog 'POS startup completed.'
