#!/bin/bash
# AI Maestro - Quick check for new messages (runs after each Claude response)

# Source messaging helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/messaging-helper.sh" 2>/dev/null || exit 0

# Initialize messaging (gets SESSION, AGENT_ID, HOST_ID)
init_messaging 2>/dev/null || exit 0

# Use inbox directory based on agent ID
INBOX=$(get_inbox_dir "$AGENT_ID")
UNREAD=$(ls "$INBOX"/*.json 2>/dev/null | wc -l | tr -d ' ')

if [ "$UNREAD" -gt 0 ]; then
  echo "" >&2
  echo "💬 New message(s) received! You have $UNREAD unread message(s)" >&2
  echo "   Run: check-aimaestro-messages.sh to view" >&2
fi
