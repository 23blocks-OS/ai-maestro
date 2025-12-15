#!/bin/bash
# AI Maestro - Send a message to another agent
# Usage: send-aimaestro-message.sh <to_agent> <subject> <message> [priority] [type]

# Source messaging helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/messaging-helper.sh"

if [ $# -lt 3 ]; then
  echo "Usage: send-aimaestro-message.sh <to_agent> <subject> <message> [priority] [type]"
  echo ""
  echo "Arguments:"
  echo "  to_agent    - Target agent (agent ID, alias, or session name)"
  echo "  subject     - Message subject"
  echo "  message     - Message content"
  echo "  priority    - Optional: low|normal|high|urgent (default: normal)"
  echo "  type        - Optional: request|response|notification|update (default: request)"
  echo ""
  echo "Example:"
  echo "  send-aimaestro-message.sh backend-architect \"Need API\" \"Please implement POST /api/users\" high request"
  exit 1
fi

TO_AGENT="$1"
SUBJECT="$2"
MESSAGE="$3"
PRIORITY="${4:-normal}"
TYPE="${5:-request}"

# Initialize messaging (gets SESSION, AGENT_ID, HOST_ID)
init_messaging || exit 1

# Validate priority
if [[ ! "$PRIORITY" =~ ^(low|normal|high|urgent)$ ]]; then
  echo "Error: Priority must be low, normal, high, or urgent"
  exit 1
fi

# Validate type
if [[ ! "$TYPE" =~ ^(request|response|notification|update)$ ]]; then
  echo "Error: Type must be request, response, notification, or update"
  exit 1
fi

# Resolve destination agent
if ! resolve_agent "$TO_AGENT"; then
  exit 1
fi

TO_ID="$RESOLVED_AGENT_ID"
TO_HOST="$RESOLVED_HOST_ID"

# Build JSON payload with agentId (not session name)
JSON_PAYLOAD=$(jq -n \
  --arg from "$AGENT_ID" \
  --arg fromHost "$HOST_ID" \
  --arg to "$TO_ID" \
  --arg toHost "$TO_HOST" \
  --arg subject "$SUBJECT" \
  --arg message "$MESSAGE" \
  --arg priority "$PRIORITY" \
  --arg type "$TYPE" \
  '{
    from: $from,
    fromHost: $fromHost,
    to: $to,
    toHost: $toHost,
    subject: $subject,
    priority: $priority,
    content: {
      type: $type,
      message: $message
    }
  }')

# Send via API
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/api/messages" \
  -H 'Content-Type: application/json' \
  -d "$JSON_PAYLOAD")

# Extract HTTP code and body
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  # Get human-readable names
  MY_NAME=$(get_my_name)
  TO_NAME="${RESOLVED_ALIAS:-$TO_AGENT}@${TO_HOST}"

  echo "✅ Message sent"
  echo "   From: $MY_NAME"
  echo "   To: $TO_NAME"
  echo "   Subject: $SUBJECT"
  echo "   Priority: $PRIORITY"
else
  echo "❌ Failed to send message (HTTP $HTTP_CODE)"
  ERROR_MSG=$(echo "$BODY" | jq -r '.error // "Unknown error"' 2>/dev/null)
  if [ -n "$ERROR_MSG" ] && [ "$ERROR_MSG" != "null" ]; then
    echo "   Error: $ERROR_MSG"
  fi
  exit 1
fi
