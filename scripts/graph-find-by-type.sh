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
  cat <<'HELP'
Usage: graph-find-by-type.sh <type>

Find all components of a given type in the code graph database.

Commands:
  graph-find-by-type.sh <type>    List all symbols matching a component type

Arguments:
  <type>    Component type to search for (case-sensitive)

            Common types:
              model       - Database models (ActiveRecord, ORM)
              serializer  - JSON serializers
              controller  - API/web controllers
              service     - Service objects
              job         - Background jobs
              mailer      - Email senders
              concern     - Shared modules/mixins
              component   - React/Vue components
              hook        - React hooks

Options:
  --help, -h    Show this help

Use Cases:
  List all models in the project:        graph-find-by-type.sh model
  Audit all serializers:                 graph-find-by-type.sh serializer
  Find all controllers for API review:   graph-find-by-type.sh controller
  Discover all background jobs:          graph-find-by-type.sh job

Examples:
  graph-find-by-type.sh model
  graph-find-by-type.sh serializer
  graph-find-by-type.sh controller
  graph-find-by-type.sh service
HELP
  exit 0
}

[[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && show_help

if [ -z "$1" ]; then
    show_help
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
