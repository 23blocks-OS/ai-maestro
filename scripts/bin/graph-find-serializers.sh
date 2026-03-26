#!/bin/bash
# AI Maestro - Find all serializers for a model
# Usage: graph-find-serializers.sh <model-name>
# Example: graph-find-serializers.sh User
#          graph-find-serializers.sh Order

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

show_help() {
  cat <<'HELP'
Usage: graph-find-serializers.sh <model-name>

Find all serializer classes associated with a model.

Commands:
  graph-find-serializers.sh <name>    List serializers that serialize <name>

Arguments:
  <model-name>    Name of the model to find serializers for (case-sensitive)

Options:
  --help, -h    Show this help

Use Cases:
  Find serializers to update before modifying a model:  graph-find-serializers.sh User
  Audit API response shapes for a resource:             graph-find-serializers.sh Order
  Check if a model has any serializer coverage:         graph-find-serializers.sh Invoice

Examples:
  graph-find-serializers.sh User
  graph-find-serializers.sh Order
  graph-find-serializers.sh Product
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
