#!/bin/bash
# AI Maestro - Find all components of a given type
# Usage: graph-find-by-type.sh <type>
# Example: graph-find-by-type.sh model
#          graph-find-by-type.sh controller
#          graph-find-by-type.sh service

set -e

# Get script directory and source helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/graph-helper.sh"

show_help() {
    echo "Usage: graph-find-by-type.sh <type>"
    echo ""
    echo "Find all components of a given type in the codebase."
    echo ""
    echo "Common types:"
    echo "  model       - Database models (ActiveRecord, ORM)"
    echo "  serializer  - JSON serializers"
    echo "  controller  - API/web controllers"
    echo "  service     - Service objects"
    echo "  job         - Background jobs"
    echo "  mailer      - Email senders"
    echo "  concern     - Shared modules/mixins"
    echo "  component   - React/Vue components"
    echo "  hook        - React hooks"
    echo ""
    echo "Examples:"
    echo "  graph-find-by-type.sh model       # List all models"
    echo "  graph-find-by-type.sh serializer  # List all serializers"
    echo "  graph-find-by-type.sh controller  # List all controllers"
}

if [ -z "$1" ]; then
    show_help
    exit 1
fi

TYPE="$1"

# Initialize (gets SESSION and AGENT_ID)
init_graph || exit 1

echo "Finding all components of type: $TYPE"
echo "---"

# Make the query
RESPONSE=$(graph_query "$AGENT_ID" "find-by-type" "&type=${TYPE}") || exit 1

# Extract and display results
RESULT=$(echo "$RESPONSE" | jq '.result')
COUNT=$(echo "$RESULT" | jq -r '.count')
ERROR=$(echo "$RESULT" | jq -r '.error // empty')

if [ -n "$ERROR" ]; then
    echo "Warning: $ERROR"
    echo ""
fi

if [ "$COUNT" = "0" ]; then
    echo "No components found of type '$TYPE'"
    echo ""
    echo "This could mean:"
    echo "  - No components of this type exist in the codebase"
    echo "  - The codebase hasn't been indexed"
    echo "  - Try a different type name"
else
    echo "Found $COUNT component(s):"
    echo ""
    echo "$RESULT" | jq -r '.components[] | "  \(.name)\n    File: \(.file)\n"'
fi
