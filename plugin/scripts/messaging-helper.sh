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

# Message directories use AMP per-agent directories
get_inbox_dir() {
    local agent_id="$1"
    echo "${HOME}/.agent-messaging/agents/${agent_id}/messages/inbox"
}

get_sent_dir() {
    local agent_id="$1"
    echo "${HOME}/.agent-messaging/agents/${agent_id}/messages/sent"
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

    # Get list of all enabled hosts, always including localhost
    local hosts_json
    if [ -f "$hosts_config" ]; then
        hosts_json=$(jq -c '[.hosts[] | select(.enabled == true) | {id: .id, url: .url}]' "$hosts_config" 2>/dev/null)
    else
        hosts_json="[]"
    fi

    # Always ensure localhost:23000 is in the search list (v0.21.25 fix).
    # hosts.json may only contain remote/Tailscale entries (e.g. mac-mini at
    # 100.80.12.6:23000) without an explicit localhost entry. Without this
    # injection, agents on the local machine would not be found when searching
    # "all hosts". We probe the local API to get its actual host ID so the
    # search results include the correct hostId for disambiguation.
    local localhost_url="http://localhost:23000"
    local has_localhost
    has_localhost=$(echo "$hosts_json" | jq --arg u "$localhost_url" '[.[] | select(.url == $u)] | length' 2>/dev/null)
    if [ "${has_localhost:-0}" -eq 0 ]; then
        # Probe localhost to get its host ID
        local local_identity
        local_identity=$(curl -s --max-time 3 "${localhost_url}/api/hosts/identity" 2>/dev/null)
        if [ -n "$local_identity" ]; then
            local local_id
            local_id=$(echo "$local_identity" | jq -r '.host.id // "localhost"' 2>/dev/null)
            hosts_json=$(echo "$hosts_json" | jq --arg id "$local_id" --arg url "$localhost_url" \
                '. + [{"id": $id, "url": $url}]' 2>/dev/null)
        fi
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

# NOTE (v0.21.25): resolve_agent() was removed from this file and consolidated
# into agent-helper.sh as a single unified resolver for all scripts.
#
# Previously, this file defined its own resolve_agent() that ONLY did multi-host
# search (via search_agent_all_hosts above), while agent-helper.sh had a separate
# resolve_agent_simple() that ONLY did local search. This caused:
#   - The HOST_URLS unbound variable crash (GitHub issue #190)
#   - Inconsistent error messages between commands
#   - localhost not being searched when hosts.json only had remote entries
#
# The unified resolve_agent() in agent-helper.sh now:
#   1. Tries local /api/agents first (fast, covers CLI commands)
#   2. Falls back to search_agent_all_hosts() (defined above) for multi-host
#   3. Sets all globals needed by both CLI and messaging functions
#
# Functions below (get_my_name, send_message) call resolve_agent() which is
# defined in agent-helper.sh. This works because bash resolves function names
# at call time, not at source time — and agent-helper.sh finishes loading
# after this file is sourced.

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

    # Ensure AMP per-agent message directories exist
    mkdir -p "$(get_inbox_dir "$AGENT_ID")"
    mkdir -p "$(get_sent_dir "$AGENT_ID")"
}
