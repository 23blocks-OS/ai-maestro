#!/bin/bash
# AI Maestro - Find all serializers for a model
# Usage: graph-find-serializers.sh <model-name>
# Example: graph-find-serializers.sh User
#          graph-find-serializers.sh Order

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

if [ -z "$1" ]; then
    echo "Usage: graph-find-serializers.sh <model-name>"
    echo ""
    echo "Find all serializers for a model."
    echo "IMPORTANT: Run this BEFORE modifying a model to update serializers."
    echo ""
    echo "Examples:"
    echo "  graph-find-serializers.sh User   # Find User serializers"
    echo "  graph-find-serializers.sh Order  # Find Order serializers"
    exit 1
fi

NAME="$1"

# Initialize (gets SESSION and AGENT_ID)
init_graph || exit 1

echo "Finding serializers for model: $NAME"
echo "---"

# Make the query
RESPONSE=$(graph_query "$AGENT_ID" "find-serializers" "&name=${NAME}") || exit 1

# Extract and display results
RESULT=$(echo "$RESPONSE" | jq '.result')
COUNT=$(echo "$RESULT" | jq -r '.count')
ERROR=$(echo "$RESULT" | jq -r '.error // empty')

if [ -n "$ERROR" ]; then
    echo "Warning: $ERROR"
    echo ""
fi

if [ "$COUNT" = "0" ]; then
    echo "No serializers found for '$NAME'"
    echo ""
    echo "This could mean:"
    echo "  - The model has no serializers"
    echo "  - The model name doesn't match exactly"
    echo "  - The codebase hasn't been fully indexed"
else
    echo "Found $COUNT serializer(s):"
    echo ""
    echo "$RESULT" | jq -r '.serializers[] | "  \(.name)\n    File: \(.file)\n"'
    echo ""
    echo "Remember: If you modify '$NAME', update these serializers too!"
fi
