<#
Prints Git for Windows' bash.exe, the bash AI Maestro's scripts run in (F041), or fails saying what to install.
Never C:\Windows\System32\bash.exe: that one starts WSL. Same order as lib/git-bash.mjs.
#>
$ErrorActionPreference = 'Stop'
$candidates = @($env:AIM_BASH, $env:CLAUDE_CODE_GIT_BASH_PATH)
$git = Get-Command git.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($git) {
  $dir = Split-Path -Parent $git.Source
  $candidates += (Join-Path (Split-Path -Parent $dir) 'bin\bash.exe')
  $candidates += (Join-Path (Split-Path -Parent (Split-Path -Parent $dir)) 'bin\bash.exe')
}
$candidates += @("$env:ProgramFiles\Git\bin\bash.exe", "${env:ProgramFiles(x86)}\Git\bin\bash.exe", "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe")
$system = (Join-Path $env:SystemRoot 'System32').ToLower()
foreach ($c in $candidates) {
  if ($c -and (Test-Path $c) -and -not $c.ToLower().StartsWith($system) -and $c -notmatch '\\WindowsApps\\') { return $c }
}
throw 'Git for Windows is not installed, so the AI Maestro scripts cannot run. Install it from https://git-scm.com/download/win (or: winget install Git.Git).'
