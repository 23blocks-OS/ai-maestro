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
# Usage: parse_agent_host "agent@host" or "agent" (defaults to empty host)
# Sets: PARSED_AGENT, PARSED_HOST
# Note: If no host specified, PARSED_HOST is empty (caller decides behavior)
parse_agent_host() {
    local input="$1"

    if [[ "$input" == *"@"* ]]; then
        PARSED_AGENT="${input%%@*}"
        PARSED_HOST="${input#*@}"
    else
        PARSED_AGENT="$input"
        PARSED_HOST=""  # Empty = search all hosts
    fi
}

# Search for an agent across all enabled hosts
# First tries exact match, then falls back to fuzzy/partial search
# Usage: search_agent_all_hosts "agent-alias-or-id"
# Sets: SEARCH_RESULTS (JSON array), SEARCH_COUNT (number of matches), SEARCH_IS_FUZZY (0=exact, 1=fuzzy)
search_agent_all_hosts() {
    local agent_query="$1"
    local hosts_config="${HOME}/.aimaestro/hosts.json"

    SEARCH_RESULTS="[]"
    SEARCH_COUNT=0
    SEARCH_IS_FUZZY=0

    # Get list of all enabled hosts
    local hosts_json
    if [ -f "$hosts_config" ]; then
        hosts_json=$(jq -c '[.hosts[] | select(.enabled == true) | {id: .id, url: .url}]' "$hosts_config" 2>/dev/null)
    else
        # Only local host available
        local self_url
        self_url=$(get_self_host_url)
        local self_id
        self_id=$(get_self_host_id)
        hosts_json="[{\"id\": \"$self_id\", \"url\": \"$self_url\"}]"
    fi

    if [ -z "$hosts_json" ] || [ "$hosts_json" = "[]" ]; then
        echo "Error: No hosts configured" >&2
        return 1
    fi

    local results="[]"
    local host_count
    host_count=$(echo "$hosts_json" | jq 'length')

    # Phase 1: Try exact match on all hosts
    for i in $(seq 0 $((host_count - 1))); do
        local host_id
        local host_url
        host_id=$(echo "$hosts_json" | jq -r ".[$i].id")
        host_url=$(echo "$hosts_json" | jq -r ".[$i].url")

        # Query this host's resolve endpoint (exact match)
        local response
        response=$(curl -s --max-time 5 "${host_url}/api/messages?action=resolve&agent=${agent_query}" 2>/dev/null)

        if [ -n "$response" ]; then
            local resolved
            resolved=$(echo "$response" | jq -r '.resolved // empty' 2>/dev/null)

            if [ -n "$resolved" ] && [ "$resolved" != "null" ]; then
                # Found exact match on this host
                local agent_id alias name
                agent_id=$(echo "$response" | jq -r '.resolved.agentId // ""')
                alias=$(echo "$response" | jq -r '.resolved.alias // ""')
                name=$(echo "$response" | jq -r '.resolved.displayName // .resolved.alias // ""')

                results=$(echo "$results" | jq --arg hid "$host_id" --arg hurl "$host_url" \
                    --arg aid "$agent_id" --arg alias "$alias" --arg name "$name" \
                    '. + [{"hostId": $hid, "hostUrl": $hurl, "agentId": $aid, "alias": $alias, "name": $name, "matchType": "exact"}]')
            fi
        fi
    done

    # Check if we found exact matches
    local exact_count
    exact_count=$(echo "$results" | jq 'length')
    if [ "$exact_count" -gt 0 ]; then
        SEARCH_RESULTS="$results"
        SEARCH_COUNT="$exact_count"
        SEARCH_IS_FUZZY=0
        return 0
    fi

    # Phase 2: No exact match - try fuzzy search on all hosts
    SEARCH_IS_FUZZY=1
    for i in $(seq 0 $((host_count - 1))); do
        local host_id
        local host_url
        host_id=$(echo "$hosts_json" | jq -r ".[$i].id")
        host_url=$(echo "$hosts_json" | jq -r ".[$i].url")

        # Query this host's search endpoint (fuzzy match)
        local response
        response=$(curl -s --max-time 5 "${host_url}/api/messages?action=search&agent=${agent_query}" 2>/dev/null)

        if [ -n "$response" ]; then
            local search_count
            search_count=$(echo "$response" | jq -r '.count // 0' 2>/dev/null)

            if [ "$search_count" -gt 0 ]; then
                # Add all matches from this host
                local host_results
                host_results=$(echo "$response" | jq -c --arg hid "$host_id" --arg hurl "$host_url" \
                    '[.results[] | {hostId: $hid, hostUrl: $hurl, agentId: .agentId, alias: .alias, name: (.displayName // .alias // .name), matchType: "fuzzy"}]' 2>/dev/null)

                if [ -n "$host_results" ] && [ "$host_results" != "[]" ]; then
                    results=$(echo "$results" "$host_results" | jq -s 'add')
                fi
            fi
        fi
    done

    SEARCH_RESULTS="$results"
    SEARCH_COUNT=$(echo "$results" | jq 'length')

    return 0
}

# Resolve agent alias to agentId and hostId
# Supports: "alias", "alias@host", "agentId", "agentId@host"
# Usage: resolve_agent "alias-or-id[@host]"
# Sets: RESOLVED_AGENT_ID, RESOLVED_HOST_ID, RESOLVED_HOST_URL, RESOLVED_ALIAS, RESOLVED_NAME
#
# SMART LOOKUP: When no host is specified, searches ALL enabled hosts:
#   - If found on exactly 1 host → uses that host automatically
#   - If found on multiple hosts → returns error with disambiguation options
#   - If not found anywhere → returns helpful error
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

    # If no host specified, search all hosts
    if [ -z "$host_part" ]; then
        search_agent_all_hosts "$agent_part"

        if [ "$SEARCH_COUNT" -eq 0 ]; then
            echo "❌ Agent '${agent_part}' not found on any host" >&2
            echo "" >&2
            echo "Available hosts:" >&2
            list_hosts | sed 's/^/   /' >&2
            echo "" >&2
            echo "To see agents on a specific host, run:" >&2
            echo "   list-agents.sh [host-id]" >&2
            return 1
        elif [ "$SEARCH_COUNT" -eq 1 ]; then
            # Found exactly one match
            RESOLVED_AGENT_ID=$(echo "$SEARCH_RESULTS" | jq -r '.[0].agentId')
            RESOLVED_HOST_ID=$(echo "$SEARCH_RESULTS" | jq -r '.[0].hostId')
            RESOLVED_HOST_URL=$(echo "$SEARCH_RESULTS" | jq -r '.[0].hostUrl')
            RESOLVED_ALIAS=$(echo "$SEARCH_RESULTS" | jq -r '.[0].alias')
            RESOLVED_NAME=$(echo "$SEARCH_RESULTS" | jq -r '.[0].name')

            # If fuzzy match, show what we found (for transparency)
            if [ "$SEARCH_IS_FUZZY" -eq 1 ]; then
                echo "🔍 Found partial match: ${RESOLVED_ALIAS}@${RESOLVED_HOST_ID}" >&2
            fi
            return 0
        else
            # Multiple matches - show them all and ask for clarification
            if [ "$SEARCH_IS_FUZZY" -eq 1 ]; then
                echo "🔍 Found ${SEARCH_COUNT} partial matches for '${agent_part}':" >&2
            else
                echo "❌ Agent '${agent_part}' found on multiple hosts:" >&2
            fi
            echo "" >&2
            local i=0
            while [ $i -lt "$SEARCH_COUNT" ]; do
                local h_id h_alias h_name
                h_id=$(echo "$SEARCH_RESULTS" | jq -r ".[$i].hostId")
                h_alias=$(echo "$SEARCH_RESULTS" | jq -r ".[$i].alias")
                h_name=$(echo "$SEARCH_RESULTS" | jq -r ".[$i].name")
                echo "   ${h_alias}@${h_id}" >&2
                i=$((i + 1))
            done
            echo "" >&2
            echo "Please specify the full agent name:" >&2
            echo "   send-aimaestro-message.sh <agent-alias>@<host-id> ..." >&2
            return 1
        fi
    fi

    # Host was explicitly specified - query that host only
    local target_api
    target_api=$(get_host_url "$host_part" 2>/dev/null)

    if [ -z "$target_api" ]; then
        echo "❌ Unknown host '$host_part'" >&2
        echo "" >&2
        echo "Available hosts:" >&2
        list_hosts | sed 's/^/   /' >&2
        return 1
    fi

    # Query the target host's API to resolve the agent
    local response
    response=$(curl -s --max-time 10 "${target_api}/api/messages?action=resolve&agent=${agent_part}" 2>/dev/null)

    if [ -z "$response" ]; then
        echo "❌ Cannot connect to AI Maestro at ${target_api}" >&2
        return 1
    fi

    # Check if resolved object exists (API returns { resolved: { ... } })
    local resolved
    resolved=$(echo "$response" | jq -r '.resolved // empty' 2>/dev/null)

    if [ -z "$resolved" ] || [ "$resolved" = "null" ]; then
        echo "❌ Agent '${agent_part}' not found on host '${host_part}'" >&2
        echo "" >&2
        echo "To see agents on this host, run:" >&2
        echo "   list-agents.sh ${host_part}" >&2
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
    local my_host="${HOST_ID:-$(get_self_host_id)}"
    if [ -n "$RESOLVED_ALIAS" ] && [ "$RESOLVED_ALIAS" != "null" ]; then
        echo "${RESOLVED_ALIAS}@${my_host}"
    else
        echo "${AGENT_ID}@${my_host}"
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
