#!/bin/bash
# AI Maestro - Check and display UNREAD messages at session start
# This is the auto-run version that shows in tmux on session attach

SESSION=$(tmux display-message -p '#S' 2>/dev/null)
if [ -z "$SESSION" ]; then
  exit 0
fi

# Fetch unread messages via API
RESPONSE=$(curl -s "http://localhost:23000/api/messages?session=${SESSION}&status=unread&box=inbox" 2>/dev/null)

# Check if API call was successful
if [ $? -ne 0 ]; then
  # Silently fail if API is not available
  exit 0
fi

# Parse message count
COUNT=$(echo "$RESPONSE" | jq -r '.messages | length' 2>/dev/null)

if [ -z "$COUNT" ] || [ "$COUNT" = "null" ] || [ "$COUNT" = "0" ]; then
  # No unread messages, exit silently
  exit 0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "📬 AI MAESTRO INBOX: $COUNT unread message(s)" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "" >&2

# Count priorities
URGENT=$(echo "$RESPONSE" | jq -r '[.messages[] | select(.priority == "urgent")] | length' 2>/dev/null)
HIGH=$(echo "$RESPONSE" | jq -r '[.messages[] | select(.priority == "high")] | length' 2>/dev/null)

if [ "$URGENT" != "0" ] && [ "$URGENT" != "null" ]; then
  echo "🚨 $URGENT URGENT message(s)" >&2
fi
if [ "$HIGH" != "0" ] && [ "$HIGH" != "null" ]; then
  echo "⚠️  $HIGH HIGH priority message(s)" >&2
fi

if [ "$URGENT" != "0" ] || [ "$HIGH" != "0" ]; then
  echo "" >&2
fi

# Show all messages
echo "$RESPONSE" | jq -r '.messages[] |
  "───────────────────────────────────────\n" +
  "📧 From: \(.from)\n" +
  "📌 Subject: \(.subject)\n" +
  "⏰ Time: \(.timestamp | split("T")[0] + " " + (.timestamp | split("T")[1] | split(".")[0]))\n" +
  "🎯 Priority: \(.priority | ascii_upcase)\n" +
  "📝 Type: \(.content.type)\n" +
  "\nMessage:\n\(.content.message)\n" +
  (if .content.context then "\n📎 Context:\n" + (.content.context | tostring) + "\n" else "" end)' >&2

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "💡 To manage messages: Use check-aimaestro-messages.sh or AI Maestro dashboard" >&2
echo "💡 To read and mark as read: read-aimaestro-message.sh <message-id>" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
