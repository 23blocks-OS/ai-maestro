<#
ai-maestro: the way back in, on native Windows (F041). The macOS and Linux form is scripts/ai-maestro.sh.

  ai-maestro open      open the dashboard (starts the server if it is down)
  ai-maestro start     make sure the server is running, then return
  ai-maestro stop      stop the server (your agents keep running in psmux)
  ai-maestro restart   stop, then start
  ai-maestro status    say whether it is running, and where
  ai-maestro logs      show the end of the server log and follow it
  ai-maestro update    update AI Maestro (update-aimaestro.sh, in Git Bash)

Environment: AIM_PORT (default 23000), AIM_OPEN_MODE=app|browser (default app: Microsoft Edge in a window of
its own), AIM_WAIT (seconds to wait for the server, default 120).
#>
param([Parameter(Position = 0)][string]$Command = 'open')
$ErrorActionPreference = 'Stop'

$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Port = if ($env:AIM_PORT) { [int]$env:AIM_PORT } else { 23000 }
$Url = "http://localhost:$Port"
$Wait = if ($env:AIM_WAIT) { [int]$env:AIM_WAIT } else { 120 }
$TaskName = 'AI Maestro'
$StateFile = Join-Path $env:USERPROFILE '.aimaestro\service.json'
$LogFile = Join-Path $env:USERPROFILE '.aimaestro\logs\server.log'

function Test-Up {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$Port/api/sessions" | Out-Null; return $true } catch { return $false }
}

function Get-State {
  if (Test-Path $StateFile) { try { return Get-Content -Raw $StateFile | ConvertFrom-Json } catch { } }
  return $null
}

function Start-Server {
  if (Test-Up) { return }
  if (-not (Test-Path (Join-Path $Repo '.next'))) { throw "AI Maestro is not built yet (no .next in $Repo). Run install.ps1 again." }
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  $running = $false
  if ($task) {
    Start-ScheduledTask -TaskName $TaskName
    # The task runs only in a desktop session of this user; from ssh it does not start
    for ($i = 0; $i -lt 10 -and -not $running; $i++) {
      Start-Sleep -Milliseconds 500
      $running = (Get-ScheduledTask -TaskName $TaskName).State -eq 'Running'
    }
  }
  if (-not $running) {
    # No task, or no desktop session: start the service hidden the way the task does. Through WMI, so it
    # outlives an ssh session (Windows' OpenSSH ends the processes a session started when it closes).
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $line = "`"$env:SystemRoot\System32\conhost.exe`" --headless `"$node`" `"$Repo\scripts\windows\service.mjs`""
    $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $line; CurrentDirectory = $Repo }
    if ($r.ReturnValue -ne 0) { throw "could not start the AI Maestro service (Win32_Process.Create returned $($r.ReturnValue))" }
  }
  $waited = 0
  while (-not (Test-Up)) {
    if ($waited -ge $Wait) { throw "AI Maestro did not answer on $Url after $Wait s. Look at: ai-maestro logs" }
    Start-Sleep -Seconds 1
    $waited++
  }
}

function Stop-Server {
  $s = Get-State
  $stopped = $false
  if ($s) {
    foreach ($id in @($s.supervisorPid, $s.serverPid)) {
      if ($id) {
        $p = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; $stopped = $true }
      }
    }
    Remove-Item $StateFile -ErrorAction SilentlyContinue
  }
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task -and $task.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName; $stopped = $true }
  return $stopped
}

function Open-Dashboard {
  $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($env:AIM_OPEN_MODE -ne 'browser' -and $edge) { Start-Process -FilePath $edge -ArgumentList "--app=$Url" }
  else { Start-Process $Url }
}

switch ($Command) {
  'open' { Start-Server; Open-Dashboard }
  'start' { if (Test-Up) { "AI Maestro is already running at $Url" } else { Start-Server; "AI Maestro is running at $Url" } }
  'stop' { if (Stop-Server) { "AI Maestro stopped. Your agents are still running." } else { "AI Maestro is not running." } }
  'restart' { Stop-Server | Out-Null; Start-Sleep -Seconds 1; Start-Server; "AI Maestro is running at $Url" }
  'status' { if (Test-Up) { "AI Maestro is running at $Url" } else { "AI Maestro is not running"; exit 3 } }
  'logs' { if (Test-Path $LogFile) { Get-Content -Tail 100 -Wait $LogFile } else { "No log yet ($LogFile)" } }
  'update' {
    $bash = & (Join-Path $PSScriptRoot 'git-bash.ps1')
    Push-Location $Repo
    try { & $bash ./update-aimaestro.sh -y } finally { Pop-Location }
  }
  { $_ -in @('-h', '--help', 'help') } { Get-Content $PSCommandPath | Select-Object -Skip 1 -First 13 }
  default { Write-Error "ai-maestro: unknown command '$Command' (open, start, stop, restart, status, logs, update)"; exit 1 }
}
