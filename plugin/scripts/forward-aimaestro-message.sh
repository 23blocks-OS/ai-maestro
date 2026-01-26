#!/bin/bash
# AI Maestro - Forward a message to another agent
# Usage: forward-aimaestro-message.sh <message-id|latest> <recipient-agent> "[optional note]"

# Source messaging helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/messaging-helper.sh"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to show usage
show_usage() {
  echo "Usage: forward-aimaestro-message.sh <message-id|latest> <recipient-agent> \"[optional note]\""
  echo ""
  echo "Arguments:"
  echo "  message-id      The message ID to forward (or 'latest' for most recent)"
  echo "  recipient       Target agent (agent ID, alias, or session name)"
  echo "  note            Optional note to add to forwarded message"
  echo ""
  echo "Examples:"
  echo "  forward-aimaestro-message.sh msg-123456 backend-architect"
  echo "  forward-aimaestro-message.sh latest frontend-dev \"Please review\""
  exit 1
}

# Check arguments
if [ $# -lt 2 ]; then
  echo -e "${RED}❌ Error: Missing required arguments${NC}"
  show_usage
fi

MESSAGE_ID="$1"
RECIPIENT="$2"
FORWARD_NOTE="${3:-}"

# Initialize messaging (gets SESSION, AGENT_ID, HOST_ID)
init_messaging || exit 1

# Resolve "latest" keyword to actual message ID
if [ "$MESSAGE_ID" = "latest" ]; then
  echo -e "${BLUE}📬 Finding latest message...${NC}"

  RESPONSE=$(get_unread_messages)
  LATEST_ID=$(echo "$RESPONSE" | jq -r '.messages[0].id // empty' 2>/dev/null)

  if [ -z "$LATEST_ID" ] || [ "$LATEST_ID" = "null" ]; then
    echo -e "${RED}❌ Error: No messages found in inbox${NC}"
    exit 1
  fi

  MESSAGE_ID="$LATEST_ID"
  echo -e "${BLUE}📬 Forwarding message: $MESSAGE_ID${NC}"
fi

# Resolve recipient
if ! resolve_agent "$RECIPIENT"; then
  echo -e "${RED}❌ Error: Could not resolve recipient '$RECIPIENT'${NC}"
  exit 1
fi

TO_ID="$RESOLVED_AGENT_ID"
TO_HOST="$RESOLVED_HOST_ID"

# Check if forwarding to same agent
if [ "$AGENT_ID" = "$TO_ID" ]; then
  echo -e "${RED}❌ Error: Cannot forward message to yourself${NC}"
  exit 1
fi

# Fetch original message via API
RESPONSE=$(api_query "GET" "/api/messages?agent=${AGENT_ID}&id=${MESSAGE_ID}&box=inbox")

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Error: Failed to fetch message${NC}"
  exit 1
fi

# Check if message was found
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty' 2>/dev/null)
if [ -n "$ERROR" ]; then
  echo -e "${RED}❌ Error: $ERROR${NC}"
  exit 1
fi

# Extract original message details (prefer aliases for display)
ORIGINAL_FROM=$(echo "$RESPONSE" | jq -r '.fromAlias // .from')
ORIGINAL_FROM_HOST=$(echo "$RESPONSE" | jq -r 'if .fromHost and .fromHost != "local" then "@" + .fromHost else "" end')
ORIGINAL_TO=$(echo "$RESPONSE" | jq -r '.toAlias // .to')
ORIGINAL_TO_HOST=$(echo "$RESPONSE" | jq -r 'if .toHost and .toHost != "local" then "@" + .toHost else "" end')
ORIGINAL_SUBJECT=$(echo "$RESPONSE" | jq -r '.subject')
ORIGINAL_MESSAGE=$(echo "$RESPONSE" | jq -r '.content.message')
ORIGINAL_TIMESTAMP=$(echo "$RESPONSE" | jq -r '.timestamp')
ORIGINAL_PRIORITY=$(echo "$RESPONSE" | jq -r '.priority')

# Format timestamp for display
FORMATTED_TIME=$(echo "$ORIGINAL_TIMESTAMP" | sed 's/T/ /' | sed 's/\..*//')

# Build forwarded content
FORWARDED_CONTENT=""
if [ -n "$FORWARD_NOTE" ]; then
  FORWARDED_CONTENT="$FORWARD_NOTE

"
fi

FORWARDED_CONTENT+="--- Forwarded Message ---
From: ${ORIGINAL_FROM}${ORIGINAL_FROM_HOST}
To: ${ORIGINAL_TO}${ORIGINAL_TO_HOST}
Sent: $FORMATTED_TIME
Subject: $ORIGINAL_SUBJECT

$ORIGINAL_MESSAGE
--- End of Forwarded Message ---"

# Build forward payload
PAYLOAD=$(jq -n \
  --arg from "$AGENT_ID" \
  --arg fromHost "$HOST_ID" \
  --arg to "$TO_ID" \
  --arg toHost "$TO_HOST" \
  --arg subject "Fwd: $ORIGINAL_SUBJECT" \
  --arg message "$FORWARDED_CONTENT" \
  --arg priority "$ORIGINAL_PRIORITY" \
  --arg origMsgId "$MESSAGE_ID" \
  --arg origFrom "$ORIGINAL_FROM" \
  --arg origTo "$ORIGINAL_TO" \
  --arg origTimestamp "$ORIGINAL_TIMESTAMP" \
  --arg forwardNote "$FORWARD_NOTE" \
  '{
    from: $from,
    fromHost: $fromHost,
    to: $to,
    toHost: $toHost,
    subject: $subject,
    priority: $priority,
    content: {
      type: "notification",
      message: $message
    },
    forwardedFrom: {
      originalMessageId: $origMsgId,
      originalFrom: $origFrom,
      originalTo: $origTo,
      originalTimestamp: $origTimestamp,
      forwardedBy: $from,
      forwardNote: $forwardNote
    }
  }')

# Send via API
SEND_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/api/messages" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD")

# Extract HTTP code and body
HTTP_CODE=$(echo "$SEND_RESPONSE" | tail -n1)
BODY=$(echo "$SEND_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  NEW_ID=$(echo "$BODY" | jq -r '.id // "unknown"')
  echo -e "${GREEN}✅ Message forwarded successfully${NC}"
  echo -e "${BLUE}📨 Original: $ORIGINAL_SUBJECT${NC}"
  echo -e "${BLUE}📬 To: ${TO_ALIAS:-$TO_ID}@${TO_HOST}${NC}"
  echo -e "${BLUE}🆔 Forwarded Message ID: $NEW_ID${NC}"

  if [ -n "$FORWARD_NOTE" ]; then
    echo -e "${YELLOW}📝 Note: $FORWARD_NOTE${NC}"
  fi
else
  echo -e "${RED}❌ Failed to forward message (HTTP $HTTP_CODE)${NC}"
  ERROR_MSG=$(echo "$BODY" | jq -r '.error // "Unknown error"' 2>/dev/null)
  if [ -n "$ERROR_MSG" ] && [ "$ERROR_MSG" != "null" ]; then
    echo "   Error: $ERROR_MSG"
  fi
  exit 1
fi
