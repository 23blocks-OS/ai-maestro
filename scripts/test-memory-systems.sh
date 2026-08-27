#!/bin/bash
# Health check for the memory, graph and subconscious subsystems.
#
# These three were reported as "not working" and turned out to be three
# different problems: the data was 8x duplicated, maintenance only ran for
# agents resident in a 10-slot LRU, and the status endpoint STARTED the
# subconscious it claimed to observe. None of that was visible from the UI,
# because nothing distinguished "healthy" from "never ran".
#
# So this checks the things that were actually wrong, not just liveness:
#   - is memory indexed, and does search return results?
#   - is the graph populated?
#   - is the subconscious running, and has it run recently?
#   - are message IDs deterministic (the duplication bug)?
#   - does asking about status change status? (the observer bug)
#
# Usage:
#   ./scripts/test-memory-systems.sh                 # all local agents
#   ./scripts/test-memory-systems.sh <agent-id>
#   BASE=http://100.80.12.6:23000 ./scripts/test-memory-systems.sh

set -uo pipefail
BASE="${BASE:-http://localhost:23000}"
TARGET="${1:-}"
PASS=0; FAIL=0; WARN=0

g() { printf '\033[0;32m%s\033[0m\n' "$1"; }
r() { printf '\033[0;31m%s\033[0m\n' "$1"; }
y() { printf '\033[1;33m%s\033[0m\n' "$1"; }
c() { printf '\033[0;36m%s\033[0m\n' "$1"; }
ok()   { g "  PASS  $1"; PASS=$((PASS+1)); }
no()   { r "  FAIL  $1"; FAIL=$((FAIL+1)); }
warn() { y "  WARN  $1"; WARN=$((WARN+1)); }

command -v jq >/dev/null || { r "jq required"; exit 1; }
curl -sf -m8 "$BASE/api/sessions" >/dev/null || { r "AI Maestro not answering at $BASE"; exit 1; }

c "== memory / graph / subconscious health =="
echo "base: $BASE"

# ── 1. Deterministic message IDs ────────────────────────────────────────────
# The duplication bug: ids contained Math.random(), so :put could never upsert
# and every re-index inserted a copy.
c $'\n[1] message id determinism'
if grep -q "Math.random" lib/rag/ingest.ts 2>/dev/null; then
  no "lib/rag/ingest.ts still uses Math.random() for message ids — re-indexing will duplicate"
else
  ok "message ids are deterministic (no Math.random in ingest)"
fi

# ── 2. Agent inventory ──────────────────────────────────────────────────────
c $'\n[2] agent databases'
DBS=$(find "$HOME/.aimaestro/agents" -maxdepth 2 -name agent.db 2>/dev/null | wc -l | tr -d ' ')
FRESH=$(find "$HOME/.aimaestro/agents" -maxdepth 2 -name agent.db -mtime -7 2>/dev/null | wc -l | tr -d ' ')
echo "  databases: $DBS   written in last 7d: $FRESH"
if [ "$DBS" -gt 0 ] && [ "$FRESH" -eq 0 ]; then
  no "no agent database written in 7 days — maintenance is not running"
elif [ "$DBS" -gt 20 ] && [ "$FRESH" -lt $((DBS / 10)) ]; then
  warn "only $FRESH/$DBS databases touched this week — most agents are never indexed"
else
  ok "$FRESH/$DBS databases indexed recently"
fi

# Largest DB — a multi-GB file suggests duplication that predates the id fix.
BIGGEST=$(find "$HOME/.aimaestro/agents" -maxdepth 2 -name agent.db -exec du -m {} \; 2>/dev/null | sort -rn | head -1)
BIG_MB=$(echo "$BIGGEST" | cut -f1)
if [ -n "${BIG_MB:-}" ] && [ "$BIG_MB" -gt 1000 ]; then
  warn "largest database is ${BIG_MB} MB — run scripts/dedupe-agent-memory.mjs (dry run first)"
else
  ok "largest database ${BIG_MB:-0} MB"
fi

# ── 3. Pick a target agent ──────────────────────────────────────────────────
if [ -z "$TARGET" ]; then
  TARGET=$(curl -s -m8 "$BASE/api/sessions" | jq -r '[(.sessions // .)[] | .agentId] | map(select(. != null))[0] // empty')
fi
[ -z "$TARGET" ] && { r "no agent found"; exit 1; }
c $'\n[3] target agent: '"${TARGET:0:8}"

# ── 4. Memory search actually returns results ───────────────────────────────
c $'\n[4] memory search'
MEM=$(curl -s -m30 "$BASE/api/agents/$TARGET/memory?action=stats" 2>/dev/null)
PROJECTS=$(echo "$MEM" | jq -r '.projects | length' 2>/dev/null || echo 0)
if [ "${PROJECTS:-0}" -gt 0 ]; then
  ok "memory indexed ($PROJECTS project(s))"
else
  warn "no indexed projects for this agent — nothing to search"
fi

if [ -x "$HOME/.local/bin/memory-search.sh" ]; then
  HITS=$(AIM_AGENT_ID="$TARGET" timeout 40 "$HOME/.local/bin/memory-search.sh" "agent" 2>/dev/null | grep -c "Score:" || true)
  if [ "${HITS:-0}" -gt 0 ]; then ok "memory-search returned $HITS result(s)"
  else warn "memory-search returned no results (empty index, or search is broken)"; fi
else
  warn "memory-search.sh not installed (run ./install-plugin.sh)"
fi

# ── 5. Graph populated ──────────────────────────────────────────────────────
c $'\n[5] code graph'
if [ -x "$HOME/.local/bin/graph-find-by-type.sh" ]; then
  GHITS=$(AIM_AGENT_ID="$TARGET" timeout 40 "$HOME/.local/bin/graph-find-by-type.sh" function 2>/dev/null | wc -l | tr -d ' ')
  if [ "${GHITS:-0}" -gt 2 ]; then ok "graph query returned $GHITS line(s)"
  else warn "graph appears empty for this agent — has it been indexed?"; fi
else
  warn "graph-*.sh not installed (run ./install-plugin.sh)"
fi

# ── 6. Subconscious status must not START the subconscious ──────────────────
# Before v0.36.45 the GET called agentRegistry.getAgent(), which loads the
# agent and starts its timers — the monitor created the state it reported, and
# evicted other agents from the 10-slot LRU to do it.
c $'\n[6] subconscious status is an observation, not an action'
S1=$(curl -s -m20 "$BASE/api/agents/$TARGET/subconscious" | jq -r '.isRunning' 2>/dev/null)
sleep 1
S2=$(curl -s -m20 "$BASE/api/agents/$TARGET/subconscious" | jq -r '.isRunning' 2>/dev/null)
echo "  isRunning: first=$S1 second=$S2"
if [ "$S1" = "false" ] && [ "$S2" = "true" ]; then
  no "querying status STARTED the subconscious — the indicator is self-fulfilling"
else
  ok "status query did not change status"
fi

# ── 7. Maintenance can run without residency ────────────────────────────────
c $'\n[7] residency-free maintenance sweep'
SWEEP=$(curl -s -m10 "$BASE/api/memory/sweep" 2>/dev/null | jq -r '.eligible' 2>/dev/null)
if [ -n "${SWEEP:-}" ] && [ "$SWEEP" != "null" ]; then
  ok "sweep endpoint live — $SWEEP agent(s) eligible (not capped by the 10-slot LRU)"
else
  no "sweep endpoint missing — maintenance still depends on agent residency"
fi

echo
if [ "$FAIL" -eq 0 ]; then g "== $PASS passed, $WARN warning(s), 0 failed =="; exit 0
else r "== $PASS passed, $WARN warning(s), $FAIL failed =="; exit 1; fi
