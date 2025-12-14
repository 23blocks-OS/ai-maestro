#!/bin/bash
# AI Maestro Graph Helper Functions
# Sources common utilities and adds graph-specific functions

# Source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh"

# Make a graph query API call
graph_query() {
    local agent_id="$1"
    local query_type="$2"
    shift 2
    local params="$@"

    api_query "GET" "/api/agents/${agent_id}/graph/query?q=${query_type}${params}"
}

# Initialize - get session and agent ID
init_graph() {
    init_common || return 1
}
