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

# Parse agent@host syntax
# Usage: parse_agent_host "agent@host" or "agent" (defaults to local)
# Sets: PARSED_AGENT, PARSED_HOST
parse_agent_host() {
    local input="$1"

    if [[ "$input" == *"@"* ]]; then
        PARSED_AGENT="${input%%@*}"
        PARSED_HOST="${input#*@}"
    else
        PARSED_AGENT="$input"
        PARSED_HOST="local"
    fi
}

# Resolve agent alias to agentId and hostId
# Supports: "alias", "alias@host", "agentId", "agentId@host"
# Usage: resolve_agent "alias-or-id[@host]"
# Sets: RESOLVED_AGENT_ID, RESOLVED_HOST_ID, RESOLVED_HOST_URL, RESOLVED_ALIAS, RESOLVED_NAME
resolve_agent() {
    local alias_or_id="$1"

    # Parse agent@host syntax
    parse_agent_host "$alias_or_id"
    local agent_part="$PARSED_AGENT"
    local host_part="$PARSED_HOST"

    # Load hosts config if not already loaded
    if [ ${#HOST_URLS[@]} -eq 0 ]; then
        load_hosts_config
    fi

    # Get the API URL for the target host
    local target_api
    target_api=$(get_host_url "$host_part" 2>/dev/null)

    if [ -z "$target_api" ]; then
        echo "Error: Unknown host '$host_part'" >&2
        echo "Available hosts: ${!HOST_URLS[*]}" >&2
        return 1
    fi

    # Query the target host's API to resolve the agent
    local response
    response=$(curl -s "${target_api}/api/messages?action=resolve&agent=${agent_part}" 2>/dev/null)

    if [ -z "$response" ]; then
        echo "Error: Cannot connect to AI Maestro at ${target_api}" >&2
        return 1
    fi

    # Check if resolved object exists (API returns { resolved: { ... } })
    local resolved
    resolved=$(echo "$response" | jq -r '.resolved // empty' 2>/dev/null)

    if [ -z "$resolved" ] || [ "$resolved" = "null" ]; then
        echo "Error: Could not resolve agent '${agent_part}' on host '${host_part}'" >&2
        return 1
    fi

    RESOLVED_AGENT_ID=$(echo "$response" | jq -r '.resolved.agentId' 2>/dev/null)
    RESOLVED_HOST_ID="$host_part"
    RESOLVED_HOST_URL="$target_api"
    RESOLVED_ALIAS=$(echo "$response" | jq -r '.resolved.alias // ""' 2>/dev/null)
    RESOLVED_NAME=$(echo "$response" | jq -r '.resolved.displayName // .resolved.alias // ""' 2>/dev/null)

    return 0
}

# Get current agent's display name (agent@host format)
get_my_name() {
    resolve_agent "$AGENT_ID" 2>/dev/null
    if [ -n "$RESOLVED_ALIAS" ] && [ "$RESOLVED_ALIAS" != "null" ]; then
        echo "${RESOLVED_ALIAS}@${HOST_ID:-local}"
    else
        echo "${AGENT_ID}@${HOST_ID:-local}"
    fi
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
