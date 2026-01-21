#!/bin/bash
# AI Maestro - Check for unread messages
# Usage: check-aimaestro-messages.sh [--mark-read]

# Source messaging helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/messaging-helper.sh"

MARK_READ=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --mark-read)
      MARK_READ=true
      shift
      ;;
    --help|-h)
      echo "Usage: check-aimaestro-messages.sh [--mark-read]"
      echo ""
      echo "Check for unread messages in your inbox."
      echo ""
      echo "Options:"
      echo "  --mark-read    Mark all messages as read after displaying"
      echo "  --help, -h     Show this help message"
      echo ""
      echo "Examples:"
      echo "  check-aimaestro-messages.sh              # List unread messages"
      echo "  check-aimaestro-messages.sh --mark-read  # List and mark as read"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Initialize messaging (gets SESSION, AGENT_ID, HOST_ID)
init_messaging || exit 1

# Get human-readable name for current agent
MY_DISPLAY_NAME=$(get_my_name)

# Get host display name from hosts.json
get_host_name() {
    local host_id="$1"

    # Check if it's this machine (case-insensitive)
    local self_id
    self_id=$(get_self_host_id)
    local host_lower=$(echo "$host_id" | tr '[:upper:]' '[:lower:]')
    local self_lower=$(echo "$self_id" | tr '[:upper:]' '[:lower:]')
    if [ "$host_lower" = "$self_lower" ]; then
        echo "$host_id (this machine)"
        return
    fi

    if [ -f "$HOSTS_CONFIG" ]; then
        local name
        name=$(jq -r --arg id "$host_lower" '.hosts[] | select((.id | ascii_downcase) == $id) | .name' "$HOSTS_CONFIG" 2>/dev/null | head -1)
        if [ -n "$name" ] && [ "$name" != "null" ]; then
            echo "$name"
            return
        fi
    fi
    echo "$host_id"
}

HOST_DISPLAY_NAME=$(get_host_name "$HOST_ID")

# Fetch unread messages via API (uses agentId, not session)
RESPONSE=$(get_unread_messages)

# Check if API call was successful
if [ $? -ne 0 ]; then
  echo "❌ Error: Failed to connect to AI Maestro API"
  echo "   Make sure the dashboard is running (${API_BASE})"
  exit 1
fi

# Check if response is valid JSON
if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
  echo "❌ Error: Invalid response from API"
  echo "   Response: $RESPONSE"
  echo ""
  echo "💡 Troubleshooting:"
  echo "   - Check that AI Maestro is running: pm2 list"
  echo "   - Restart if needed: pm2 restart ai-maestro"
  exit 1
fi

# Check for API errors
API_ERROR=$(echo "$RESPONSE" | jq -r '.error // empty' 2>/dev/null)
if [ -n "$API_ERROR" ]; then
  echo "❌ API Error: $API_ERROR"
  exit 1
fi

# Parse message count
COUNT=$(echo "$RESPONSE" | jq -r '.messages | length' 2>/dev/null)

if [ -z "$COUNT" ] || [ "$COUNT" = "null" ] || [ "$COUNT" = "0" ]; then
  echo "📭 No unread messages"
  exit 0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📬 You have $COUNT unread message(s)"
echo "   Inbox: $MY_DISPLAY_NAME (host: $HOST_DISPLAY_NAME)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Display messages
MESSAGE_IDS=()
echo "$RESPONSE" | jq -r '.messages[] |
  "\u001b[1m[\(.id)]\u001b[0m " +
  (if .priority == "urgent" then "🔴"
   elif .priority == "high" then "🟠"
   elif .priority == "normal" then "🔵"
   else "⚪" end) +
  " From: \u001b[36m\(.fromAlias // .from)\u001b[0m" +
  (if .fromHost and .fromHost != "local" then " @\(.fromHost)" else "" end) +
  " | \(.timestamp)\n" +
  "    Subject: \(.subject)\n" +
  "    Preview: \(.preview)\n"'

# Store message IDs if we need to mark as read
if [ "$MARK_READ" = true ]; then
  mapfile -t MESSAGE_IDS < <(echo "$RESPONSE" | jq -r '.messages[].id')

  if [ ${#MESSAGE_IDS[@]} -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📝 Marking messages as read..."

    for MSG_ID in "${MESSAGE_IDS[@]}"; do
      MARK_RESPONSE=$(mark_message_read "$MSG_ID")
      SUCCESS=$(echo "$MARK_RESPONSE" | jq -r '.success' 2>/dev/null)

      if [ "$SUCCESS" = "true" ]; then
        echo "   ✅ Marked ${MSG_ID:0:15}... as read"
      else
        echo "   ❌ Failed to mark ${MSG_ID:0:15}... as read"
      fi
    done

    echo ""
    echo "✅ All messages marked as read"
  fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 To read full message: read-aimaestro-message.sh <message-id>"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
