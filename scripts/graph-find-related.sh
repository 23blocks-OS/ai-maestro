#!/bin/bash
# AI Maestro - Find all components related to a given component
# Usage: graph-find-related.sh <component-name>
# Example: graph-find-related.sh User
#          graph-find-related.sh PaymentService

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

show_help() {
  cat <<'HELP'
Usage: graph-find-related.sh <component-name>

Find all components related to a given component (extends, includes, associations, serializers).

Commands:
  graph-find-related.sh <name>    Show all relationship types for <name>

Arguments:
  <component-name>    Name of the class, model, or service to inspect (case-sensitive)

Options:
  --help, -h    Show this help

Use Cases:
  Map all dependencies of a model before migration:  graph-find-related.sh User
  Discover what a service connects to:                graph-find-related.sh PaymentService
  Find inheritance and mixin chains:                  graph-find-related.sh BaseController
  Audit a component's full relationship graph:        graph-find-related.sh Order

Examples:
  graph-find-related.sh User
  graph-find-related.sh PaymentService
  graph-find-related.sh ApplicationRecord
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

echo "Finding components related to: $NAME"
echo "---"

# Make the query
RESPONSE=$(graph_query "$AGENT_ID" "find-related" "&name=${NAME}") || exit 1

# Extract and display results
RESULT=$(echo "$RESPONSE" | jq '.result')

# Display each relationship type
display_list() {
    local title="$1"
    local items="$2"
    local count
    count=$(echo "$items" | jq 'if type == "array" then length else 0 end')
    if [ "$count" -gt 0 ]; then
        echo ""
        echo "$title:"
        echo "$items" | jq -r '.[]' 2>/dev/null | while read -r item; do
            echo "  - $item"
        done
    fi
}

display_assocs() {
    local title="$1"
    local items="$2"
    local count
    count=$(echo "$items" | jq 'if type == "array" then length else 0 end')
    if [ "$count" -gt 0 ]; then
        echo ""
        echo "$title:"
        echo "$items" | jq -r '.[] | "  - \(.type // .source // .target): \(.target // .source)"' 2>/dev/null
    fi
}

# Show extends
display_list "Extends from" "$(echo "$RESULT" | jq '.extends_from // []')"
display_list "Extended by" "$(echo "$RESULT" | jq '.extended_by // []')"

# Show includes
display_list "Includes modules" "$(echo "$RESULT" | jq '.includes // []')"
display_list "Included by classes" "$(echo "$RESULT" | jq '.included_by // []')"

# Show associations
display_assocs "Associations (outgoing)" "$(echo "$RESULT" | jq '.associations // []')"
display_assocs "Associated by (incoming)" "$(echo "$RESULT" | jq '.associated_by // []')"

# Show serializers
SERIALIZES=$(echo "$RESULT" | jq -r '.serializes // empty')
[ -n "$SERIALIZES" ] && echo "" && echo "Serializes model: $SERIALIZES"

display_list "Serialized by" "$(echo "$RESULT" | jq '.serialized_by // []')"

# If nothing found
HAS_RELATIONS=$(echo "$RESULT" | jq '[.extends_from, .extended_by, .includes, .included_by, .associations, .associated_by, .serialized_by] | map(if type == "array" then length else 0 end) | add')
if [ "$HAS_RELATIONS" = "0" ] && [ -z "$SERIALIZES" ]; then
    echo "No relationships found for '$NAME'"
    echo ""
    echo "This could mean:"
    echo "  - The component has no tracked relationships"
    echo "  - The component name doesn't match exactly"
    echo "  - Try graph-describe.sh for more details"
fi
