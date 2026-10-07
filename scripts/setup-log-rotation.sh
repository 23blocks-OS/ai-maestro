#!/bin/bash
# AI Maestro - log rotation (B013)
#
# Logs used to grow without a limit: logs/pm2-out.log reached 3.4 GB and the hook's
# debug log 373 MB. This script caps both at 50 MB and is safe to run any number of
# times. The updater and the installer both call it; it never fails the caller.
#
#   pm2 logs   pm2-logrotate module: rotate at 50 MB, keep 2 files. The module applies
#              to every app that pm2 runs on this host.
#   old logs   one-time trim of files already past the cap, keeping the last 5 MB, so
#              the first rotation does not carry gigabytes along.
#   hook log   ~/.aimaestro/chat-state/hook-debug.log rotates itself (25 MB + 25 MB);
#              it is only trimmed here if it is already past 25 MB.
#
# Usage: scripts/setup-log-rotation.sh [app-dir]
# Env:   AIM_LOG_ROTATION=off  skip everything

set -u

[ "${AIM_LOG_ROTATION:-on}" = "off" ] && { echo "  log rotation: skipped (AIM_LOG_ROTATION=off)"; exit 0; }

APP_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MB=$((1024 * 1024))
PM2_CAP=$((50 * MB))
HOOK_CAP=$((25 * MB))
KEEP=$((5 * MB))

say() { echo "  log rotation: $*"; }

file_size() { wc -c < "$1" 2>/dev/null | tr -d ' ' || echo 0; }

# Keep the last $KEEP bytes of $1, starting at a line boundary. Rewritten in place (not
# replaced) so a process that holds the file open in append mode keeps writing to it.
trim_to_tail() {
    local f="$1" tmp
    tmp="$(mktemp "${TMPDIR:-/tmp}/aim-logtrim.XXXXXX")" || return 1
    if tail -c "$KEEP" "$f" 2>/dev/null | sed '1d' > "$tmp" && [ -s "$tmp" ]; then
        cat "$tmp" > "$f"
    fi
    rm -f "$tmp"
}

trim_if_over() {
    local f="$1" cap="$2" size
    [ -f "$f" ] || return 0
    size="$(file_size "$f")"
    [ "${size:-0}" -gt "$cap" ] || return 0
    trim_to_tail "$f"
    say "trimmed $(basename "$f") from $((size / MB)) MB to $(( $(file_size "$f") / MB )) MB (kept the last 5 MB)"
}

# 1. pm2 rotation
if command -v pm2 >/dev/null 2>&1; then
    if ! pm2 list 2>/dev/null | grep -q "pm2-logrotate"; then
        if pm2 install pm2-logrotate >/dev/null 2>&1; then
            say "installed the pm2-logrotate module"
        else
            say "WARNING: could not install pm2-logrotate (offline?). Install it later with: pm2 install pm2-logrotate"
        fi
    fi
    if pm2 list 2>/dev/null | grep -q "pm2-logrotate"; then
        want_set() {   # key value: set only when it differs, so reruns do not restart the module
            local have
            have="$(pm2 conf "pm2-logrotate:$1" 2>/dev/null | tail -1 | tr -d ' ')"
            [ "$have" = "$2" ] || pm2 set "pm2-logrotate:$1" "$2" >/dev/null 2>&1
        }
        want_set max_size 50M
        want_set retain 2
        want_set compress false
        say "pm2 logs rotate at 50 MB, 2 files kept"
    fi
else
    say "pm2 not found, nothing to configure for pm2 logs"
fi

# 2. files already past the cap
trim_if_over "$APP_DIR/logs/pm2-out.log" "$PM2_CAP"
trim_if_over "$APP_DIR/logs/pm2-error.log" "$PM2_CAP"
trim_if_over "$APP_DIR/logs/startup.log" "$PM2_CAP"   # installs without pm2
trim_if_over "${HOME:-/nonexistent}/.aimaestro/chat-state/hook-debug.log" "$HOOK_CAP"
exit 0
