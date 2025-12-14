#!/bin/bash
# AI Maestro Memory Search Helper Functions
# Sources common utilities and adds memory-specific functions

# Source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh"

# Make a memory search API call
memory_query() {
    local agent_id="$1"
    shift
    local params="$@"

    api_query "GET" "/api/agents/${agent_id}/search?${params}"
}

# Initialize - get session and agent ID
init_memory() {
    init_common || return 1
}
