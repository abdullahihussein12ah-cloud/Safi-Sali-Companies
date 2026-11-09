$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot 'start-pos-on-login.ps1'
$taskName = 'VertexTechPOS-Autostart'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$mongo = Get-CimInstance -ClassName Win32_Service -Filter "Name='MongoDB'" -ErrorAction SilentlyContinue

if (-not $mongo) {
  throw 'MongoDB Windows service was not found. Install MongoDB as a Windows service before enabling POS autostart.'
}
if ($mongo.StartMode -ne 'Auto') {
  throw "MongoDB startup mode is '$($mongo.StartMode)'. Set the MongoDB service to Automatic before enabling POS autostart."
}
if (-not (Test-Path (Join-Path $projectRoot 'Backend\.env'))) {
  throw "Backend\.env was not found under $projectRoot. Configure the backend before enabling POS autostart."
}
if (-not (Test-Path (Join-Path $projectRoot 'Backend\node_modules'))) {
  throw 'Backend dependencies are missing. Run npm install in Backend first.'
}
if (-not (Test-Path (Join-Path $projectRoot 'Frontend\node_modules'))) {
  throw 'Frontend dependencies are missing. Run npm install in Frontend first.'
}

$powerShellPath = Join-Path $PSHOME 'powershell.exe'
$action = New-ScheduledTaskAction `
  -Execute $powerShellPath `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runnerPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal `
  -UserId $currentUser `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Description 'Starts MongoDB if needed, the Safi Sali Companies POS API and frontend, then opens the local POS after Windows sign-in.' `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started $taskName for $currentUser."
Write-Output "MongoDB startup type: $($mongo.StartMode)."
Write-Output 'The POS browser will open at http://localhost:3000 after the frontend starts. Sign in normally.'
