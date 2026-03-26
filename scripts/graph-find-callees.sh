#!/bin/bash
# AI Maestro - Find all functions called by a given function
# Usage: graph-find-callees.sh <function-name>
# Example: graph-find-callees.sh process_payment
#          graph-find-callees.sh handle_request

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

show_help() {
  cat <<'HELP'
Usage: graph-find-callees.sh <function-name>

Find all functions called by a given function (outgoing call edges).

Commands:
  graph-find-callees.sh <name>    List all functions that <name> calls

Arguments:
  <function-name>    Name of the function to inspect (case-sensitive)

Options:
  --help, -h    Show this help

Use Cases:
  Understand a function's dependencies:          graph-find-callees.sh process_payment
  Map the downstream call tree of a handler:     graph-find-callees.sh handle_request
  Check what a function touches before editing:  graph-find-callees.sh validate_input

Examples:
  graph-find-callees.sh process_payment
  graph-find-callees.sh handle_request
  graph-find-callees.sh create_order
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

echo "Finding functions called by: $NAME"
echo "---"

# Make the query
RESPONSE=$(graph_query "$AGENT_ID" "find-callees" "&name=${NAME}") || exit 1

# Extract and display results
RESULT=$(echo "$RESPONSE" | jq '.result')
COUNT=$(echo "$RESULT" | jq -r '.count')

if [ "$COUNT" = "0" ]; then
    echo "No callees found for '$NAME'"
    echo ""
    echo "This could mean:"
    echo "  - The function doesn't call any other tracked functions"
    echo "  - The function name doesn't match exactly"
    echo "  - The codebase hasn't been fully indexed"
else
    echo "Found $COUNT function(s) called:"
    echo ""
    echo "$RESULT" | jq -r '.callees[] | "  \(.name)\n    File: \(.file)\n"'
fi
