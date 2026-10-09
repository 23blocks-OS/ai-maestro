#!/bin/bash
# AI Maestro - clean up what agent-browser leaves behind (B014)
#
# agent-browser (third party) creates a Chrome profile per launch under the OS temp dir and
# removes it only when its daemon exits cleanly. A crashed or killed daemon leaves Chrome
# running and 50-500 MB of profile behind. This script finds those leftovers.
#
#   dirs       agent-browser-chrome-*, agent-browser-profile-*, agent-browser-nss-* directly
#              under the temp dir, older than 2 hours, with no live Chrome using them
#              (SingletonLock pid alive, or any process whose arguments name the dir).
#   processes  Chrome processes started with --user-data-dir=.../agent-browser-chrome-* while
#              NO agent-browser daemon (agent-browser-darwin* / agent-browser-linux*) is
#              running. With any daemon alive, processes are left alone: the daemon's command
#              line does not say which profile it owns.
#
# Idempotent. Default is --dry-run (prints what it would do); --apply does it. Only argv,
# never a shell string, reaches rm and kill.
#
# Usage: scripts/cleanup-agent-browser.sh [--dry-run|--apply]
# Env:   AIM_AB_MIN_AGE_MINUTES  minimum age of a dir, default 120
#        AIM_AB_TMPDIR           directory to scan, default $TMPDIR or /tmp
#        AIM_AB_PS_FILE          read the process list ("pid args" per line) from this file
#                                instead of ps; used by tests, and it disables killing

set -u

MODE="dry-run"
case "${1:-}" in
  ""|--dry-run) MODE="dry-run" ;;
  --apply) MODE="apply" ;;
  *) echo "usage: $0 [--dry-run|--apply]" >&2; exit 2 ;;
esac

MIN_AGE_MIN="${AIM_AB_MIN_AGE_MINUTES:-120}"
case "$MIN_AGE_MIN" in ''|*[!0-9]*) MIN_AGE_MIN=120 ;; esac
TMP_ROOT="${AIM_AB_TMPDIR:-${TMPDIR:-/tmp}}"
TMP_ROOT="${TMP_ROOT%/}"
[ -n "$TMP_ROOT" ] || TMP_ROOT="/"

say() { echo "agent-browser cleanup: $*"; }

if [ -n "${AIM_AB_PS_FILE:-}" ]; then
  PS_LIST="$(cat -- "$AIM_AB_PS_FILE" 2>/dev/null || true)"
  CAN_KILL=0
else
  PS_LIST="$(ps -axo pid=,args= 2>/dev/null || true)"
  CAN_KILL=1
fi

# Is some live process using directory $1 (named in its arguments)?
dir_in_use() {
  printf '%s\n' "$PS_LIST" | grep -F -- "$1" | grep -qv -F -- "cleanup-agent-browser"
}

# Does the SingletonLock of $1 point at a live process?
lock_alive() {
  local lock="$1/SingletonLock" target pid
  [ -L "$lock" ] || return 1
  target="$(readlink "$lock" 2>/dev/null)" || return 1
  pid="${target##*-}"
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s\n' "$PS_LIST" | awk -v p="$pid" '$1 == p { found = 1 } END { exit !found }'
}

freed=0
removed=0
kept=0

if [ -d "$TMP_ROOT" ]; then
  for d in "$TMP_ROOT"/agent-browser-chrome-* "$TMP_ROOT"/agent-browser-profile-* "$TMP_ROOT"/agent-browser-nss-*; do
    [ -e "$d" ] || continue
    [ -d "$d" ] && [ ! -L "$d" ] || continue
    # Younger than the threshold: find prints nothing.
    if [ -z "$(find "$d" -maxdepth 0 -mmin "+$MIN_AGE_MIN" -print 2>/dev/null)" ]; then
      kept=$((kept + 1)); continue
    fi
    if lock_alive "$d" || dir_in_use "$d"; then
      say "keep $d (Chrome still using it)"
      kept=$((kept + 1)); continue
    fi
    kb="$(du -sk "$d" 2>/dev/null | awk '{print $1}')"
    kb="${kb:-0}"
    if [ "$MODE" = "apply" ]; then
      if rm -rf -- "$d"; then
        say "removed $d (${kb} KB)"
        removed=$((removed + 1)); freed=$((freed + kb))
      else
        say "could not remove $d"
      fi
    else
      say "would remove $d (${kb} KB)"
      removed=$((removed + 1)); freed=$((freed + kb))
    fi
  done
fi

# Orphan Chrome: profile in our temp pattern, and no agent-browser daemon anywhere.
daemon_up=0
if printf '%s\n' "$PS_LIST" | grep -E -q -- '(^|[ /])agent-browser-(darwin|linux)'; then daemon_up=1; fi

orphans=0
if [ "$daemon_up" -eq 0 ]; then
  while read -r pid args; do
    [ -n "$pid" ] || continue
    case "$pid" in *[!0-9]*) continue ;; esac
    case "$args" in
      *--user-data-dir=*agent-browser-chrome-*) ;;
      *) continue ;;
    esac
    orphans=$((orphans + 1))
    if [ "$MODE" = "apply" ] && [ "$CAN_KILL" -eq 1 ]; then
      if kill -TERM -- "$pid" 2>/dev/null; then say "sent TERM to orphan Chrome pid $pid"; else say "pid $pid already gone"; fi
    else
      say "would kill orphan Chrome pid $pid"
    fi
  done <<EOF
$PS_LIST
EOF
elif printf '%s\n' "$PS_LIST" | grep -q -- '--user-data-dir=.*agent-browser-chrome-'; then
  say "Chrome processes left alone: an agent-browser daemon is running"
fi

verb="would remove"; [ "$MODE" = "apply" ] && verb="removed"
say "$verb $removed dir(s) (${freed} KB), kept $kept, orphan Chrome processes: $orphans [$MODE]"
exit 0
