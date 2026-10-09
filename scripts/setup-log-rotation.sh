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
# SAFETY (0.60.7). pm2-logrotate rotates by COPYING a file that has passed the cap, every
# 30 seconds, and it applies to every app on the host. On mini-lola a 13 GB log from another
# app was copied again and again until the disk was full and pm2 itself stopped. So the module
# is installed only when no pm2 log is larger than 1 GB and at least 2 GB of disk is free. If
# it is already installed and that is not true, it is removed. Trimming other apps' logs is
# your call: AIM_LOG_ROTATION_TRIM_ALL=1 trims them to their last 5 MB first.
#
# Usage: scripts/setup-log-rotation.sh [app-dir]
# Env:   AIM_LOG_ROTATION=off           skip everything
#        AIM_LOG_ROTATION_TRIM_ALL=1    also trim other pm2 apps' logs past the cap

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

# 1. files already past the cap: AI Maestro's own logs first, so the module never meets them
trim_if_over "$APP_DIR/logs/pm2-out.log" "$PM2_CAP"
trim_if_over "$APP_DIR/logs/pm2-error.log" "$PM2_CAP"
trim_if_over "$APP_DIR/logs/startup.log" "$PM2_CAP"   # installs without pm2
trim_if_over "${HOME:-/nonexistent}/.aimaestro/chat-state/hook-debug.log" "$HOOK_CAP"

# 2. pm2 rotation, only when it is safe
PM2_DIR="${PM2_HOME:-${HOME:-/nonexistent}/.pm2}"
BLOCK_MB="${AIM_PM2_LOG_BLOCK_MB:-1000}"     # a pm2 log this big stops the module from being enabled
MIN_FREE_MB="${AIM_MIN_FREE_MB:-2048}"

# `pm2 jlist` has been seen to hang when the daemon is unhealthy, and macOS has no `timeout`
run_with_timeout() {
    local secs="$1"; shift
    if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"
    elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$secs" "$@"
    elif command -v perl >/dev/null 2>&1; then perl -e 'alarm shift; exec @ARGV' "$secs" "$@"
    else "$@"; fi
}

# every pm2 log file the module would rotate: the daemon log and each app's out/error log,
# wherever the app keeps it (the paths pm2 reports), plus anything under ~/.pm2
big_pm2_logs() {
    {
        find "$PM2_DIR" -maxdepth 2 -type f -name '*.log' 2>/dev/null
        run_with_timeout 15 pm2 jlist 2>/dev/null | node -e '
            let t=""; process.stdin.on("data",d=>t+=d).on("end",()=>{ try {
                for (const a of JSON.parse(t.slice(t.indexOf("[")))) {
                    const e=a.pm2_env||{}; for (const f of [e.pm_out_log_path,e.pm_err_log_path]) if (f) console.log(f);
                } } catch(e){} })' 2>/dev/null
    } | sort -u | while IFS= read -r f; do
        [ -f "$f" ] && [ "$(file_size "$f")" -gt "$((BLOCK_MB * MB))" ] && echo "$f"
    done
}
free_mb() { df -Pk "$PM2_DIR" 2>/dev/null | awk 'NR==2 {print int($4/1024)}'; }

if command -v pm2 >/dev/null 2>&1; then
    if [ "${AIM_LOG_ROTATION_TRIM_ALL:-0}" = "1" ]; then
        while IFS= read -r f; do [ -n "$f" ] && trim_if_over "$f" "$((BLOCK_MB * MB))"; done < <(big_pm2_logs)
    fi
    blockers="$(big_pm2_logs)"
    free="$(free_mb)"
    module_present=false
    run_with_timeout 20 pm2 list 2>/dev/null | grep -q "pm2-logrotate" && module_present=true

    if [ -n "$blockers" ] || [ "${free:-0}" -lt "$MIN_FREE_MB" ]; then
        if [ -n "$blockers" ]; then
            say "NOT enabling pm2 rotation: these pm2 logs are larger than ${BLOCK_MB} MB and the module would copy them again and again:"
            echo "$blockers" | while IFS= read -r f; do say "    $(( $(file_size "$f") / MB )) MB  $f"; done
            say "    Trim them (they are other apps' logs, so this is left to you) with: AIM_LOG_ROTATION_TRIM_ALL=1 scripts/setup-log-rotation.sh"
        fi
        if [ "${free:-0}" -lt "$MIN_FREE_MB" ]; then
            say "NOT enabling pm2 rotation: only ${free:-?} MB of disk is free (needs ${MIN_FREE_MB} MB)"
        fi
        if [ "$module_present" = true ]; then
            pm2 uninstall pm2-logrotate >/dev/null 2>&1 && say "removed the pm2-logrotate module because it is not safe on this host right now"
        fi
    else
        if [ "$module_present" = false ]; then
            if pm2 install pm2-logrotate >/dev/null 2>&1; then
                say "installed the pm2-logrotate module"
            else
                say "WARNING: could not install pm2-logrotate (offline?). Install it later with: pm2 install pm2-logrotate"
            fi
        fi
        if pm2 list 2>/dev/null | grep -q "pm2-logrotate"; then
            # `pm2 conf <key>` prints nothing useful (it echoes "[object Object]"), so read the
            # stored settings from pm2's own file. Each `pm2 set` restarts the module, so only
            # set what differs: a rerun then changes nothing.
            PM2_CONF_FILE="$PM2_DIR/module_conf.json"
            want_set() {   # key value
                local have
                have="$(node -e 'try{const c=require(process.argv[1])["pm2-logrotate"]||{};process.stdout.write(String(c[process.argv[2]]??""))}catch(e){}' "$PM2_CONF_FILE" "$1" 2>/dev/null)"
                [ "$have" = "$2" ] || pm2 set "pm2-logrotate:$1" "$2" >/dev/null 2>&1
            }
            want_set max_size 50M
            want_set retain 2
            want_set compress false
            say "pm2 logs rotate at 50 MB, 2 files kept"
        fi
    fi
else
    say "pm2 not found, nothing to configure for pm2 logs"
fi
exit 0
