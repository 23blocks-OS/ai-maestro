#!/bin/bash
# AI Maestro - Centralized Agent Helper
# Source this file in other scripts: source "$(dirname "$0")/agent-helper.sh"
#
# Provides:
#   - get_current_session: Get current tmux session name
#   - resolve_agent <identifier>: Resolve any agent identifier to full info
#   - get_current_agent: Get current agent info (ID, alias, hostUrl)
#   - AGENT_ID, AGENT_ALIAS, AGENT_HOST_URL: Exported after init_agent
#
# All resolution is done via the API to ensure consistency across hosts

# Default API base - can be overridden
AIMAESTRO_API_BASE="${AIMAESTRO_API_BASE:-http://localhost:23000}"

# Check if jq is available
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        echo "Error: jq is required but not installed" >&2
        echo "Install with: brew install jq" >&2
        return 1
    fi
    if ! command -v curl &> /dev/null; then
        echo "Error: curl is required but not installed" >&2
        return 1
    fi
}

# Get the current tmux session name
get_current_session() {
    local session
    session=$(tmux display-message -p '#S' 2>/dev/null)
    if [ -z "$session" ]; then
        echo "Error: Not running in a tmux session" >&2
        return 1
    fi
    echo "$session"
}

# Resolve an agent identifier (alias, ID, session name) to full info
# Returns JSON with: agentId, alias, displayName, sessionName, hostId, hostUrl
# Usage: resolve_agent "crm" or resolve_agent "23blocks-api-crm"
resolve_agent() {
    local identifier="$1"

    if [ -z "$identifier" ]; then
        echo "Error: No identifier provided" >&2
        return 1
    fi

    local response
    response=$(curl -s "${AIMAESTRO_API_BASE}/api/messages?agent=${identifier}&action=resolve" 2>/dev/null)

    if [ -z "$response" ]; then
        echo "Error: Cannot connect to AI Maestro at ${AIMAESTRO_API_BASE}" >&2
        return 1
    fi

    # Check if resolution was successful
    local resolved
    resolved=$(echo "$response" | jq -r '.resolved // empty' 2>/dev/null)

    if [ -z "$resolved" ] || [ "$resolved" = "null" ]; then
        echo "Error: Could not resolve agent '$identifier'" >&2
        return 1
    fi

    echo "$response" | jq '.resolved'
}

# Get a specific field from resolved agent
# Usage: get_agent_field "crm" "agentId"
get_agent_field() {
    local identifier="$1"
    local field="$2"

    local resolved
    resolved=$(resolve_agent "$identifier") || return 1

    echo "$resolved" | jq -r ".$field // empty"
}

# Get current agent info based on current tmux session
# Exports: AGENT_ID, AGENT_ALIAS, AGENT_SESSION, AGENT_HOST_ID, AGENT_HOST_URL
get_current_agent() {
    local session
    session=$(get_current_session) || return 1

    local resolved
    resolved=$(resolve_agent "$session")

    if [ $? -ne 0 ] || [ -z "$resolved" ]; then
        echo "Error: Could not resolve current session '$session' to an agent" >&2
        echo "" >&2
        echo "This session may not be registered as an agent." >&2
        echo "Run: register-agent-from-session.mjs $session" >&2
        return 1
    fi

    AGENT_ID=$(echo "$resolved" | jq -r '.agentId // empty')
    AGENT_ALIAS=$(echo "$resolved" | jq -r '.alias // empty')
    AGENT_SESSION=$(echo "$resolved" | jq -r '.sessionName // empty')
    AGENT_HOST_ID=$(echo "$resolved" | jq -r '.hostId // "local"')
    AGENT_HOST_URL=$(echo "$resolved" | jq -r '.hostUrl // "http://localhost:23000"')

    export AGENT_ID AGENT_ALIAS AGENT_SESSION AGENT_HOST_ID AGENT_HOST_URL
}

# Initialize - check deps and get current agent
# Usage: init_agent || exit 1
init_agent() {
    check_dependencies || return 1
    get_current_agent || return 1
}

# Resolve target agent (for sending messages, etc.)
# Handles qualified names like "alias@hostId"
# Returns: agentId hostId hostUrl (space-separated for easy parsing)
resolve_target_agent() {
    local target="$1"

    # Check for qualified name format (identifier@hostId)
    if [[ "$target" == *"@"* ]]; then
        local identifier="${target%@*}"
        local target_host_id="${target#*@}"

        # Get host info
        local host_info
        host_info=$(curl -s "${AIMAESTRO_API_BASE}/api/hosts/${target_host_id}" 2>/dev/null)
        local host_url
        host_url=$(echo "$host_info" | jq -r '.url // empty' 2>/dev/null)

        if [ -z "$host_url" ]; then
            echo "Error: Could not find host '$target_host_id'" >&2
            return 1
        fi

        # Resolve agent on that host
        local resolved
        resolved=$(curl -s "${host_url}/api/messages?agent=${identifier}&action=resolve" 2>/dev/null)
        local agent_id
        agent_id=$(echo "$resolved" | jq -r '.resolved.agentId // empty' 2>/dev/null)

        if [ -z "$agent_id" ]; then
            echo "Error: Could not resolve agent '$identifier' on host '$target_host_id'" >&2
            return 1
        fi

        echo "$agent_id $target_host_id $host_url"
    else
        # Local resolution
        local resolved
        resolved=$(resolve_agent "$target") || return 1

        local agent_id host_id host_url
        agent_id=$(echo "$resolved" | jq -r '.agentId')
        host_id=$(echo "$resolved" | jq -r '.hostId // "local"')
        host_url=$(echo "$resolved" | jq -r '.hostUrl // "http://localhost:23000"')

        echo "$agent_id $host_id $host_url"
    fi
}

# Print available agents (for error messages)
list_available_agents() {
    echo "Available agents:" >&2
    curl -s "${AIMAESTRO_API_BASE}/api/agents" 2>/dev/null | \
        jq -r '.agents[] | "  - \(.alias) [\(.session.hostId // "local")]"' 2>/dev/null >&2
}
