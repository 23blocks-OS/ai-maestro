#!/bin/bash
# aimaestro-react.sh - react to a message in your own chat with AI Maestro.
# The main use is ✅ on the person's message to say "read it, on it". Reactions show under the message
# in the chat; a reaction from an agent is never delivered to an agent as a note.
#
# Version: 1.0.0
set -u -o pipefail

API="${AIMAESTRO_API:-http://localhost:23000}"
API="${API%/}"
AGENT="${AIM_AGENT_ID:-}"
METHOD=POST

die() { echo "Error: $*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required"
command -v jq >/dev/null 2>&1 || die "jq is required"

usage() {
  cat <<'USAGE'
Usage: aimaestro-react.sh [--agent <id>] [--remove] <messageId|last> <emoji>

  messageId   The transcript id of the message, or `last` for the person's latest message
  emoji       One of 👍 👎 ❓ ✅ 👀 ❤️
  --remove    Take your reaction back

Your agent id comes from AIM_AGENT_ID (set in your session); --agent overrides it.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --agent) [ $# -ge 2 ] || die "--agent needs a value"; AGENT="$2"; shift 2 ;;
    --remove) METHOD=DELETE; shift ;;
    -h|--help|help) usage; exit 0 ;;
    --) shift; break ;;
    -*) die "Unknown option: $1" ;;
    *) break ;;
  esac
done

[ $# -eq 2 ] || { usage; exit 1; }
[ -n "$AGENT" ] || die "no agent id: set AIM_AGENT_ID or use --agent"
MESSAGE="$1"
EMOJI="$2"
BASE="$API/api/agents/$(jq -rn --arg v "$AGENT" '$v|@uri')/chat"

if [ "$MESSAGE" = "last" ]; then
  MESSAGE=$(curl -sS -m 15 "$BASE?limit=100" | jq -r '[.messages[]? | select(.type == "user" and .uuid)] | last | .uuid // empty') || die "could not read the chat"
  [ -n "$MESSAGE" ] || die "no message from the person in the current conversation"
fi

BODY=$(jq -n --arg m "$MESSAGE" --arg e "$EMOJI" --arg a "$AGENT" '{messageId: $m, emoji: $e, agentId: $a}')
OUT=$(curl -sS -m 15 -X "$METHOD" -H 'Content-Type: application/json' --data "$BODY" -w '\n%{http_code}' "$BASE/reactions") || die "could not reach $API"
CODE="${OUT##*$'\n'}"
OUT="${OUT%$'\n'*}"
if [ "$CODE" -ge 400 ] 2>/dev/null; then
  die "$(echo "$OUT" | jq -r '.message // .error // empty' 2>/dev/null) (HTTP $CODE)"
fi
if [ "$METHOD" = POST ]; then echo "$EMOJI added to $MESSAGE"; else echo "$EMOJI removed from $MESSAGE"; fi
