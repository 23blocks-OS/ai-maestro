#!/bin/bash
# AI Maestro - Find all associations for a model
# Usage: graph-find-associations.sh <model-name>
# Example: graph-find-associations.sh User
#          graph-find-associations.sh Post

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

show_help() {
  cat <<'HELP'
Usage: graph-find-associations.sh <model-name>

Find all associations (belongs_to, has_many, has_one, etc.) for a model.

Commands:
  graph-find-associations.sh <name>    Query outgoing and incoming associations for a model

Arguments:
  <model-name>    Name of the model to inspect (case-sensitive)

Options:
  --help, -h    Show this help

Use Cases:
  Map a model's relationships before refactoring:  graph-find-associations.sh User
  Find all models linked to a given model:         graph-find-associations.sh Post
  Audit foreign key dependencies:                  graph-find-associations.sh Order

Examples:
  graph-find-associations.sh User
  graph-find-associations.sh Post
  graph-find-associations.sh Comment
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

echo "Finding associations for model: $NAME"
echo "---"

# Make the query
RESPONSE=$(graph_query "$AGENT_ID" "find-associations" "&name=${NAME}") || exit 1

# Extract and display results
RESULT=$(echo "$RESPONSE" | jq '.result')
ERROR=$(echo "$RESULT" | jq -r '.error // empty')

if [ -n "$ERROR" ]; then
    echo "Warning: $ERROR"
    echo ""
fi

# Outgoing associations (this model -> other models)
OUTGOING=$(echo "$RESULT" | jq '.outgoing // []')
OUT_COUNT=$(echo "$OUTGOING" | jq 'length')

if [ "$OUT_COUNT" -gt 0 ]; then
    echo "Outgoing associations ($NAME -> other models):"
    echo "$OUTGOING" | jq -r '.[] | "  \(.type): \(.target)"'
    echo ""
fi

# Incoming associations (other models -> this model)
INCOMING=$(echo "$RESULT" | jq '.incoming // []')
IN_COUNT=$(echo "$INCOMING" | jq 'length')

if [ "$IN_COUNT" -gt 0 ]; then
    echo "Incoming associations (other models -> $NAME):"
    echo "$INCOMING" | jq -r '.[] | "  \(.source) \(.type): \(.target // empty)"'
    echo ""
fi

# Total count
TOTAL=$((OUT_COUNT + IN_COUNT))
if [ "$TOTAL" = "0" ]; then
    echo "No associations found for '$NAME'"
    echo ""
    echo "This could mean:"
    echo "  - The model has no associations"
    echo "  - The model name doesn't match exactly"
    echo "  - The codebase hasn't been fully indexed"
else
    echo "Total: $OUT_COUNT outgoing, $IN_COUNT incoming"
fi
