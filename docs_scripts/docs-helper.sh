#!/bin/bash
# AI Maestro Documentation Helper Functions
# Sources common utilities and adds docs-specific functions

# Source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../scripts/shell-helpers/common.sh"

# Make a docs query API call
docs_query() {
    local agent_id="$1"
    local action="$2"
    shift 2
    local params="$@"

    api_query "GET" "/api/agents/${agent_id}/docs?action=${action}${params}"
}

# Index documentation
docs_index() {
    local agent_id="$1"
    local project_path="$2"

    local body="{}"
    if [ -n "$project_path" ]; then
        body=$(jq -n --arg path "$project_path" '{"projectPath": $path}')
    fi

    api_query "POST" "/api/agents/${agent_id}/docs" -H "Content-Type: application/json" -d "$body"
}

# Search documentation
docs_search() {
    local agent_id="$1"
    local query="$2"
    local limit="${3:-10}"
    local keyword_mode="${4:-false}"

    local encoded_query
    encoded_query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))" 2>/dev/null || echo "$query")

    if [ "$keyword_mode" = "true" ]; then
        api_query "GET" "/api/agents/${agent_id}/docs?action=search&keyword=${encoded_query}&limit=${limit}"
    else
        api_query "GET" "/api/agents/${agent_id}/docs?action=search&q=${encoded_query}&limit=${limit}"
    fi
}

# Get documentation stats
docs_stats() {
    local agent_id="$1"
    docs_query "$agent_id" "stats"
}

# List documentation
docs_list() {
    local agent_id="$1"
    local doc_type="${2:-}"

    if [ -n "$doc_type" ]; then
        docs_query "$agent_id" "list" "&type=${doc_type}"
    else
        docs_query "$agent_id" "list"
    fi
}

# Get specific document
docs_get() {
    local agent_id="$1"
    local doc_id="$2"
    docs_query "$agent_id" "get" "&id=${doc_id}"
}

# Find by type
docs_find_by_type() {
    local agent_id="$1"
    local doc_type="$2"
    docs_query "$agent_id" "find" "&type=${doc_type}"
}

# Initialize docs - get session and agent ID
init_docs() {
    init_common || return 1
}
