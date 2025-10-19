#!/bin/bash
# AI Maestro - Quick check for new messages (runs after each Claude response)

SESSION=$(tmux display-message -p '#S' 2>/dev/null)
if [ -z "$SESSION" ]; then
  exit 0
fi

INBOX=~/.aimaestro/messages/inbox/$SESSION
UNREAD=$(ls "$INBOX"/*.json 2>/dev/null | wc -l | tr -d ' ')

if [ "$UNREAD" -gt 0 ]; then
  echo "" >&2
  echo "💬 New message(s) received! You have $UNREAD unread message(s)" >&2
  echo "   Run: cat \"$INBOX\"/*.json | jq" >&2
fi
