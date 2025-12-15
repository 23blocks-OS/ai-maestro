#!/bin/bash
# AI Maestro Common Shell Helper Functions
# Shared utilities for all agent scripts
#
# Usage: source "$(dirname "$0")/../scripts/shell-helpers/common.sh"
# Or for installed scripts: source ~/.local/share/aimaestro/shell-helpers/common.sh

API_BASE="${AIMAESTRO_API_BASE:-http://localhost:23000}"
HOSTS_CONFIG="${HOME}/.aimaestro/hosts.json"

# Load hosts configuration and provide lookup functions
# Populates HOSTS_LOADED array with host data
declare -A HOST_URLS
declare -A HOST_NAMES

load_hosts_config() {
    if [ ! -f "$HOSTS_CONFIG" ]; then
        # No config file, only local host available
        HOST_URLS["local"]="http://localhost:23000"
        HOST_NAMES["local"]="local"
        return 0
    fi

    # Parse hosts.json and populate associative arrays
    local hosts_json
    hosts_json=$(cat "$HOSTS_CONFIG" 2>/dev/null)

    if [ -z "$hosts_json" ]; then
        HOST_URLS["local"]="http://localhost:23000"
        HOST_NAMES["local"]="local"
        return 0
    fi

    # Extract each host's id, name, and url
    local count
    count=$(echo "$hosts_json" | jq '.hosts | length' 2>/dev/null)

    for ((i=0; i<count; i++)); do
        local id name url enabled
        id=$(echo "$hosts_json" | jq -r ".hosts[$i].id" 2>/dev/null)
        name=$(echo "$hosts_json" | jq -r ".hosts[$i].name" 2>/dev/null)
        url=$(echo "$hosts_json" | jq -r ".hosts[$i].url" 2>/dev/null)
        enabled=$(echo "$hosts_json" | jq -r ".hosts[$i].enabled" 2>/dev/null)

        if [ "$enabled" = "true" ] && [ -n "$id" ] && [ -n "$url" ]; then
            HOST_URLS["$id"]="$url"
            HOST_NAMES["$id"]="$name"
            # Also index by name for convenience
            HOST_URLS["$name"]="$url"
        fi
    done

    # Ensure local is always available
    if [ -z "${HOST_URLS["local"]}" ]; then
        HOST_URLS["local"]="http://localhost:23000"
        HOST_NAMES["local"]="local"
    fi
}

# Get URL for a host by id or name
# Usage: get_host_url "mac-mini" or get_host_url "local"
get_host_url() {
    local host_id="$1"

    # Load config if not already loaded
    if [ ${#HOST_URLS[@]} -eq 0 ]; then
        load_hosts_config
    fi

    local url="${HOST_URLS[$host_id]}"
    if [ -n "$url" ]; then
        echo "$url"
        return 0
    fi

    echo "Error: Unknown host '$host_id'" >&2
    echo "Available hosts: ${!HOST_URLS[*]}" >&2
    return 1
}

# Check if a host exists
host_exists() {
    local host_id="$1"

    if [ ${#HOST_URLS[@]} -eq 0 ]; then
        load_hosts_config
    fi

    [ -n "${HOST_URLS[$host_id]}" ]
}

# List all available hosts
list_hosts() {
    if [ ${#HOST_URLS[@]} -eq 0 ]; then
        load_hosts_config
    fi

    for host_id in "${!HOST_NAMES[@]}"; do
        echo "$host_id: ${HOST_URLS[$host_id]}"
    done
}

# Get the current tmux session name
get_session() {
    local session
    session=$(tmux display-message -p '#S' 2>/dev/null)
    if [ -z "$session" ]; then
        echo "Error: Not running in a tmux session" >&2
        return 1
    fi
    echo "$session"
}

# Parse structured session name: agentId@hostId (like email)
# Sets global variables: AGENT_ID and HOST_ID
# Returns 0 if structured format, 1 if legacy format
parse_session_name() {
    local session="$1"

    # Check if session uses structured format (contains @)
    if [[ "$session" == *"@"* ]]; then
        AGENT_ID="${session%%@*}"
        HOST_ID="${session#*@}"
        return 0
    fi

    # Legacy format - need to lookup
    return 1
}

# Get the agent UUID for the current tmux session
# First tries to parse from structured session name, falls back to API lookup
get_agent_id() {
    local session="$1"

    # Try parsing structured format first (no API call needed)
    if parse_session_name "$session"; then
        echo "$AGENT_ID"
        return 0
    fi

    # Fallback: API lookup for legacy session names
    local response
    local agent_id

    response=$(curl -s "${API_BASE}/api/agents" 2>/dev/null)
    if [ -z "$response" ]; then
        echo "Error: Cannot connect to AI Maestro at ${API_BASE}" >&2
        return 1
    fi

    agent_id=$(echo "$response" | jq -r ".agents[] | select(.session.tmuxSessionName == \"$session\") | .id" 2>/dev/null | head -1)

    if [ -z "$agent_id" ] || [ "$agent_id" = "null" ]; then
        echo "Error: No agent found for session '$session'" >&2
        echo "Session format should be: agentId@hostId (e.g., my-agent@local)" >&2
        echo "Run 'register-agent-from-session.mjs' to register and rename this session" >&2
        return 1
    fi

    AGENT_ID="$agent_id"
    HOST_ID="local"
    echo "$agent_id"
}

# Check if jq is available
check_jq() {
    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required but not installed" >&2
        echo "Install with: brew install jq" >&2
        return 1
    fi
}

# Initialize common variables - get session and agent ID
# Sets: SESSION, AGENT_ID, HOST_ID
init_common() {
    check_jq || return 1

    SESSION=$(get_session) || return 1
    AGENT_ID=$(get_agent_id "$SESSION") || return 1

    export SESSION
    export AGENT_ID
    export HOST_ID
}

# Make an API query with common error handling
# Usage: api_query "GET" "/api/agents/${AGENT_ID}/endpoint" [extra_curl_args...]
api_query() {
    local method="$1"
    local endpoint="$2"
    shift 2
    local extra_args=("$@")

    local url="${API_BASE}${endpoint}"
    local response

    response=$(curl -s --max-time 30 -X "$method" "${extra_args[@]}" "$url" 2>/dev/null)

    if [ -z "$response" ]; then
        echo "Error: API request failed" >&2
        return 1
    fi

    # Check for success field in response
    local success
    success=$(echo "$response" | jq -r '.success // "true"' 2>/dev/null)

    if [ "$success" = "false" ]; then
        local error
        error=$(echo "$response" | jq -r '.error // "Unknown error"' 2>/dev/null)
        echo "Error: $error" >&2
        return 1
    fi

    echo "$response"
}

# Format and display JSON results nicely
format_result() {
    local response="$1"
    local field="${2:-.result}"
    echo "$response" | jq "$field" 2>/dev/null
}
