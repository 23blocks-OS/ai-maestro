#!/bin/bash
# =============================================================================
# AMP Inbox - Check Messages
# =============================================================================
#
# List messages in your inbox.
#
# Usage:
#   amp-inbox              # Show unread messages
#   amp-inbox --all        # Show all messages
#   amp-inbox --count      # Just show count
#
# =============================================================================

set -e

# Pre-source: extract --id to set agent identity before helper resolves it
_amp_prev=""
for _amp_arg in "$@"; do
    if [ "$_amp_prev" = "--id" ]; then
        export CLAUDE_AGENT_ID="$_amp_arg"
        break
    fi
    _amp_prev="$_amp_arg"
done
unset _amp_prev _amp_arg

# Source helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/amp-helper.sh"

# Parse arguments
STATUS_FILTER="unread"
COUNT_ONLY=false
JSON_OUTPUT=false
LIMIT=20

while [[ $# -gt 0 ]]; do
    case $1 in
        --all|-a)
            STATUS_FILTER="all"
            shift
            ;;
        --unread|-u)
            STATUS_FILTER="unread"
            shift
            ;;
        --read|-r)
            STATUS_FILTER="read"
            shift
            ;;
        --count|-c)
            COUNT_ONLY=true
            shift
            ;;
        --json|-j)
            JSON_OUTPUT=true
            shift
            ;;
        --limit|-l)
            LIMIT="$2"
            if [[ ! "$LIMIT" =~ ^[0-9]+$ ]] || [ "$LIMIT" -eq 0 ]; then
                echo "Error: --limit must be a positive integer"
                exit 1
            fi
            shift 2
            ;;
        --id)
            shift 2  # Already handled in pre-source parsing
            ;;
        --help|-h)
            echo "Usage: amp-inbox [--id UUID] [options]"
            echo ""
            echo "List messages in your inbox."
            echo ""
            echo "Options:"
            echo "  --id UUID       Operate as this agent (UUID from config.json)"
            echo "  --all, -a       Show all messages (default: unread only)"
            echo "  --unread, -u    Show only unread messages"
            echo "  --read, -r      Show only read messages"
            echo "  --count, -c     Show message count only"
            echo "  --json, -j      Output as JSON"
            echo "  --limit, -l N   Limit to N messages (default: 20)"
            echo "  --help, -h      Show this help"
            echo ""
            echo "Examples:"
            echo "  amp-inbox                # Check unread messages"
            echo "  amp-inbox --all          # Show all messages"
            echo "  amp-inbox --count        # Just show count"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run 'amp-inbox --help' for usage."
            exit 1
            ;;
    esac
done

# Require initialization
require_init

# Get messages
MESSAGES=$(list_inbox "$STATUS_FILTER")
COUNT=$(echo "$MESSAGES" | jq 'length')

# Apply limit
MESSAGES=$(echo "$MESSAGES" | jq ".[:${LIMIT}]")
SHOWN=$(echo "$MESSAGES" | jq 'length')

# Count only mode
if [ "$COUNT_ONLY" = true ]; then
    echo "$COUNT"
    exit 0
fi

# JSON output mode
if [ "$JSON_OUTPUT" = true ]; then
    echo "$MESSAGES"
    exit 0
fi

# Human-readable output
if [ "$COUNT" -eq 0 ]; then
    if [ "$STATUS_FILTER" = "unread" ]; then
        echo "📭 No unread messages"
    else
        echo "📭 No messages"
    fi
    echo ""
    echo "Your address: ${AMP_ADDRESS}"
    exit 0
fi

# Header
if [ "$STATUS_FILTER" = "unread" ]; then
    echo "📬 You have ${COUNT} unread message(s)"
else
    echo "📬 ${COUNT} message(s)"
fi
echo ""

# Display messages
while read -r msg_b64; do
    msg=$(echo "$msg_b64" | base64 -d)

    id=$(echo "$msg" | jq -r '.envelope.id')
    from=$(echo "$msg" | jq -r '.envelope.from')
    subject=$(echo "$msg" | jq -r '.envelope.subject')
    priority=$(echo "$msg" | jq -r '.envelope.priority')
    timestamp=$(echo "$msg" | jq -r '.envelope.timestamp')
    status=$(echo "$msg" | jq -r '.local.status // .metadata.status // "unread"')
    msg_type=$(echo "$msg" | jq -r '.payload.type // "notification"')

    # Format timestamp
    ts_display=$(format_timestamp "$timestamp")

    # Get indicators
    priority_icon=$(priority_indicator "$priority")
    status_icon=$(status_indicator "$status")

    # Check for attachments
    att_count=$(echo "$msg" | jq '.payload.attachments // [] | length')
    att_indicator=""
    if [ "$att_count" -gt 0 ]; then
        att_indicator=" [${att_count} file(s)]"
    fi

    # Truncate subject if too long
    if [ ${#subject} -gt 50 ]; then
        subject="${subject:0:47}..."
    fi

    echo "${status_icon} ${priority_icon} [${id}]"
    echo "   From: ${from}"
    echo "   Subject: ${subject}${att_indicator}"
    echo "   Date: ${ts_display} | Type: ${msg_type}"
    echo ""
done < <(echo "$MESSAGES" | jq -r '.[] | @base64')

# Show if there are more
if [ "$SHOWN" -lt "$COUNT" ]; then
    echo "---"
    echo "Showing ${SHOWN} of ${COUNT} messages. Use --limit to see more."
fi

echo "---"
echo "To read a message: amp-read <message-id>"
echo "To reply: amp-reply <message-id> \"Your reply\""
