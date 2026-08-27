#!/bin/bash
# Test the message wake path end-to-end against a running AI Maestro.
#
# Unit tests cover the logic; this proves the thing that actually matters:
# send a real AMP message to a real agent and check whether anything could
# PROVE the agent saw it. That is the question the whole wake subsystem exists
# to answer, and the one that used to be unanswerable.
#
# Usage:
#   ./scripts/test-message-wake.sh                 # auto-pick first online agent
#   ./scripts/test-message-wake.sh <agent-name>
#   BASE=http://100.80.12.6:23000 ./scripts/test-message-wake.sh   # another host
#
# Prereqs: AI Maestro running, jq, tmux.

set -uo pipefail

BASE="${BASE:-http://localhost:23000}"
TARGET="${1:-}"
PASS=0; FAIL=0

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$1"; }
info()  { printf '\033[0;36m%s\033[0m\n' "$1"; }
ok()    { green "  PASS  $1"; PASS=$((PASS+1)); }
no()    { red   "  FAIL  $1"; FAIL=$((FAIL+1)); }

need() { command -v "$1" >/dev/null || { red "missing dependency: $1"; exit 1; }; }
need jq; need curl

info "== AI Maestro message-wake test =="
echo "base: $BASE"

# --- 0. server up ----------------------------------------------------------
if ! curl -sf -m 8 "$BASE/api/sessions" >/dev/null; then
  red "AI Maestro is not answering at $BASE/api/sessions"
  exit 1
fi
ok "server responding"

# --- 1. pick a target agent ------------------------------------------------
# Must be LOCAL to this instance: deliver() needs the recipient's UUID from the
# local registry, and the pane check below reads a local tmux session. Agents on
# other hosts route over AMP federation, which is a different test.
if [ -z "$TARGET" ]; then
  need tmux
  LIVE=$(tmux list-sessions -F '#{session_name}' 2>/dev/null)
  TARGET=$(curl -s -m 8 "$BASE/api/sessions" \
    | jq -r --arg live "$LIVE" '
        ($live | split("\n")) as $panes
        | [(.sessions // .)[] | select(.name as $n | $panes | index($n))][0].name // empty')
fi
if [ -z "$TARGET" ]; then
  red "no local agent with a live tmux session — start one, or pass a name explicitly"
  info "  local agents: $(curl -s -m 8 "$BASE/api/sessions" | jq -rc '[(.sessions // .)[].name]' 2>/dev/null)"
  info "  tmux panes:   $(tmux list-sessions -F '#{session_name}' 2>/dev/null | tr '\n' ' ')"
  exit 1
fi
info "target agent: $TARGET (local, live pane)"

BEFORE=$(curl -s -m 8 "$BASE/api/messages/pending-wakes" | jq -r '.total // 0')
SUBJECT="wake-test-$(date +%s)"
BODY="Automated wake test. No reply needed. ref=$SUBJECT"

# --- 2. send through the real delivery path --------------------------------
RESP=$(curl -s -m 30 -X POST "$BASE/api/messages" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg to "$TARGET" --arg s "$SUBJECT" --arg b "$BODY" \
        '{from:"wake-test", to:$to, subject:$s,
          content:{type:"notification", message:$b}}')")

if [ -z "$RESP" ]; then no "POST /api/messages returned nothing"; else ok "message accepted"; fi
echo "$RESP" | jq . 2>/dev/null | head -20

MSG_ID=$(echo "$RESP" | jq -r '.message.id // .data.message.id // empty')
[ -n "$MSG_ID" ] && ok "delivered (written to inbox, id=$MSG_ID)" \
                 || no "not delivered — check the response above"

# --- 3. THE point: was the wake proven? ------------------------------------
VERIFIED=$(echo "$RESP" | jq -r '.verified // .data.verified // empty')
VIA=$(echo "$RESP"      | jq -r '.verifiedBy // .data.verifiedBy // empty')
DEFERRED=$(echo "$RESP" | jq -r '.deferred // .data.deferred // empty')
ATTEMPTS=$(echo "$RESP" | jq -rc '(.wakeAttempts // .data.wakeAttempts // []) | map(.adapter+":"+.status) | join(" -> ")')

echo
info "wake route trace: ${ATTEMPTS:-<not reported>}"

if [ "$VERIFIED" = "true" ]; then
  ok "wake CONFIRMED via ${VIA:-unknown} — the agent provably received it"
elif [ "$DEFERRED" = "true" ]; then
  ok "wake DEFERRED — agent was busy, queued for its idle transition (expected under load)"
  info "     re-run ./scripts/test-message-wake.sh once the agent is idle to see it confirm"
else
  no "wake UNCONFIRMED — nothing could prove the agent saw it"
  info "     this is the failure the subsystem exists to make visible, not hide"
fi

# --- 4. the operator surface reflects reality ------------------------------
sleep 2
PENDING=$(curl -s -m 8 "$BASE/api/messages/pending-wakes")
AFTER=$(echo "$PENDING" | jq -r '.total // 0')
echo
info "pending wakes: before=$BEFORE after=$AFTER"
echo "$PENDING" | jq '{total, busy, unconfirmed, pending: (.pending[:5])}' 2>/dev/null

if [ "$VERIFIED" = "true" ]; then
  [ "$AFTER" -le "$BEFORE" ] && ok "confirmed wake left nothing queued" \
                             || no "confirmed wake still queued something"
else
  [ "$AFTER" -gt "$BEFORE" ] && ok "unconfirmed/deferred wake is queued for retry" \
                             || no "unconfirmed wake was NOT queued — it would be lost"
fi

# --- 5. did it actually reach the pane? ------------------------------------
if command -v tmux >/dev/null && tmux has-session -t "$TARGET" 2>/dev/null; then
  # Whitespace-stripped on both sides so a hard-wrapped line still matches.
  if tmux capture-pane -t "$TARGET:0.0" -p -S -120 2>/dev/null \
       | tr -d '[:space:]' | grep -qF "$(printf '%s' "$SUBJECT" | tr -d '[:space:]')"; then
    ok "message text found on the agent's pane"
  else
    info "  note  text not on the pane — expected when confirmed via stream/channel, or still deferred"
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then green "== $PASS passed, 0 failed =="; exit 0
else red "== $PASS passed, $FAIL failed =="; exit 1; fi
