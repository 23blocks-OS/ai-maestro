#!/bin/bash
# AI Maestro Common Shell Helper Functions
# Shared utilities for all agent scripts
#
# Usage: source "$(dirname "$0")/../scripts/shell-helpers/common.sh"
# Or for installed scripts: source ~/.local/share/aimaestro/shell-helpers/common.sh

HOSTS_CONFIG="${HOME}/.aimaestro/hosts.json"

# Hosts config is cached in a simple format (no associative arrays for compatibility)
_HOSTS_LOADED=""
_SELF_HOST_ID=""
_SELF_HOST_URL=""

# Get this machine's host ID and URL from the identity API or hosts.json
# Sets: _SELF_HOST_ID, _SELF_HOST_URL
_init_self_host() {
    # Already initialized
    if [ -n "$_SELF_HOST_ID" ]; then
        return 0
    fi

    # Try identity API first (most reliable)
    local identity
    identity=$(curl -s --max-time 5 "http://127.0.0.1:23000/api/hosts/identity" 2>/dev/null)
    if [ -n "$identity" ]; then
        _SELF_HOST_ID=$(echo "$identity" | jq -r '.host.id // empty' 2>/dev/null)
        _SELF_HOST_URL=$(echo "$identity" | jq -r '.host.url // empty' 2>/dev/null)
        if [ -n "$_SELF_HOST_ID" ] && [ -n "$_SELF_HOST_URL" ]; then
            return 0
        fi
    fi

    # Fallback: Find local host in hosts.json
    if [ -f "$HOSTS_CONFIG" ]; then
        local local_host
        local_host=$(jq -r '.hosts[] | select(.type == "local") | "\(.id)|\(.url)"' "$HOSTS_CONFIG" 2>/dev/null | head -1)
        if [ -n "$local_host" ]; then
            _SELF_HOST_ID="${local_host%%|*}"
            _SELF_HOST_URL="${local_host#*|}"
            return 0
        fi
    fi

    # Last resort: Use hostname
    _SELF_HOST_ID=$(hostname | tr '[:upper:]' '[:lower:]')
    _SELF_HOST_URL="http://${_SELF_HOST_ID}:23000"
}

# Get self host ID (this machine)
get_self_host_id() {
    _init_self_host
    echo "$_SELF_HOST_ID"
}

# Get self host URL (this machine)
get_self_host_url() {
    _init_self_host
    echo "$_SELF_HOST_URL"
}

# API_BASE - dynamically determined, never localhost
get_api_base() {
    if [ -n "$AIMAESTRO_API_BASE" ]; then
        echo "$AIMAESTRO_API_BASE"
    else
        get_self_host_url
    fi
}

# For backwards compatibility - use function instead
API_BASE="${AIMAESTRO_API_BASE:-}"

# Get URL for a host by id or name using jq (no associative arrays needed)
# Usage: get_host_url "mac-mini" or get_host_url "juans-mbp"
get_host_url() {
    local host_id="$1"
    _init_self_host

    # Check if this is the self host (case-insensitive)
    local host_id_lower=$(echo "$host_id" | tr '[:upper:]' '[:lower:]')
    local self_id_lower=$(echo "$_SELF_HOST_ID" | tr '[:upper:]' '[:lower:]')

    # BACKWARDS COMPATIBILITY: "local" always means this machine
    if [ "$host_id_lower" = "local" ]; then
        echo "$_SELF_HOST_URL"
        return 0
    fi

    if [ "$host_id_lower" = "$self_id_lower" ]; then
        echo "$_SELF_HOST_URL"
        return 0
    fi

    # No config file means only self is available
    if [ ! -f "$HOSTS_CONFIG" ]; then
        echo "Error: Unknown host '$host_id' (no hosts.json config)" >&2
        return 1
    fi

    # Query the hosts.json directly with jq (case-insensitive)
    local url
    url=$(jq -r --arg id "$host_id_lower" '.hosts[] | select((.id | ascii_downcase) == $id and .enabled == true) | .url' "$HOSTS_CONFIG" 2>/dev/null | head -1)

    # Try matching by name if id didn't work
    if [ -z "$url" ] || [ "$url" = "null" ]; then
        url=$(jq -r --arg name "$host_id" '.hosts[] | select((.name | ascii_downcase) == ($name | ascii_downcase) and .enabled == true) | .url' "$HOSTS_CONFIG" 2>/dev/null | head -1)
    fi

    if [ -n "$url" ] && [ "$url" != "null" ]; then
        echo "$url"
        return 0
    fi

    echo "Error: Unknown host '$host_id'" >&2
    return 1
}

# Check if a host exists
host_exists() {
    local host_id="$1"
    get_host_url "$host_id" >/dev/null 2>&1
}

# Check if a host ID refers to this machine (handles "local" for backwards compatibility)
is_self_host() {
    local host_id="$1"
    _init_self_host

    local host_id_lower=$(echo "$host_id" | tr '[:upper:]' '[:lower:]')
    local self_id_lower=$(echo "$_SELF_HOST_ID" | tr '[:upper:]' '[:lower:]')

    # BACKWARDS COMPATIBILITY: "local" always means this machine
    if [ "$host_id_lower" = "local" ]; then
        return 0
    fi

    # Check against actual self host ID
    if [ "$host_id_lower" = "$self_id_lower" ]; then
        return 0
    fi

    return 1
}

# List all available hosts
list_hosts() {
    _init_self_host
    echo "${_SELF_HOST_ID}: ${_SELF_HOST_URL} (this machine)"

    if [ -f "$HOSTS_CONFIG" ]; then
        # List remote hosts only (not the local one, and not legacy "local" entries)
        jq -r --arg self "$_SELF_HOST_ID" '.hosts[] | select(.enabled == true and (.id | ascii_downcase) != ($self | ascii_downcase) and (.id | ascii_downcase) != "local" and .type != "local") | "\(.id): \(.url)"' "$HOSTS_CONFIG" 2>/dev/null
    fi
}

# Legacy function for compatibility - now a no-op since we query directly
load_hosts_config() {
    _HOSTS_LOADED="1"
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
    local api_url
    api_url=$(get_api_base)

    response=$(curl -s "${api_url}/api/agents" 2>/dev/null)
    if [ -z "$response" ]; then
        echo "Error: Cannot connect to AI Maestro at ${api_url}" >&2
        return 1
    fi

    agent_id=$(echo "$response" | jq -r ".agents[] | select(.session.tmuxSessionName == \"$session\") | .id" 2>/dev/null | head -1)

    if [ -z "$agent_id" ] || [ "$agent_id" = "null" ]; then
        echo "Error: No agent found for session '$session'" >&2
        echo "Session format should be: agentId@hostId (e.g., my-agent@my-hostname)" >&2
        echo "Run 'register-agent-from-session.mjs' to register and rename this session" >&2
        return 1
    fi

    AGENT_ID="$agent_id"
    HOST_ID=$(get_self_host_id)
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

    # Try parsing structured format first (agent@host) - sets AGENT_ID and HOST_ID directly
    if parse_session_name "$SESSION"; then
        # Structured format parsed successfully
        :
    else
        # Legacy format - need API lookup
        AGENT_ID=$(get_agent_id "$SESSION") || return 1
        HOST_ID=$(get_self_host_id)  # Legacy sessions are on this machine
    fi

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

    local api_base
    api_base=$(get_api_base)
    local url="${api_base}${endpoint}"
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
