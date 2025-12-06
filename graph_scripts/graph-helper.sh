#!/bin/bash
# AI Maestro Graph Helper Functions
# Shared utilities for graph query scripts

API_BASE="http://localhost:23000"

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

# Get the agent UUID for the current tmux session
get_agent_id() {
    local session="$1"
    local response
    local agent_id

    response=$(curl -s "${API_BASE}/api/agents" 2>/dev/null)
    if [ -z "$response" ]; then
        echo "Error: Cannot connect to AI Maestro at ${API_BASE}" >&2
        return 1
    fi

    # Extract agent ID where currentSession matches our tmux session
    agent_id=$(echo "$response" | jq -r ".agents[] | select(.currentSession == \"$session\") | .id" 2>/dev/null)

    if [ -z "$agent_id" ] || [ "$agent_id" = "null" ]; then
        echo "Error: No agent found for session '$session'" >&2
        echo "Hint: Run 'register-agent-from-session.mjs' to register this session" >&2
        return 1
    fi

    echo "$agent_id"
}

# Make a graph query API call
graph_query() {
    local agent_id="$1"
    local query_type="$2"
    shift 2
    local params="$@"

    local url="${API_BASE}/api/agents/${agent_id}/graph/query?q=${query_type}${params}"

    local response
    response=$(curl -s --max-time 10 "$url" 2>/dev/null)

    if [ -z "$response" ]; then
        echo "Error: API request failed" >&2
        return 1
    fi

    # Check for success
    local success
    success=$(echo "$response" | jq -r '.success' 2>/dev/null)

    if [ "$success" != "true" ]; then
        local error
        error=$(echo "$response" | jq -r '.error // "Unknown error"' 2>/dev/null)
        echo "Error: $error" >&2
        return 1
    fi

    echo "$response"
}

# Format and display results nicely
format_result() {
    local response="$1"
    echo "$response" | jq '.result' 2>/dev/null
}

# Check if jq is available
check_jq() {
    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required but not installed" >&2
        echo "Install with: brew install jq" >&2
        return 1
    fi
}

# Initialize - get session and agent ID
init_graph() {
    check_jq || return 1

    SESSION=$(get_session) || return 1
    AGENT_ID=$(get_agent_id "$SESSION") || return 1

    export SESSION
    export AGENT_ID
}
