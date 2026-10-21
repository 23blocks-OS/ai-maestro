#!/usr/bin/env bash
# Is there enough memory to build AI Maestro here?
#
# `yarn build` (Next.js type check and bundle) peaks at about 1.5 GB of anonymous memory plus page
# cache. On a Linux machine with 2 GB and no swap the kernel kills it ("Killed", exit 137) with no
# hint about memory (measured on Ubuntu 22.04: docs/LINUX-DEPLOYMENT.md). With 2 GB plus swap it builds.
#
# Exit 0: enough (or unknown, or skipped). Exit 1: too little RAM + swap to build; the message says
# what to do. Nothing here changes the machine: the remedy is printed, never run.
#
# Usage:  scripts/check-build-memory.sh            check and explain
#         AIMAESTRO_SKIP_MEMORY_CHECK=1 ...        skip (you know the build will fit)
#         scripts/check-build-memory.sh --print-mb print "<ram_mb> <swap_mb>" and exit 0
#
# Test hooks: AIMAESTRO_PROC_DIR (default /proc), AIMAESTRO_CGROUP_DIR (default /sys/fs/cgroup)
# and AIMAESTRO_OS (default `uname -s`).

set -u

MIN_TOTAL_MB="${AIMAESTRO_BUILD_MIN_MB:-2560}"   # RAM + swap below this: the build is killed
OK_TOTAL_MB=3500                                 # at or above this: nothing to say
PROC="${AIMAESTRO_PROC_DIR:-/proc}"
CGROUP="${AIMAESTRO_CGROUP_DIR:-/sys/fs/cgroup}"

# Read a cgroup limit in bytes; empty when there is none ("max", missing, or absurdly large)
cg_limit_mb() {
    local f="$1" v
    [ -r "$f" ] || return 0
    v=$(tr -d '[:space:]' < "$f" 2>/dev/null)
    case "$v" in ''|max|*[!0-9]*) return 0 ;; esac
    # cgroup v1 reports a huge number for "no limit"
    [ "${#v}" -gt 13 ] && return 0
    echo $(( v / 1024 / 1024 ))
}

detect_linux() {
    local ram_kb swap_kb ram_mb swap_mb lim slim
    ram_kb=$(awk '/^MemTotal:/ {print $2}' "$PROC/meminfo" 2>/dev/null)
    swap_kb=$(awk '/^SwapTotal:/ {print $2}' "$PROC/meminfo" 2>/dev/null)
    [ -n "$ram_kb" ] || return 1
    ram_mb=$(( ram_kb / 1024 ))
    swap_mb=$(( ${swap_kb:-0} / 1024 ))

    # In a container /proc/meminfo shows the host: the cgroup limit is what the build really gets
    lim=$(cg_limit_mb "$CGROUP/memory.max")
    [ -n "$lim" ] || lim=$(cg_limit_mb "$CGROUP/memory/memory.limit_in_bytes")
    if [ -n "$lim" ] && [ "$lim" -lt "$ram_mb" ]; then
        ram_mb=$lim
        # v2 limits swap on its own; v1 gives memory+swap in one number
        slim=""
        if [ -r "$CGROUP/memory.swap.max" ]; then
            slim=$(tr -d '[:space:]' < "$CGROUP/memory.swap.max")
            case "$slim" in max) ;; ''|*[!0-9]*) slim="" ;; *) slim=$(( slim / 1024 / 1024 )) ;; esac
            [ "$slim" = "max" ] && slim=""
        elif [ -r "$CGROUP/memory/memory.memsw.limit_in_bytes" ]; then
            local msw; msw=$(cg_limit_mb "$CGROUP/memory/memory.memsw.limit_in_bytes")
            [ -n "$msw" ] && slim=$(( msw > lim ? msw - lim : 0 ))
        fi
        if [ -n "$slim" ] && [ "$slim" -lt "$swap_mb" ]; then swap_mb=$slim; fi
    fi
    echo "$ram_mb $swap_mb"
}

detect_macos() {
    local bytes
    bytes=$(sysctl -n hw.memsize 2>/dev/null) || return 1
    echo "$(( bytes / 1024 / 1024 )) 0"
}

if [ "${1:-}" != "--print-mb" ] && [ "${AIMAESTRO_SKIP_MEMORY_CHECK:-}" = "1" ]; then
    exit 0
fi

OS_NAME="${AIMAESTRO_OS:-$(uname -s 2>/dev/null)}"
case "$OS_NAME" in
    Linux)  got=$(detect_linux) || exit 0 ;;
    Darwin) got=$(detect_macos) || exit 0 ;;
    *)      exit 0 ;;
esac
[ "${1:-}" = "--print-mb" ] && { echo "$got"; exit 0; }

ram_mb=${got% *}
swap_mb=${got#* }
total_mb=$(( ram_mb + swap_mb ))
fmt() { awk -v m="$1" 'BEGIN { printf "%.1f GB", m / 1024 }'; }

if [ "$total_mb" -ge "$OK_TOTAL_MB" ]; then
    exit 0
fi

if [ "$OS_NAME" = "Darwin" ]; then
    # A Mac cannot add swap by hand: say it, do not stop
    echo "Warning: this Mac has $(fmt "$ram_mb") of RAM. Building AI Maestro needs about 2.5 GB free; close other apps if the build is killed."
    exit 0
fi

if [ "$total_mb" -ge "$MIN_TOTAL_MB" ]; then
    echo "Warning: $(fmt "$ram_mb") RAM + $(fmt "$swap_mb") swap is tight for building AI Maestro (4 GB is comfortable)."
    echo "         If the build is killed, add swap (commands below) and run it again."
    exit 0
fi

cat <<MSG
Not enough memory to build AI Maestro: $(fmt "$ram_mb") RAM + $(fmt "$swap_mb") swap = $(fmt "$total_mb").
The build (yarn build) needs about 2.5 GB of RAM plus swap; with less, the system kills it and the
install stops with "Killed" (exit 137) and no explanation.

Fix it with ONE of these, then run the installer again:

  1. Add 4 GB of swap (needs sudo; a temporary file, removed with 'sudo swapoff /swapfile && sudo rm /swapfile'):
       sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
     (A container cannot add swap: raise its memory limit instead.)
  2. Use a machine with 4 GB of RAM or more. Once built, AI Maestro itself runs in about 250-400 MB.

If you know better (for example the build is already done), skip this check:
  AIMAESTRO_SKIP_MEMORY_CHECK=1
Details: docs/LINUX-DEPLOYMENT.md
MSG
exit 1
