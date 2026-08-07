#!/bin/bash
# Single source of truth for the AI Maestro Claude Code hook.
#
# The hook exists in three places that MUST stay byte-identical:
#   1. scripts/claude-hooks/ai-maestro-hook.cjs   <- CANONICAL (edit here)
#        used by install.sh / update-aimaestro.sh (global install) and by
#        services/agents-docker-service.ts (per cloud-agent copy).
#   2. plugin/src/scripts/ai-maestro-hook.cjs     <- plugin builder source
#   3. plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs <- plugin build output
#        (2)+(3) ship in the marketplace plugin, which must build standalone so it
#        carries its own copy.
#
# Historically these drifted into two independent implementations and every fix
# had to be applied twice. Edit ONLY #1, then run this script. A unit test
# (tests/plugin-hook-sync.test.ts) fails if they ever diverge, so CI catches drift.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/scripts/claude-hooks/ai-maestro-hook.cjs"
DESTS=(
  "$ROOT/plugin/src/scripts/ai-maestro-hook.cjs"
  "$ROOT/plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs"
)
[ -f "$SRC" ] || { echo "canonical hook missing: $SRC" >&2; exit 1; }
node --check "$SRC" || { echo "canonical hook has a syntax error; aborting" >&2; exit 1; }
for d in "${DESTS[@]}"; do
  mkdir -p "$(dirname "$d")"
  cp "$SRC" "$d"
  echo "synced -> ${d#$ROOT/}"
done
echo "done. canonical: scripts/claude-hooks/ai-maestro-hook.cjs"
