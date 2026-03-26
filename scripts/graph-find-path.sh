#!/bin/bash
# AI Maestro - Find the call path between two functions
# Usage: graph-find-path.sh <from-function> <to-function>
# Example: graph-find-path.sh create_order send_email
#          graph-find-path.sh login authenticate

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

show_help() {
  cat <<'HELP'
Usage: graph-find-path.sh <from-function> <to-function>

Find the call path between two functions in the code graph.

Commands:
  graph-find-path.sh <from> <to>    Trace all call paths from <from> to <to> (max 5 hops)

Arguments:
  <from-function>    Starting function name (case-sensitive)
  <to-function>      Target function name (case-sensitive)

Options:
  --help, -h    Show this help

Use Cases:
  Trace how an action triggers a side effect:    graph-find-path.sh create_order send_email
  Debug an unexpected call chain:                graph-find-path.sh login authenticate
  Verify data flow between two endpoints:        graph-find-path.sh handle_webhook update_inventory
  Understand coupling between modules:           graph-find-path.sh parse_request validate_schema

Examples:
  graph-find-path.sh create_order send_email
  graph-find-path.sh login authenticate
  graph-find-path.sh process_payment charge_card
HELP
  exit 0
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && show_help

if [ -z "$1" ] || [ -z "$2" ]; then
    show_help
fi

FROM="$1"
TO="$2"

# Initialize (gets SESSION and AGENT_ID)
init_graph || exit 1

echo "Finding call path: $FROM -> $TO"
echo "---"

# Make the query
RESPONSE=$(graph_query "$AGENT_ID" "find-path" "&from=${FROM}&to=${TO}") || exit 1

# Extract and display results
RESULT=$(echo "$RESPONSE" | jq '.result')
FOUND=$(echo "$RESULT" | jq -r '.found')
ERROR=$(echo "$RESULT" | jq -r '.error // empty')

if [ -n "$ERROR" ]; then
    echo "Warning: $ERROR"
    echo ""
fi

if [ "$FOUND" = "false" ]; then
    echo "No path found from '$FROM' to '$TO'"
    echo ""
    echo "This could mean:"
    echo "  - There is no call path between these functions"
    echo "  - The function names don't match exactly"
    echo "  - The path is longer than 5 hops (limit)"
else
    PATHS=$(echo "$RESULT" | jq '.paths')
    PATH_COUNT=$(echo "$PATHS" | jq 'length')

    echo "Found $PATH_COUNT path(s):"
    echo ""

    echo "$PATHS" | jq -r '.[] | "  Depth \(.depth): \(.via | join(" -> ")) -> '"$TO"'"'
fi
