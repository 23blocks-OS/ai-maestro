#!/bin/bash
# AI Maestro Graph Helper Functions
# Sources common utilities and adds graph-specific functions

# Source common helpers - try installed location first, then repo location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${HOME}/.local/share/aimaestro/shell-helpers/common.sh" ]; then
    source "${HOME}/.local/share/aimaestro/shell-helpers/common.sh"
elif [ -f "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh" ]; then
    source "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh"
else
    echo "Error: common.sh not found. Run install-graph-tools.sh to fix." >&2
    exit 1
fi

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
