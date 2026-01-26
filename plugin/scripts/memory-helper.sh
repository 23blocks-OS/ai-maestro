#!/bin/bash
# AI Maestro Memory Search Helper Functions
# Sources common utilities and adds memory-specific functions

# Source common helpers - try installed location first, then repo location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${HOME}/.local/share/aimaestro/shell-helpers/common.sh" ]; then
    source "${HOME}/.local/share/aimaestro/shell-helpers/common.sh"
elif [ -f "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh" ]; then
    source "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh"
else
    echo "Error: common.sh not found. Run install-memory-tools.sh to fix." >&2
    exit 1
fi

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
