#!/bin/bash
# AI Maestro Graph Helper Functions
# Shared utilities for graph query scripts
#
# Sources the centralized agent-helper.sh for agent resolution

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the centralized agent helper
AGENT_HELPER="${SCRIPT_DIR}/../scripts/agent-helper.sh"
if [ -f "$AGENT_HELPER" ]; then
    source "$AGENT_HELPER"
elif [ -f ~/.local/bin/agent-helper.sh ]; then
    source ~/.local/bin/agent-helper.sh
else
    echo "Error: agent-helper.sh not found" >&2
    echo "Expected at: $AGENT_HELPER or ~/.local/bin/agent-helper.sh" >&2
    exit 1
fi

# Make a graph query API call
# Uses AGENT_HOST_URL from agent-helper.sh
graph_query() {
    local agent_id="$1"
    local query_type="$2"
    shift 2
    local params="$@"

    # Use the agent's host URL (could be remote)
    local api_base="${AGENT_HOST_URL:-http://localhost:23000}"
    local url="${api_base}/api/agents/${agent_id}/graph/query?q=${query_type}${params}"

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

# Initialize - get current agent info
# Exports: AGENT_ID, AGENT_ALIAS, AGENT_SESSION, AGENT_HOST_ID, AGENT_HOST_URL
init_graph() {
    init_agent || return 1

    # For backward compatibility, also export SESSION
    SESSION="$AGENT_SESSION"
    export SESSION
}
