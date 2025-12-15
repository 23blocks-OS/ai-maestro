#!/bin/bash
# AI Maestro Messaging Helper Functions
# Sources common utilities and adds messaging-specific functions

# Source common helpers - try installed location first, then repo location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "${HOME}/.local/share/aimaestro/shell-helpers/common.sh" ]; then
    source "${HOME}/.local/share/aimaestro/shell-helpers/common.sh"
elif [ -f "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh" ]; then
    source "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh"
else
    echo "Error: common.sh not found. Please reinstall messaging scripts." >&2
    echo "Run: cd /path/to/ai-maestro && ./install-messaging.sh" >&2
    exit 1
fi

# Message directories use agentId, not session name
get_inbox_dir() {
    local agent_id="$1"
    echo "${HOME}/.aimaestro/messages/inbox/${agent_id}"
}

get_sent_dir() {
    local agent_id="$1"
    echo "${HOME}/.aimaestro/messages/sent/${agent_id}"
}

# Resolve agent alias to agentId and hostId
# Usage: resolve_agent "alias-or-id"
# Sets: RESOLVED_AGENT_ID, RESOLVED_HOST_ID, RESOLVED_HOST_URL
resolve_agent() {
    local alias_or_id="$1"

    local response
    response=$(curl -s "${API_BASE}/api/messages?action=resolve&agent=${alias_or_id}" 2>/dev/null)

    if [ -z "$response" ]; then
        echo "Error: Cannot connect to AI Maestro at ${API_BASE}" >&2
        return 1
    fi

    # Check if resolved object exists (API returns { resolved: { ... } })
    local resolved
    resolved=$(echo "$response" | jq -r '.resolved // empty' 2>/dev/null)

    if [ -z "$resolved" ] || [ "$resolved" = "null" ]; then
        echo "Error: Could not resolve agent '${alias_or_id}'" >&2
        return 1
    fi

    RESOLVED_AGENT_ID=$(echo "$response" | jq -r '.resolved.agentId' 2>/dev/null)
    RESOLVED_HOST_ID=$(echo "$response" | jq -r '.resolved.hostId // "local"' 2>/dev/null)
    RESOLVED_HOST_URL=$(echo "$response" | jq -r '.resolved.hostUrl // ""' 2>/dev/null)

    return 0
}

# Send a message to another agent
# Usage: send_message "to_agent" "subject" "message" ["priority"]
send_message() {
    local to_agent="$1"
    local subject="$2"
    local message="$3"
    local priority="${4:-normal}"

    # Resolve destination agent
    if ! resolve_agent "$to_agent"; then
        return 1
    fi

    local to_id="$RESOLVED_AGENT_ID"
    local to_host="$RESOLVED_HOST_ID"

    # Build JSON payload
    local payload
    payload=$(jq -n \
        --arg from "$AGENT_ID" \
        --arg fromHost "$HOST_ID" \
        --arg to "$to_id" \
        --arg toHost "$to_host" \
        --arg subject "$subject" \
        --arg message "$message" \
        --arg priority "$priority" \
        '{
            from: $from,
            fromHost: $fromHost,
            to: $to,
            toHost: $toHost,
            subject: $subject,
            priority: $priority,
            content: {
                type: "message",
                message: $message
            }
        }')

    api_query "POST" "/api/messages" -H "Content-Type: application/json" -d "$payload"
}

# Get unread messages for current agent
get_unread_messages() {
    api_query "GET" "/api/messages?agent=${AGENT_ID}&box=inbox&status=unread"
}

# Mark a message as read
mark_message_read() {
    local message_id="$1"
    api_query "PATCH" "/api/messages?agent=${AGENT_ID}&id=${message_id}&action=read"
}

# Initialize messaging - get session and agent ID
init_messaging() {
    init_common || return 1

    # Ensure message directories exist
    mkdir -p "$(get_inbox_dir "$AGENT_ID")"
    mkdir -p "$(get_sent_dir "$AGENT_ID")"
}
