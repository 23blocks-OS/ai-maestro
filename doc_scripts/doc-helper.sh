#!/bin/bash
# AI Maestro Documentation Helper Functions
# Sources common utilities and adds doc-specific functions

# Source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh"

# Make a doc query API call
doc_query() {
    local agent_id="$1"
    local action="$2"
    shift 2
    local params="$@"

    api_query "GET" "/api/agents/${agent_id}/docs?action=${action}${params}"
}

# Initialize - get session and agent ID
init_doc() {
    init_common || return 1
}
