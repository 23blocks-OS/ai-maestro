#!/bin/bash
# AI Maestro - Check and display messages at session start

SESSION=$(tmux display-message -p '#S' 2>/dev/null)
if [ -z "$SESSION" ]; then
  exit 0
fi

INBOX=~/.aimaestro/messages/inbox/$SESSION
MESSAGES=$(ls "$INBOX"/*.json 2>/dev/null)

if [ -z "$MESSAGES" ]; then
  exit 0
fi

COUNT=$(echo "$MESSAGES" | wc -l | tr -d ' ')
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "📬 AI MAESTRO INBOX: $COUNT unread message(s)" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "" >&2

# Count priorities
URGENT=0
HIGH=0
for msg in $MESSAGES; do
  PRIORITY=$(cat "$msg" | jq -r '.priority' 2>&1)
  if [ -z "$PRIORITY" ] || [ "$PRIORITY" = "null" ]; then
    echo "⚠️  Warning: Corrupted message file: $msg" >&2
    continue
  fi
  if [ "$PRIORITY" = "urgent" ]; then
    URGENT=$((URGENT + 1))
  elif [ "$PRIORITY" = "high" ]; then
    HIGH=$((HIGH + 1))
  fi
done

if [ $URGENT -gt 0 ]; then
  echo "🚨 $URGENT URGENT message(s)" >&2
fi
if [ $HIGH -gt 0 ]; then
  echo "⚠️  $HIGH HIGH priority message(s)" >&2
fi
echo "" >&2

# Show all messages
for msg in $MESSAGES; do
  echo "───────────────────────────────────────" >&2

  # Attempt to parse and display message
  MSG_OUTPUT=$(cat "$msg" | jq -r '"📧 From: \(.from)\n📌 Subject: \(.subject)\n⏰ Time: \(.timestamp)\n🎯 Priority: \(.priority | ascii_upcase)\n📝 Type: \(.content.type)\n\nMessage:\n\(.content.message)\n"' 2>&1)

  if [ $? -ne 0 ] || [ -z "$MSG_OUTPUT" ]; then
    echo "⚠️  Error: Unable to parse message file: $msg" >&2
    echo "   Raw content:" >&2
    cat "$msg" >&2
    echo "" >&2
    continue
  fi

  echo "$MSG_OUTPUT" >&2

  # Show context if present
  CONTEXT=$(cat "$msg" | jq -r '.content.context // empty' 2>/dev/null)
  if [ -n "$CONTEXT" ] && [ "$CONTEXT" != "null" ]; then
    echo "📎 Context:" >&2
    cat "$msg" | jq '.content.context' 2>/dev/null >&2
    echo "" >&2
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "💡 To reply, use the Messages tab in AI Maestro dashboard" >&2
echo "📂 Location: $INBOX" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
