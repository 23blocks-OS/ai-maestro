#!/bin/bash
# AI Maestro - Find the call path between two functions
# Usage: graph-find-path.sh <from-function> <to-function>
# Example: graph-find-path.sh create_order send_email
#          graph-find-path.sh login authenticate

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: graph-find-path.sh <from-function> <to-function>"
    echo ""
    echo "Find how one function eventually calls another."
    echo "Useful for tracing data flow and debugging."
    echo ""
    echo "Examples:"
    echo "  graph-find-path.sh create_order send_email"
    echo "  graph-find-path.sh login authenticate"
    exit 1
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
