<#
AI Maestro for native Windows (F041): agents in psmux, the native Windows tmux, without WSL.

  irm https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/install.ps1 | iex

or, from a clone:  powershell -ExecutionPolicy Bypass -File install.ps1 [options]

Installs what is missing (Git for Windows, Node.js 24 LTS, Yarn, psmux, jq, and Claude Code if you want it),
clones AI Maestro to ~/ai-maestro, builds it, installs the agent tools (messaging, memory, docs, graph, the
Claude Code hook and the agent CLI) with Git Bash, adds the ai-maestro command, a Start menu entry and the
"AI Maestro" scheduled task, then starts the server and opens the dashboard. Run it again to repair or update.
No administrator rights are needed, except that Git for Windows, when missing, is installed with winget.

Options (or the environment variable in brackets):
  -Dir <path>       where AI Maestro goes (AIM_DIR, default ~/ai-maestro)
  -Branch <name>    the branch to clone (AIM_BRANCH, default main)
  -Port <n>         the dashboard port (AIM_PORT, default 23000); for a machine that also runs AI Maestro in WSL
  -Yes              answer yes to every question
  -LoginItem / -NoLoginItem   start AI Maestro when you log in, or not (asked otherwise; default yes)
  -NoClaude         do not offer to install Claude Code
  -NoStart          install only; do not start the server
  -Force            install even with less than 10 GB free
  -Uninstall        stop AI Maestro and remove the command, the Start menu entry and the scheduled task
                    (your agents' data in ~/.aimaestro and ~/.agent-messaging, and the clone, are kept)

WSL: an AI Maestro inside WSL is a separate install with its own tmux and files. Both can live on one
machine, on different ports: this installer stops if the port is already taken and says so.
#>
param(
  [string]$Dir = $(if ($env:AIM_DIR) { $env:AIM_DIR } else { Join-Path $env:USERPROFILE 'ai-maestro' }),
  [string]$Branch = $(if ($env:AIM_BRANCH) { $env:AIM_BRANCH } else { 'main' }),
  [string]$RepoUrl = $(if ($env:AIM_REPO_URL) { $env:AIM_REPO_URL } else { 'https://github.com/23blocks-OS/ai-maestro.git' }),
  [int]$Port = $(if ($env:AIM_PORT) { [int]$env:AIM_PORT } else { 23000 }),
  [switch]$Yes,
  [switch]$LoginItem,
  [switch]$NoLoginItem,
  [switch]$NoClaude,
  [switch]$NoStart,
  [switch]$Force,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest is many times slower with the progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# Pinned downloads (versions and SHA-256 from the projects' GitHub releases). Node.js is checked against
# the SHASUMS256.txt nodejs.org publishes with each release.
$PSMUX_VERSION = '3.4.0'
$PSMUX_SHA256 = @{
  x64 = 'a66b6be7c13c6fa0dc3660a267b9e34eaa91a4eb7f07fbd55a0468018bd0f721'
  arm64 = 'b123398e3b37408032bc268b4da6e7a6eab5b56461e0c3414914513a57a7a5cf'
}
$JQ_VERSION = '1.8.2'
$JQ_SHA256 = @{
  x64 = 'a6fc67fedaf9128a3309a1e2ebb8b986aeccf70122ee46d2cb4849e423f0c627'
  arm64 = '083b5377392bc57cf27052b6d20a2d927770683bca844632901ff38b4b7b0ac7'
}
$NODE_MAJOR = 24

$Programs = Join-Path $env:LOCALAPPDATA 'Programs'
$LocalBin = Join-Path $env:USERPROFILE '.local\bin'
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
$script:Warnings = @()

function Step($m) { Write-Host ''; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "  [ok] $m" -ForegroundColor Green }
function Info($m) { Write-Host "  $m" }
function Warn($m) { Write-Host "  [!] $m" -ForegroundColor Yellow; $script:Warnings += $m }
function Fail($m) { Write-Host ''; Write-Host "  [x] $m" -ForegroundColor Red; exit 1 }

function Ask($question) {
  if ($Yes) { return $true }
  $a = Read-Host "$question [Y/n]"
  return -not ($a -match '^(n|no)$')
}

# The PATH Windows keeps for this user and the machine, plus what this session already added
function Update-SessionPath {
  $keep = $env:Path -split ';' | Where-Object { $_ }
  $fresh = @([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User')) -join ';' -split ';' | Where-Object { $_ }
  $env:Path = (@($fresh) + @($keep) | Select-Object -Unique) -join ';'
}

# Put a folder first on this user's PATH (and in this session)
function Add-UserPath($dir) {
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @($user -split ';' | Where-Object { $_ -and ($_.TrimEnd('\') -ne $dir.TrimEnd('\')) })
  [Environment]::SetEnvironmentVariable('Path', (@($dir) + $parts) -join ';', 'User')
  $env:Path = (@($dir) + @($env:Path -split ';' | Where-Object { $_ -and ($_.TrimEnd('\') -ne $dir.TrimEnd('\')) })) -join ';'
}

function Get-Verified($url, $sha256, $dest) {
  Info "downloading $url"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $dest
  $got = (Get-FileHash -Algorithm SHA256 $dest).Hash.ToLower()
  if ($got -ne $sha256.ToLower()) { Remove-Item $dest -Force; Fail "checksum mismatch for $url (expected $sha256, got $got)" }
}

function Invoke-Checked($what) {
  if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit $LASTEXITCODE)" }
}

function Get-Major($versionText) {
  if ($versionText -match 'v?(\d+)\.') { return [int]$Matches[1] } else { return 0 }
}

# --- uninstall ------------------------------------------------------------------------------------------
if ($Uninstall) {
  Step 'Removing AI Maestro from this account'
  $launcher = Join-Path $Dir 'scripts\windows\install-launcher.ps1'
  $cli = Join-Path $Dir 'scripts\windows\ai-maestro.ps1'
  if (Test-Path $cli) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $cli stop }
  if (Test-Path $launcher) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher -Remove }
  [Environment]::SetEnvironmentVariable('AIM_PORT', $null, 'User')
  Info "Kept: $Dir, ~/.aimaestro and ~/.agent-messaging (your agents and messages), and the tools (Git, Node.js, psmux, jq)."
  Info "Your agents' psmux sessions are still running; end them with: tmux kill-server"
  exit 0
}

Write-Host 'AI Maestro for Windows' -ForegroundColor Cyan

# --- 1. this machine -----------------------------------------------------------------------------------
Step 'Checking this machine'
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 17763) { Fail "Windows 10 version 1809 or later is needed (ConPTY); this is build $build." }
Ok "Windows build $build ($Arch)"
if ([Security.Principal.WindowsIdentity]::GetCurrent().IsSystem) { Fail 'Run this as yourself, not as SYSTEM.' }

# The port: free, or this account's own AI Maestro (a re-run). Anything else, including an AI Maestro in
# WSL (whose port Windows forwards through wslrelay), would clash.
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  $state = Join-Path $env:USERPROFILE '.aimaestro\service.json'
  $ours = $false
  if (Test-Path $state) { try { $s = Get-Content -Raw $state | ConvertFrom-Json; $ours = ($s.serverPid -eq $listener.OwningProcess) } catch { } }
  if (-not $ours) {
    $who = if ($owner) { $owner.ProcessName } else { "process $($listener.OwningProcess)" }
    $hint = if ($who -match 'wslrelay|wsl|vmmem') { ' That is WSL: an AI Maestro (or another server) inside WSL already uses it.' } else { '' }
    Fail "Port $Port is already in use by $who.$hint Stop it, or install on another port: -Port 23001"
  }
  Ok "port ${Port}: this account's AI Maestro (it is updated in place)"
} else {
  Ok "port $Port is free"
}

# Dependencies, their download cache and the build take about 4 GB; a full disk fails the install halfway
# (Yarn keeps an unpacked copy of every package in its cache: about 7 GB, besides the 2.5 GB installed)
$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Dir)).Substring(0, 1)) -ErrorAction SilentlyContinue
if ($drive -and $drive.Free -lt 10GB -and -not $Force) {
  Fail ("AI Maestro needs about 10 GB free on {0}: (its dependencies, Yarn's download cache and the build); there are {1:N1} GB. Free some space, or run again with -Force if Yarn's cache already has them." -f $drive.Name, ($drive.Free / 1GB))
}
if ($drive) { Ok ("{0:N1} GB free on {1}:" -f ($drive.Free / 1GB), $drive.Name) }

New-Item -ItemType Directory -Force -Path $Programs, $LocalBin | Out-Null
Update-SessionPath

# --- 2. tools ----------------------------------------------------------------------------------------------
Step 'Tools'

# Git for Windows: git, and the bash the agent tools run in (Claude Code on Windows needs it too)
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    Fail 'Git for Windows is needed. Install it from https://git-scm.com/download/win and run this again.'
  }
  if (-not (Ask 'Git for Windows is needed. Install it now with winget?')) { Fail 'Git for Windows is needed.' }
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  Invoke-Checked 'winget install Git.Git'
  Update-SessionPath
}
function Find-GitBash {
  # The bash Claude Code's own Bash tool runs, when one is set; else the Git on PATH's (scripts/windows/git-bash.ps1)
  foreach ($name in 'AIM_BASH', 'CLAUDE_CODE_GIT_BASH_PATH') {
    $v = [Environment]::GetEnvironmentVariable($name)
    if (-not $v) { $v = [Environment]::GetEnvironmentVariable($name, 'User') }
    if ($v -and (Test-Path $v)) { return $v }
  }
  $g = (Get-Command git.exe -ErrorAction Stop).Source
  foreach ($root in @((Split-Path -Parent (Split-Path -Parent $g)), (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $g))), (Join-Path $env:ProgramFiles 'Git'))) {
    $b = Join-Path $root 'bin\bash.exe'
    if (Test-Path $b) { return $b }
  }
  return $null
}
$git = (Get-Command git.exe -ErrorAction Stop).Source
$bash = Find-GitBash
if (-not $bash) { Fail "Git is installed ($git) but its bash.exe was not found. Reinstall Git for Windows." }
Ok "Git: $(& $git --version)"
Ok "Git Bash: $bash"

# Agents sign their messages with Ed25519 (openssl pkeyutl -rawin), which needs OpenSSL 3. Git for Windows
# releases from before 2023 ship OpenSSL 1.1.1: keys are made, but every message would go out unsigned.
$ossl = (& $bash -c 'openssl version' 2>$null | Select-Object -First 1)
if ($ossl -notmatch '^OpenSSL [3-9]\.') {
  if ((Get-Command winget.exe -ErrorAction SilentlyContinue) -and (Ask "Git for Windows comes with $ossl; signing agents' messages needs OpenSSL 3. Update Git for Windows with winget?")) {
    winget upgrade --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    Update-SessionPath
    $bash = Find-GitBash
    $ossl = (& $bash -c 'openssl version' 2>$null | Select-Object -First 1)
  }
  if ($ossl -notmatch '^OpenSSL [3-9]\.') { Warn "Git Bash has ${ossl}: agents' messages will be sent unsigned until Git for Windows is updated (https://git-scm.com/download/win)" }
}
if ($ossl -match '^OpenSSL [3-9]\.') { Ok "OpenSSL for message signing: $ossl" }

# Node.js 22 or later. One Node only: Windows puts the machine PATH before the user's, so a second Node
# added for this user would lose to an installed one in every new terminal. An installed Node that is too
# old is upgraded with winget; with no Node at all, Node.js 24 LTS goes in this user's programs folder.
$nodeOk = $false
if (Get-Command node.exe -ErrorAction SilentlyContinue) {
  $major = Get-Major (& node.exe -v)
  $nodeOk = $major -ge 22
  if (-not $nodeOk) {
    if ((Get-Command winget.exe -ErrorAction SilentlyContinue) -and (Ask "Node.js $(& node.exe -v) is too old (22 or later is needed). Upgrade it with winget?")) {
      winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
      Invoke-Checked 'winget install OpenJS.NodeJS.LTS'
      Update-SessionPath
      $nodeOk = (Get-Major (& node.exe -v)) -ge 22
    }
    if (-not $nodeOk) { Fail "Node.js $(& node.exe -v) at $((Get-Command node.exe).Source) is too old: install Node.js 22 or later (https://nodejs.org) and run this again." }
  }
}
if (-not $nodeOk) {
  $index = Invoke-RestMethod -UseBasicParsing 'https://nodejs.org/dist/index.json'
  $release = $index | Where-Object { $_.version -like "v$NODE_MAJOR.*" } | Select-Object -First 1
  if (-not $release) { Fail "Could not find Node.js $NODE_MAJOR on nodejs.org" }
  $v = $release.version
  $name = "node-$v-win-$Arch"
  $sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$v/SHASUMS256.txt").Content
  $line = ($sums -split "`n") | Where-Object { $_ -match "\s$name\.zip$" } | Select-Object -First 1
  if (-not $line) { Fail "No checksum for $name.zip on nodejs.org" }
  $zip = Join-Path $env:TEMP "$name.zip"
  Get-Verified "https://nodejs.org/dist/$v/$name.zip" ($line -split '\s+')[0] $zip
  Expand-Archive -Force $zip $Programs
  Remove-Item $zip
  Add-UserPath (Join-Path $Programs $name)
  Ok "Node.js $v installed in $(Join-Path $Programs $name)"
} else {
  Ok "Node.js $(& node.exe -v)"
}

if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) {
  & npm.cmd install -g yarn
  Invoke-Checked 'npm install -g yarn'
  Update-SessionPath
  $npmPrefix = (& npm.cmd prefix -g).Trim()
  if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) { Add-UserPath $npmPrefix }
}
Ok "Yarn $(& yarn.cmd --version)"

# psmux: the tmux AI Maestro drives on Windows (psmux.exe, with tmux.exe for tmux's name)
$psmuxDir = Join-Path $Programs 'psmux'
if (-not (Get-Command psmux.exe -ErrorAction SilentlyContinue)) {
  $zip = Join-Path $env:TEMP "psmux-$PSMUX_VERSION.zip"
  Get-Verified "https://github.com/psmux/psmux/releases/download/v$PSMUX_VERSION/psmux-v$PSMUX_VERSION-windows-$Arch.zip" $PSMUX_SHA256[$Arch] $zip
  New-Item -ItemType Directory -Force -Path $psmuxDir | Out-Null
  Expand-Archive -Force $zip $psmuxDir
  Remove-Item $zip
  Add-UserPath $psmuxDir
}
Ok "psmux: $(& psmux.exe -V)"
$tmux = Get-Command tmux.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $tmux -or -not (& $tmux.Source -V 2>$null | Select-String -Quiet 'psmux|3\.')) { Warn "tmux.exe on PATH is not psmux's ($($tmux.Source)); put $psmuxDir first on PATH" }

# jq: the agent tools read and write JSON with it. jq.exe ends its lines with CRLF on Windows and bash keeps
# the CR (values then fail to compare or decode), so the agent tools get ~/.local/bin/jq, a wrapper that runs
# jq.exe with -b (--binary: LF). jq.exe lives in its own folder: next to it, Git Bash would take the wrapper's
# name for jq.exe's, and writing one would overwrite the other.
$jqDir = Join-Path $Programs 'jq'
$strayJq = Join-Path $LocalBin 'jq.exe'
if (Test-Path $strayJq) { New-Item -ItemType Directory -Force -Path $jqDir | Out-Null; Move-Item -Force $strayJq (Join-Path $jqDir 'jq.exe') }
if (-not (Get-Command jq.exe -ErrorAction SilentlyContinue)) {
  New-Item -ItemType Directory -Force -Path $jqDir | Out-Null
  $jqArch = if ($Arch -eq 'arm64') { 'arm64' } else { 'amd64' }
  Get-Verified "https://github.com/jqlang/jq/releases/download/jq-$JQ_VERSION/jq-windows-$jqArch.exe" $JQ_SHA256[$Arch] (Join-Path $jqDir 'jq.exe')
  Add-UserPath $jqDir
}
$jqExe = (Get-Command jq.exe -ErrorAction Stop).Source
Add-UserPath $LocalBin # before jq.exe's folder, so Git Bash finds the wrapper first
# The wrapper also turns off Git Bash's path rewriting for jq. Git Bash rewrites every argument that starts with
# / into a Windows path before it runs a Windows program, so a value such as a base64 signature ("/Vy5...") or a
# message ("/tmp is full") reached jq as "C:/.../Git/Vy5...": one message in about 64 was refused as forged.
# Only arguments that name an existing file or folder are converted, which is all jq needs.
$wrapper = @'
#!/usr/bin/env bash
# AI Maestro (F041): the jq the agent tools run in Git Bash on Windows.
# -b (--binary): jq.exe ends its lines with CRLF and bash keeps the CR.
# MSYS_NO_PATHCONV: Git Bash would rewrite any argument starting with / (a base64 signature, a message) into a
# Windows path; here only arguments naming an existing file or folder are converted.
args=()
for a in "$@"; do
  if [[ $a == /dev/null ]]; then a=nul
  elif [[ $a == /* && -e $a ]]; then
    if [[ $a =~ ^/([a-zA-Z])(/.*)?$ ]]; then a="${BASH_REMATCH[1]^}:${BASH_REMATCH[2]:-/}"; else a=$(cygpath -m "$a"); fi
  fi
  args+=("$a")
done
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' exec "__JQ_EXE__" -b "${args[@]}"
'@
$wrapper = $wrapper.Replace('__JQ_EXE__', ($jqExe -replace '\\', '/')).Replace("`r`n", "`n")
[IO.File]::WriteAllText((Join-Path $LocalBin 'jq'), $wrapper, (New-Object Text.UTF8Encoding $false))
Ok "jq: $(& $jqExe --version) ($jqExe, with the Git Bash wrapper $(Join-Path $LocalBin 'jq'))"
$bashJq = & $bash -c 'command -v jq' 2>$null
if ($bashJq -notmatch '\.local/bin/jq$') { Warn "Git Bash runs the jq at $bashJq, not the wrapper in ${LocalBin}: the agent tools may misread its CRLF output. Put $LocalBin before that folder on PATH." }
$jqProbe = & $bash -c 'jq -rn --arg s /aim/probe \$s' 2>$null
if ($jqProbe -ne '/aim/probe') { Warn "jq in Git Bash changed the value /aim/probe into '$jqProbe': messages whose signature starts with / will be refused. Run this installer again." }

# Claude Code (optional: AI Maestro also runs Codex, Gemini, Copilot and others)
if (-not (Get-Command claude.exe -ErrorAction SilentlyContinue) -and -not $NoClaude) {
  if (Ask 'Install Claude Code (the official installer from claude.ai)?') {
    Invoke-RestMethod -UseBasicParsing 'https://claude.ai/install.ps1' | Invoke-Expression
    Update-SessionPath
  }
}
if (Get-Command claude.exe -ErrorAction SilentlyContinue) { Ok "Claude Code: $(& claude.exe --version)" }
else { Warn 'Claude Code is not installed; install it later from https://claude.ai/download (or any other agent program)' }

# An odd Node release (23, 25) runs AI Maestro, but fails the engine check of its test tools (vitest)
$yarnArgs = @('install', '--frozen-lockfile')
if ((Get-Major (& node.exe -v)) % 2 -eq 1) { $yarnArgs += '--ignore-engines' }

# --- 3. AI Maestro ------------------------------------------------------------------------------------------
Step "AI Maestro in $Dir"
# No CRLF conversion: the bash scripts (here and in the plugin submodule) must keep their LF line endings, and
# Git for Windows converts by default. -c reaches the submodule clones too; the config line keeps it for pulls.
if (Test-Path (Join-Path $Dir '.git')) {
  Info 'already cloned: updating'
  & $git -C $Dir config core.autocrlf false
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dir 'scripts\windows\ai-maestro.ps1') stop 2>$null | Out-Null
  & $git -C $Dir pull --ff-only
  if ($LASTEXITCODE -ne 0) { Warn "git pull did not fast-forward (local changes?); continuing with what is in $Dir" }
  & $git -c core.autocrlf=false -C $Dir submodule update --init --recursive
  Invoke-Checked 'git submodule update'
} else {
  & $git -c core.autocrlf=false clone --branch $Branch --recurse-submodules $RepoUrl $Dir
  Invoke-Checked 'git clone'
  & $git -C $Dir config core.autocrlf false
}
& $git -C $Dir submodule foreach --quiet --recursive 'git config core.autocrlf false'
Push-Location $Dir
try {
  # Files a running server holds open (node-pty) cannot be replaced: it was stopped above
  & yarn.cmd @yarnArgs
  Invoke-Checked 'yarn install'
  Ok 'dependencies installed'

  Step 'Building (a few minutes)'
  & yarn.cmd build
  Invoke-Checked 'yarn build'
  Ok 'built'

  # --- 4. agent tools, in Git Bash ----------------------------------------------------------------------
  Step 'Agent tools'
  $tools = @(
    @('install-plugin.sh', '-y'),
    @('install-memory-tools.sh', '-y'),
    @('install-graph-tools.sh', '-y'),
    @('install-doc-tools.sh', '-y'),
    @('scripts/claude-hooks/install-hooks.sh', '-y'),
    @('install-agent-cli.sh', '-y'),
    @('scripts/install-aim-secret.sh')
  )
  foreach ($t in $tools) {
    if (-not (Test-Path $t[0])) { continue }
    Info "$($t -join ' ')"
    & $bash @t
    if ($LASTEXITCODE -ne 0) { Warn "$($t[0]) reported a problem (exit $LASTEXITCODE); run it again later with: & '$bash' $($t -join ' ')" }
  }
  Ok 'agent tools installed'

  # --- 5. the way in ---------------------------------------------------------------------------------------
  Step 'Launcher'
  if ($Port -ne 23000) { [Environment]::SetEnvironmentVariable('AIM_PORT', "$Port", 'User'); $env:AIM_PORT = "$Port" }
  $launcherArgs = @()
  if ($LoginItem -or ($Yes -and -not $NoLoginItem)) { $launcherArgs += '-LoginItem' } elseif ($NoLoginItem) { $launcherArgs += '-NoLoginItem' }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-launcher.ps1 @launcherArgs
  Invoke-Checked 'install-launcher.ps1'

  Step 'Checking psmux'
  & node.exe scripts\tmux-selfcheck.mjs --no-attach
  if ($LASTEXITCODE -ne 0) { Warn 'the psmux self-check found a problem (above); agents may not work. Report it with that output.' } else { Ok 'psmux passes the self-check' }

  if (-not $NoStart) {
    Step 'Starting AI Maestro'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\ai-maestro.ps1 open
    Invoke-Checked 'ai-maestro open'
  }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'AI Maestro is installed.' -ForegroundColor Green
Info "Dashboard: http://localhost:$Port   (Start menu: AI Maestro)"
Info 'Command:   ai-maestro open | start | stop | restart | status | logs | update   (in a new terminal)'
foreach ($w in $script:Warnings) { Write-Host "  [!] $w" -ForegroundColor Yellow }
