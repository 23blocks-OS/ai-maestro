#!/bin/bash
# AI Maestro - Send a message to another agent
# Usage: send-aimaestro-message.sh <to_agent> <subject> <message> [priority] [type]

# Source messaging helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/messaging-helper.sh"

if [ $# -lt 3 ]; then
  echo "Usage: send-aimaestro-message.sh <to_agent[@host]> <subject> <message> [priority] [type]"
  echo ""
  echo "Arguments:"
  echo "  to_agent    - Target agent (automatically searches all hosts if no host specified)"
  echo "                Examples: backend-api, backend-api@mac-mini, 23blocks-api-forms"
  echo "  subject     - Message subject"
  echo "  message     - Message content"
  echo "  priority    - Optional: low|normal|high|urgent (default: normal)"
  echo "  type        - Optional: request|response|notification|update (default: request)"
  echo ""
  echo "Smart Agent Lookup:"
  echo "  When no @host is specified, the script searches ALL enabled hosts:"
  echo "  - If found on 1 host: sends automatically"
  echo "  - If found on multiple hosts: asks you to specify which one"
  echo "  - If not found: shows available hosts"
  echo ""
  echo "Examples:"
  echo "  # Auto-find agent across all hosts"
  echo "  send-aimaestro-message.sh backend-architect \"Need API\" \"Please implement POST /api/users\""
  echo ""
  echo "  # Explicitly specify host (faster, no search)"
  echo "  send-aimaestro-message.sh backend-api@mac-mini \"Status update\" \"Deployment complete\" high"
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
TO_ALIAS="$RESOLVED_ALIAS"
TO_HOST_URL="$RESOLVED_HOST_URL"  # Save before it gets overwritten

# Resolve sender's alias for display on remote host
SENDER_ALIAS=""
if resolve_agent "$AGENT_ID" 2>/dev/null; then
    SENDER_ALIAS="$RESOLVED_ALIAS"
fi

# Determine which API to send to (local or remote)
# If target is on a different host, send directly to that host's API
SELF_HOST_ID=$(get_self_host_id)
SELF_HOST_URL=$(get_self_host_url)
TARGET_API="$SELF_HOST_URL"

# Check if target host is this machine (case-insensitive)
TO_HOST_LOWER=$(echo "$TO_HOST" | tr '[:upper:]' '[:lower:]')
SELF_HOST_LOWER=$(echo "$SELF_HOST_ID" | tr '[:upper:]' '[:lower:]')
HOST_ID_LOWER=$(echo "$HOST_ID" | tr '[:upper:]' '[:lower:]')

IS_TARGET_LOCAL=false
if [ -z "$TO_HOST" ] || [ "$TO_HOST_LOWER" = "$SELF_HOST_LOWER" ] || [ "$TO_HOST_LOWER" = "$HOST_ID_LOWER" ]; then
    IS_TARGET_LOCAL=true
fi

if [ "$IS_TARGET_LOCAL" = "false" ]; then
    # Message is for a remote host - get its URL
    TARGET_API="$TO_HOST_URL"  # Use saved value, not RESOLVED_HOST_URL (which may be overwritten)
    if [ -z "$TARGET_API" ]; then
        TARGET_API=$(get_host_url "$TO_HOST" 2>/dev/null)
    fi
    if [ -z "$TARGET_API" ]; then
        echo "❌ Cannot find URL for host '$TO_HOST'" >&2
        exit 1
    fi
fi

# Determine the 'to' field value:
# - For remote hosts: use alias (remote host can resolve it locally)
# - For local host: use agent ID (more reliable)

if [ "$IS_TARGET_LOCAL" = "true" ]; then
    # Local host - use agent ID
    TO_FIELD="$TO_ID"
else
    # Remote host - use alias so remote can resolve it
    TO_FIELD="${TO_ALIAS:-$TO_AGENT}"
fi

# Build JSON payload with agentId and aliases for cross-host display
JSON_PAYLOAD=$(jq -n \
  --arg from "$AGENT_ID" \
  --arg fromAlias "$SENDER_ALIAS" \
  --arg fromHost "$HOST_ID" \
  --arg to "$TO_FIELD" \
  --arg toAlias "$TO_ALIAS" \
  --arg toHost "$TO_HOST" \
  --arg subject "$SUBJECT" \
  --arg message "$MESSAGE" \
  --arg priority "$PRIORITY" \
  --arg type "$TYPE" \
  '{
    from: $from,
    fromAlias: $fromAlias,
    fromHost: $fromHost,
    to: $to,
    toAlias: $toAlias,
    toHost: $toHost,
    subject: $subject,
    priority: $priority,
    content: {
      type: $type,
      message: $message
    }
  }')

# Send via API (local or remote depending on target host)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${TARGET_API}/api/messages" \
  -H 'Content-Type: application/json' \
  -d "$JSON_PAYLOAD")

# Extract HTTP code and body
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  # Get human-readable names
  MY_NAME=$(get_my_name)
  TO_NAME="${TO_ALIAS:-$TO_AGENT}@${TO_HOST}"

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
