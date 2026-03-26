#!/bin/bash
# AI Maestro - Get documentation index statistics
# Usage: docs-stats.sh

set -e

# Show help
show_help() {
    echo "Usage: docs-stats.sh"
    echo ""
    echo "Display statistics for an agent's documentation index."
    echo ""
    echo "Queries the AI Maestro docs subsystem and returns index metrics"
    echo "such as document count, total size, and indexing status for the"
    echo "current agent (auto-detected from the active tmux session)."
    echo ""
    echo "Options:"
    echo "  --help, -h    Show this help"
    echo ""
    echo "Use Cases:"
    echo "  Check index health     Verify docs are indexed and up to date"
    echo "  Monitor doc coverage   See how many documents are tracked"
    echo "  Debug search issues    Confirm the index has expected entries"
    echo ""
    echo "Examples:"
    echo "  docs-stats.sh          # Show stats for current agent"
    echo ""
    echo "Environment Variables:"
    echo "  AIMAESTRO_API   API endpoint (auto-detected from running instance)"
    echo "  SESSION_NAME    Override auto-detected tmux session name"
}

# Handle --help flag early
[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && show_help && exit 0

# Source docs helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docs-helper.sh"

# Initialize (gets SESSION, AGENT_ID, HOST_ID)
init_docs || exit 1

RESPONSE=$(docs_stats "$AGENT_ID")

if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "Error: $ERROR" >&2
  exit 1
fi

echo "Documentation Index Statistics"
echo "=============================="
echo ""

echo "$RESPONSE" | jq -r '.result | to_entries[] | "\(.key): \(.value)"'
