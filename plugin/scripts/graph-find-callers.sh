#!/bin/bash
# AI Maestro - Find all functions that call a given function
# Usage: graph-find-callers.sh <function-name>
# Example: graph-find-callers.sh authenticate
#          graph-find-callers.sh process_payment

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

if [ -z "$1" ]; then
    echo "Usage: graph-find-callers.sh <function-name>"
    echo ""
    echo "Find all functions that call a given function."
    echo "Use this BEFORE modifying a function to understand impact."
    echo ""
    echo "Examples:"
    echo "  graph-find-callers.sh authenticate    # Who calls authenticate?"
    echo "  graph-find-callers.sh process_payment # Who calls process_payment?"
    exit 1
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
