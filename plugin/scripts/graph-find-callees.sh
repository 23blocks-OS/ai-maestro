#!/bin/bash
# AI Maestro - Find all functions called by a given function
# Usage: graph-find-callees.sh <function-name>
# Example: graph-find-callees.sh process_payment
#          graph-find-callees.sh handle_request

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

if [ -z "$1" ]; then
    echo "Usage: graph-find-callees.sh <function-name>"
    echo ""
    echo "Find all functions called by a given function."
    echo "Use this to understand what a function depends on."
    echo ""
    echo "Examples:"
    echo "  graph-find-callees.sh process_payment  # What does process_payment call?"
    echo "  graph-find-callees.sh handle_request   # What does handle_request call?"
    exit 1
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
