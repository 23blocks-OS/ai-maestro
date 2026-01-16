#!/bin/bash
# AI Maestro - Read a specific message and mark as read
# Usage: read-aimaestro-message.sh <message-id> [--no-mark-read]

# Source messaging helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/messaging-helper.sh"

if [ $# -lt 1 ]; then
  echo "Usage: read-aimaestro-message.sh <message-id> [--no-mark-read]"
  echo ""
  echo "Read a specific message from your inbox."
  echo ""
  echo "Arguments:"
  echo "  message-id        The message ID to read"
  echo ""
  echo "Options:"
  echo "  --no-mark-read   Don't mark the message as read (peek mode)"
  echo "  --help, -h       Show this help message"
  echo ""
  echo "Examples:"
  echo "  read-aimaestro-message.sh msg-1234567890-abc        # Read and mark as read"
  echo "  read-aimaestro-message.sh msg-1234567890-abc --no-mark-read  # Just peek"
  exit 1
fi

MESSAGE_ID="$1"
MARK_READ=true

# Parse options
shift
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-mark-read)
      MARK_READ=false
      shift
      ;;
    --help|-h)
      echo "Usage: read-aimaestro-message.sh <message-id> [--no-mark-read]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Initialize messaging (gets SESSION, AGENT_ID, HOST_ID)
init_messaging || exit 1

# Fetch message via API
RESPONSE=$(api_query "GET" "/api/messages?agent=${AGENT_ID}&id=${MESSAGE_ID}&box=inbox")

# Check if curl failed
if [ $? -ne 0 ]; then
  echo "❌ Error: Failed to connect to AI Maestro API"
  echo "   Make sure the dashboard is running (${API_BASE})"
  exit 1
fi

# Check if response is valid JSON
if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
  echo "❌ Error: Invalid response from API"
  echo "   Response: $RESPONSE"
  exit 1
fi

# Check if message was found
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty' 2>/dev/null)
if [ -n "$ERROR" ]; then
  echo "❌ Error: $ERROR"
  echo ""
  # Get human-readable name for display
  MY_DISPLAY_NAME=$(get_my_name 2>/dev/null)
  if [ -z "$MY_DISPLAY_NAME" ] || [ "$MY_DISPLAY_NAME" = "@" ]; then
    MY_DISPLAY_NAME="${AGENT_ID}@${HOST_ID:-local}"
  fi
  echo "💡 Troubleshooting:"
  echo "   - Check that the message ID is correct (full ID, not truncated)"
  echo "   - Verify the message exists: check-aimaestro-messages.sh"
  echo "   - Make sure you're in the correct tmux session"
  echo "   - Current agent: $MY_DISPLAY_NAME"
  exit 1
fi

# Extract message fields (prefer aliases for display)
FROM=$(echo "$RESPONSE" | jq -r '.fromAlias // .from')
FROM_HOST=$(echo "$RESPONSE" | jq -r 'if .fromHost and .fromHost != "local" then "@" + .fromHost else "" end')
TO=$(echo "$RESPONSE" | jq -r '.toAlias // .to')
TO_HOST=$(echo "$RESPONSE" | jq -r 'if .toHost and .toHost != "local" then "@" + .toHost else "" end')
SUBJECT=$(echo "$RESPONSE" | jq -r '.subject')
TIMESTAMP=$(echo "$RESPONSE" | jq -r '.timestamp')
PRIORITY=$(echo "$RESPONSE" | jq -r '.priority')
TYPE=$(echo "$RESPONSE" | jq -r '.content.type')
MESSAGE=$(echo "$RESPONSE" | jq -r '.content.message')
CONTEXT=$(echo "$RESPONSE" | jq -r '.content.context // empty')
IN_REPLY_TO=$(echo "$RESPONSE" | jq -r '.inReplyTo // empty')
FORWARDED=$(echo "$RESPONSE" | jq -r '.forwardedFrom // empty')

# Get priority indicator
PRIORITY_ICON=""
case $PRIORITY in
  urgent) PRIORITY_ICON="🔴" ;;
  high) PRIORITY_ICON="🟠" ;;
  normal) PRIORITY_ICON="🔵" ;;
  low) PRIORITY_ICON="⚪" ;;
esac

# Format timestamp
FORMATTED_TIME=$(echo "$TIMESTAMP" | sed 's/T/ /' | sed 's/\..*//')

# Display message
echo "═══════════════════════════════════════════════════════════════"
echo "📧 Message: $SUBJECT"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "From:     \033[36m$FROM$FROM_HOST\033[0m"
echo "To:       \033[36m$TO$TO_HOST\033[0m"
echo "Date:     $FORMATTED_TIME"
echo "Priority: $PRIORITY_ICON $PRIORITY"
echo "Type:     $TYPE"

if [ -n "$IN_REPLY_TO" ] && [ "$IN_REPLY_TO" != "null" ]; then
  echo "In Reply To: $IN_REPLY_TO"
fi

echo ""
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "$MESSAGE"
echo ""

# Show context if present
if [ -n "$CONTEXT" ] && [ "$CONTEXT" != "null" ] && [ "$CONTEXT" != "{}" ]; then
  echo "───────────────────────────────────────────────────────────────"
  echo "📎 Context:"
  echo ""
  echo "$RESPONSE" | jq -C '.content.context'
  echo ""
fi

# Show forwarding info if present
if [ -n "$FORWARDED" ] && [ "$FORWARDED" != "null" ]; then
  echo "───────────────────────────────────────────────────────────────"
  echo "↪️  Forwarded Message"
  echo ""
  echo "Originally From: $(echo "$RESPONSE" | jq -r '.forwardedFrom.originalFrom')"
  echo "Originally To:   $(echo "$RESPONSE" | jq -r '.forwardedFrom.originalTo')"
  echo "Forwarded By:    $(echo "$RESPONSE" | jq -r '.forwardedFrom.forwardedBy')"

  FORWARD_NOTE=$(echo "$RESPONSE" | jq -r '.forwardedFrom.forwardNote // empty')
  if [ -n "$FORWARD_NOTE" ] && [ "$FORWARD_NOTE" != "null" ]; then
    echo "Forward Note:    $FORWARD_NOTE"
  fi
  echo ""
fi

echo "═══════════════════════════════════════════════════════════════"

# Mark as read if requested
if [ "$MARK_READ" = true ]; then
  MARK_RESPONSE=$(mark_message_read "$MESSAGE_ID")
  SUCCESS=$(echo "$MARK_RESPONSE" | jq -r '.success' 2>/dev/null)

  if [ "$SUCCESS" = "true" ]; then
    echo "✅ Message marked as read"
  else
    echo "⚠️  Warning: Could not mark message as read"
  fi
else
  echo "👁️  Message not marked as read (peek mode)"
fi

echo "═══════════════════════════════════════════════════════════════"
