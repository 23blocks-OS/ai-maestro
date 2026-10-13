#!/bin/bash
# ai-maestro: the way back in. Opens the dashboard, starting the server first if it is not running.
#
#   ai-maestro open      open the dashboard (starts the server if it is down)
#   ai-maestro start     make sure the server is running, then return
#   ai-maestro stop      stop the server (your agents' tmux sessions keep running)
#   ai-maestro status    say whether it is running, and where
#
# Environment: AIM_PORT (default 23000), AIM_OPEN_MODE=app|browser (default app: a window of its own
# when Chrome, Edge, Brave or Chromium is installed), AIM_PM2 (the pm2 program), AIM_WAIT (seconds to
# wait for the server, default 90).
#
# The installer puts a small launcher in ~/.local/bin that sets AIM_REPO to the checkout this lives in.
set -u

REPO="${AIM_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PORT="${AIM_PORT:-23000}"
URL="http://localhost:${PORT}"
PM2="${AIM_PM2:-pm2}"
WAIT="${AIM_WAIT:-90}"
APP="ai-maestro"

# An app or a login item starts with almost no PATH. If pm2 is not on it, look where it usually lives
# (nvm's node versions, Homebrew, /usr/local) and put its directory first, so its own `node` is found too.
if ! command -v "$PM2" >/dev/null 2>&1; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/pm2 /opt/homebrew/bin/pm2 /usr/local/bin/pm2; do
    if [ -x "$candidate" ]; then PM2="$candidate"; PATH="$(dirname "$candidate"):$PATH"; break; fi
  done
fi

say() { printf '%s\n' "$*"; }
die() { printf 'ai-maestro: %s\n' "$*" >&2; exit 1; }

is_up() { curl -s -o /dev/null --max-time 3 "http://127.0.0.1:${PORT}/api/sessions"; }

have_pm2() { command -v "$PM2" >/dev/null 2>&1; }

# Is the pm2 process known (running or stopped)?
pm2_knows() { "$PM2" describe "$APP" >/dev/null 2>&1; }

start_server() {
  if is_up; then return 0; fi
  have_pm2 || die "pm2 is not installed, so I cannot start AI Maestro. Install it with: npm install -g pm2"
  [ -d "$REPO/.next" ] || die "AI Maestro is not built yet (no .next in $REPO). Run ./update-aimaestro.sh -y there first."
  if pm2_knows; then
    "$PM2" restart "$APP" >/dev/null 2>&1 || "$PM2" start "$APP" >/dev/null 2>&1 || die "pm2 could not start $APP"
  else
    (cd "$REPO" && "$PM2" start ecosystem.config.js --only "$APP" >/dev/null 2>&1) || die "pm2 could not start $APP from $REPO/ecosystem.config.js"
  fi
  local waited=0
  while ! is_up; do
    [ "$waited" -ge "$WAIT" ] && die "AI Maestro did not answer on $URL after ${WAIT}s. Look at: pm2 logs $APP"
    sleep 1
    waited=$((waited + 1))
  done
}

# Prints the command to open $URL in a window of its own, or nothing if no such browser is installed.
app_window_browser() {
  case "${AIM_OS:-$(uname -s)}" in
    Darwin)
      local b
      for b in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
        if [ -d "/Applications/$b.app" ] || [ -d "$HOME/Applications/$b.app" ]; then printf '%s' "$b"; return 0; fi
      done ;;
    *)
      local c
      for c in google-chrome google-chrome-stable microsoft-edge brave-browser chromium chromium-browser; do
        if command -v "$c" >/dev/null 2>&1; then printf '%s' "$c"; return 0; fi
      done ;;
  esac
  return 1
}

open_dashboard() {
  local browser=""
  if [ "${AIM_OPEN_MODE:-app}" = "app" ]; then browser="$(app_window_browser || true)"; fi
  case "${AIM_OS:-$(uname -s)}" in
    Darwin)
      if [ -n "$browser" ]; then open -na "$browser" --args "--app=$URL" ; else open "$URL"; fi ;;
    *)
      if [ -n "$browser" ]; then ("$browser" "--app=$URL" >/dev/null 2>&1 &)
      elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
      else say "Open $URL in your browser."; fi ;;
  esac
}

cmd="${1:-open}"
case "$cmd" in
  open)
    start_server
    open_dashboard ;;
  start)
    if is_up; then say "AI Maestro is already running at $URL"; else start_server; say "AI Maestro is running at $URL"; fi ;;
  stop)
    have_pm2 || die "pm2 is not installed"
    if pm2_knows; then "$PM2" stop "$APP" >/dev/null 2>&1 && say "AI Maestro stopped. Your agents' tmux sessions are still running." || die "pm2 could not stop $APP"
    else say "AI Maestro is not managed by pm2 here; nothing to stop."; fi ;;
  status)
    if is_up; then say "AI Maestro is running at $URL"; else say "AI Maestro is not running"; exit 3; fi ;;
  -h|--help|help)
    sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
  *)
    die "unknown command '$cmd' (open, start, stop, status)" ;;
esac
