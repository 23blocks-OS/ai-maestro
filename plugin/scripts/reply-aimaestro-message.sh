#!/bin/bash
# AI Maestro - Reply to a message (with Slack thread support)
# Usage: reply-aimaestro-message.sh <message-id> <reply-message> [priority]

# Source messaging helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/messaging-helper.sh"

if [ $# -lt 2 ]; then
  echo "Usage: reply-aimaestro-message.sh <message-id> <reply-message> [priority]"
  echo ""
  echo "Reply to a message. If the original message came from Slack,"
  echo "the reply will automatically be posted to the same Slack thread."
  echo ""
  echo "Arguments:"
  echo "  message-id     The message ID to reply to"
  echo "  reply-message  Your reply content"
  echo "  priority       Optional: low|normal|high|urgent (default: normal)"
  echo ""
  echo "Examples:"
  echo "  reply-aimaestro-message.sh msg-1234567890-abc \"Thanks, I'll look into it\""
  echo "  reply-aimaestro-message.sh msg-1234567890-abc \"URGENT: Found critical bug\" urgent"
  exit 1
fi

MESSAGE_ID="$1"
REPLY_MESSAGE="$2"
PRIORITY="${3:-normal}"

# Initialize messaging (gets SESSION, AGENT_ID, HOST_ID)
init_messaging || exit 1

# Validate priority
if [[ ! "$PRIORITY" =~ ^(low|normal|high|urgent)$ ]]; then
  echo "Error: Priority must be low, normal, high, or urgent"
  exit 1
fi

# Fetch original message to get sender and Slack context
RESPONSE=$(api_query "GET" "/api/messages?agent=${AGENT_ID}&id=${MESSAGE_ID}&box=inbox")

# Check if curl failed
if [ $? -ne 0 ]; then
  echo "Error: Failed to connect to AI Maestro API"
  echo "   Make sure the dashboard is running (${API_BASE})"
  exit 1
fi

# Check if response is valid JSON
if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
  echo "Error: Invalid response from API"
  echo "   Response: $RESPONSE"
  exit 1
fi

# Check if message was found
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty' 2>/dev/null)
if [ -n "$ERROR" ]; then
  echo "Error: $ERROR"
  echo ""
  echo "Troubleshooting:"
  echo "   - Check that the message ID is correct"
  echo "   - Verify the message exists: check-aimaestro-messages.sh"
  exit 1
fi

# Extract original message fields
ORIG_FROM=$(echo "$RESPONSE" | jq -r '.from')
ORIG_FROM_ALIAS=$(echo "$RESPONSE" | jq -r '.fromAlias // empty')
ORIG_FROM_HOST=$(echo "$RESPONSE" | jq -r '.fromHost // empty')
ORIG_SUBJECT=$(echo "$RESPONSE" | jq -r '.subject')

# Extract Slack context if present
SLACK_CONTEXT=$(echo "$RESPONSE" | jq '.content.slack // null')

# Build reply subject (add "Re: " prefix if not already present)
REPLY_SUBJECT="$ORIG_SUBJECT"
if [[ ! "$REPLY_SUBJECT" =~ ^Re:[[:space:]] ]]; then
  REPLY_SUBJECT="Re: $ORIG_SUBJECT"
fi

# Resolve sender's alias for display on remote host
SENDER_ALIAS=""
if resolve_agent "$AGENT_ID" 2>/dev/null; then
    SENDER_ALIAS="$RESOLVED_ALIAS"
fi

# Determine target (reply goes back to original sender)
TO_AGENT="${ORIG_FROM_ALIAS:-$ORIG_FROM}"
TO_HOST="${ORIG_FROM_HOST:-local}"

# Resolve destination for proper routing
if [ -n "$ORIG_FROM_HOST" ] && [ "$ORIG_FROM_HOST" != "local" ]; then
    TO_AGENT="${TO_AGENT}@${TO_HOST}"
fi

if ! resolve_agent "$TO_AGENT" 2>/dev/null; then
  # If resolve fails, use original from field directly
  TO_ID="$ORIG_FROM"
  TO_HOST="${ORIG_FROM_HOST:-local}"
  TO_ALIAS="${ORIG_FROM_ALIAS:-$ORIG_FROM}"
  TO_HOST_URL=""
else
  TO_ID="$RESOLVED_AGENT_ID"
  TO_HOST="$RESOLVED_HOST_ID"
  TO_ALIAS="$RESOLVED_ALIAS"
  TO_HOST_URL="$RESOLVED_HOST_URL"
fi

# Determine which API to send to
SELF_HOST_ID=$(get_self_host_id)
SELF_HOST_URL=$(get_self_host_url)
TARGET_API="$SELF_HOST_URL"

# Check if target host is this machine
TO_HOST_LOWER=$(echo "$TO_HOST" | tr '[:upper:]' '[:lower:]')
SELF_HOST_LOWER=$(echo "$SELF_HOST_ID" | tr '[:upper:]' '[:lower:]')
HOST_ID_LOWER=$(echo "$HOST_ID" | tr '[:upper:]' '[:lower:]')

IS_TARGET_LOCAL=false
if [ -z "$TO_HOST" ] || [ "$TO_HOST" = "local" ] || [ "$TO_HOST_LOWER" = "$SELF_HOST_LOWER" ] || [ "$TO_HOST_LOWER" = "$HOST_ID_LOWER" ]; then
    IS_TARGET_LOCAL=true
fi

if [ "$IS_TARGET_LOCAL" = "false" ]; then
    TARGET_API="${TO_HOST_URL:-$(get_host_url "$TO_HOST" 2>/dev/null)}"
    if [ -z "$TARGET_API" ]; then
        echo "Cannot find URL for host '$TO_HOST'" >&2
        exit 1
    fi
fi

# Determine the 'to' field value
if [ "$IS_TARGET_LOCAL" = "true" ]; then
    TO_FIELD="$TO_ID"
else
    TO_FIELD="${TO_ALIAS:-$ORIG_FROM}"
fi

# Build JSON payload with inReplyTo and optional Slack context
if [ "$SLACK_CONTEXT" != "null" ] && [ -n "$SLACK_CONTEXT" ]; then
  # Include Slack context in reply (will be picked up by Slack bridge)
  JSON_PAYLOAD=$(jq -n \
    --arg from "$AGENT_ID" \
    --arg fromAlias "$SENDER_ALIAS" \
    --arg fromHost "$HOST_ID" \
    --arg to "$TO_FIELD" \
    --arg toAlias "$TO_ALIAS" \
    --arg toHost "$TO_HOST" \
    --arg subject "$REPLY_SUBJECT" \
    --arg message "$REPLY_MESSAGE" \
    --arg priority "$PRIORITY" \
    --arg inReplyTo "$MESSAGE_ID" \
    --argjson slack "$SLACK_CONTEXT" \
    '{
      from: $from,
      fromAlias: $fromAlias,
      fromHost: $fromHost,
      to: $to,
      toAlias: $toAlias,
      toHost: $toHost,
      subject: $subject,
      priority: $priority,
      inReplyTo: $inReplyTo,
      content: {
        type: "response",
        message: $message,
        slack: $slack
      }
    }')
  echo "Replying to Slack thread..."
else
  # Standard reply without Slack context
  JSON_PAYLOAD=$(jq -n \
    --arg from "$AGENT_ID" \
    --arg fromAlias "$SENDER_ALIAS" \
    --arg fromHost "$HOST_ID" \
    --arg to "$TO_FIELD" \
    --arg toAlias "$TO_ALIAS" \
    --arg toHost "$TO_HOST" \
    --arg subject "$REPLY_SUBJECT" \
    --arg message "$REPLY_MESSAGE" \
    --arg priority "$PRIORITY" \
    --arg inReplyTo "$MESSAGE_ID" \
    '{
      from: $from,
      fromAlias: $fromAlias,
      fromHost: $fromHost,
      to: $to,
      toAlias: $toAlias,
      toHost: $toHost,
      subject: $subject,
      priority: $priority,
      inReplyTo: $inReplyTo,
      content: {
        type: "response",
        message: $message
      }
    }')
fi

# Send via API
SEND_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${TARGET_API}/api/messages" \
  -H 'Content-Type: application/json' \
  -d "$JSON_PAYLOAD")

# Extract HTTP code and body
HTTP_CODE=$(echo "$SEND_RESPONSE" | tail -n1)
BODY=$(echo "$SEND_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  # Get human-readable names
  MY_NAME=$(get_my_name)
  TO_NAME="${TO_ALIAS:-$ORIG_FROM}"
  if [ -n "$TO_HOST" ] && [ "$TO_HOST" != "local" ]; then
    TO_NAME="${TO_NAME}@${TO_HOST}"
  fi

  echo "Reply sent"
  echo "   From: $MY_NAME"
  echo "   To: $TO_NAME"
  echo "   Subject: $REPLY_SUBJECT"
  if [ "$SLACK_CONTEXT" != "null" ] && [ -n "$SLACK_CONTEXT" ]; then
    SLACK_CHANNEL=$(echo "$SLACK_CONTEXT" | jq -r '.channel // empty')
    echo "   Slack: Will post to channel $SLACK_CHANNEL"
  fi
else
  echo "Failed to send reply (HTTP $HTTP_CODE)"
  ERROR_MSG=$(echo "$BODY" | jq -r '.error // "Unknown error"' 2>/dev/null)
  if [ -n "$ERROR_MSG" ] && [ "$ERROR_MSG" != "null" ]; then
    echo "   Error: $ERROR_MSG"
  fi
  exit 1
fi
