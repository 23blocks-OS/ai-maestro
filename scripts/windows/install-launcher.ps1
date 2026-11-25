<#
Put a way back into AI Maestro on native Windows (F041). The macOS and Linux form is scripts/install-launcher.sh.

  - the ai-maestro command (ai-maestro.cmd in ~/.local/bin): open, start, stop, restart, status, logs, update
  - an "AI Maestro" entry in the Start menu, with the icon
  - the "AI Maestro" scheduled task that runs the server hidden (scripts/windows/service.mjs); with
    -LoginItem it also starts it when you log in. No administrator rights needed.

Safe to run again; the updater runs it. Remove everything with -Remove.

  -LoginItem      start AI Maestro when you log in
  -NoLoginItem    do not (and remove the login trigger)
  -NoLauncher     only the command and the task, no Start menu entry
  -Remove         remove all of it

With neither login switch: asks when run by a person (default yes), and keeps what is there otherwise
(-NonInteractive, the updater), so an update never turns start-at-login on by surprise.
#>
param([switch]$LoginItem, [switch]$NoLoginItem, [switch]$NoLauncher, [switch]$Remove, [switch]$NonInteractive)
$ErrorActionPreference = 'Stop'

$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Bin = if ($env:AIM_BIN_DIR) { $env:AIM_BIN_DIR } else { Join-Path $env:USERPROFILE '.local\bin' }
$StartMenu = if ($env:AIM_START_MENU_DIR) { $env:AIM_START_MENU_DIR } else { Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs' }
$Shortcut = Join-Path $StartMenu 'AI Maestro.lnk'
$TaskName = 'AI Maestro'
$Icon = Join-Path $Repo 'scripts\launcher\AI-Maestro.ico'

if ($Remove) {
  Remove-Item (Join-Path $Bin 'ai-maestro.cmd'), $Shortcut -ErrorAction SilentlyContinue
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
  'removed the ai-maestro command, the Start menu entry and the scheduled task'
  exit 0
}

# --- the command ----------------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $Bin | Out-Null
$cmd = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Repo\scripts\windows\ai-maestro.ps1`" %*`r`n"
[IO.File]::WriteAllText((Join-Path $Bin 'ai-maestro.cmd'), $cmd, [Text.Encoding]::ASCII)
"installed: $(Join-Path $Bin 'ai-maestro.cmd')"
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($userPath -split ';') -contains $Bin)) {
  [Environment]::SetEnvironmentVariable('Path', (@($Bin) + ($userPath -split ';' | Where-Object { $_ })) -join ';', 'User')
  "added $Bin to your PATH (new terminals see it)"
}

# --- the scheduled task -----------------------------------------------------------------------------
# The Node that runs it is the one found now: a login item starts with the PATH Windows keeps for the user.
$node = (Get-Command node.exe -ErrorAction Stop).Source
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$hadLogin = [bool]($existing -and ($existing.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }))
$login = if ($LoginItem) { $true } elseif ($NoLoginItem) { $false } elseif ($existing) { $hadLogin }
         elseif (-not $NonInteractive -and [Environment]::UserInteractive -and -not $NoLauncher) {
           $a = Read-Host 'Start AI Maestro when you log in? [Y/n]'; -not ($a -match '^(n|no)$')
         } else { $false }

# conhost --headless: no console window for the hidden server
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\conhost.exe" -Argument "--headless `"$node`" `"$Repo\scripts\windows\service.mjs`"" -WorkingDirectory $Repo
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$triggers = @()
if ($login) { $triggers += New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name) }
$task = New-ScheduledTask -Action $action -Settings $settings -Principal $principal -Description 'AI Maestro server (scripts/windows/service.mjs). Start or stop it with the ai-maestro command.'
if ($triggers.Count -gt 0) { $task.Triggers = $triggers }
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
if ($login) { "installed: AI Maestro starts when you log in (scheduled task '$TaskName')" }
else { "installed: scheduled task '$TaskName' (start it with: ai-maestro start)" }

# --- the Start menu entry ---------------------------------------------------------------------------
if (-not $NoLauncher) {
  New-Item -ItemType Directory -Force -Path $StartMenu | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($Shortcut)
  $lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Repo\scripts\windows\ai-maestro.ps1`" open"
  $lnk.WorkingDirectory = $Repo
  $lnk.Description = 'Open the AI Maestro dashboard (starts it if it is not running)'
  if (Test-Path $Icon) { $lnk.IconLocation = "$Icon,0" }
  $lnk.WindowStyle = 7
  $lnk.Save()
  "installed: $Shortcut"
}
