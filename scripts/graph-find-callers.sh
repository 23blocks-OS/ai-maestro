#!/bin/bash
# AI Maestro - Find all functions that call a given function
# Usage: graph-find-callers.sh <function-name>
# Example: graph-find-callers.sh authenticate
#          graph-find-callers.sh process_payment

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

show_help() {
  cat <<'HELP'
Usage: graph-find-callers.sh <function-name>

Find all functions that call a given function (incoming call edges).

Commands:
  graph-find-callers.sh <name>    List all functions that call <name>

Arguments:
  <function-name>    Name of the function to inspect (case-sensitive)

Options:
  --help, -h    Show this help

Use Cases:
  Impact analysis before modifying a function:  graph-find-callers.sh authenticate
  Find all entry points into a function:        graph-find-callers.sh process_payment
  Check if a function is unused (dead code):    graph-find-callers.sh legacy_handler

Examples:
  graph-find-callers.sh authenticate
  graph-find-callers.sh process_payment
  graph-find-callers.sh validate_token
HELP
  exit 0
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && show_help

if [ -z "$1" ]; then
    show_help
fi

NAME="$1"

# Initialize (gets SESSION and AGENT_ID)
init_graph || exit 1

echo "Finding callers of: $NAME"
echo "---"

# Make the query
RESPONSE=$(graph_query "$AGENT_ID" "find-callers" "&name=${NAME}") || exit 1

# Extract and display results
RESULT=$(echo "$RESPONSE" | jq '.result')
COUNT=$(echo "$RESULT" | jq -r '.count')

if [ "$COUNT" = "0" ]; then
    echo "No callers found for '$NAME'"
    echo ""
    echo "This could mean:"
    echo "  - The function is not called anywhere (entry point or unused)"
    echo "  - The function name doesn't match exactly"
    echo "  - The codebase hasn't been fully indexed"
else
    echo "Found $COUNT caller(s):"
    echo ""
    echo "$RESULT" | jq -r '.callers[] | "  \(.name)\n    File: \(.file)\n"'
fi
