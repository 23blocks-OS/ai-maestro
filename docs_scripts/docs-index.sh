#!/bin/bash
# AI Maestro - Index documentation from project
# Usage: docs-index.sh [project-path]

set -e

# Source docs helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docs-helper.sh"

PROJECT_PATH=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)
      echo "Usage: docs-index.sh [project-path]"
      echo ""
      echo "Index documentation from a project directory."
      echo "If no path is provided, uses the agent's configured working directory."
      echo ""
      echo "This extracts documentation from:"
      echo "  - JSDoc comments"
      echo "  - RDoc comments"
      echo "  - Python docstrings"
      echo "  - TypeScript interfaces"
      echo "  - README files"
      echo "  - Markdown documentation"
      exit 0
      ;;
    *)
      PROJECT_PATH="$1"
      shift
      ;;
  esac
done

# Initialize (gets SESSION, AGENT_ID, HOST_ID)
init_docs || exit 1

echo "Indexing documentation..."

# Make request using helper
RESPONSE=$(docs_index "$AGENT_ID" "$PROJECT_PATH")

if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "Error: $ERROR" >&2
  exit 1
fi

echo "Documentation indexed successfully!"
echo ""
echo "$RESPONSE" | jq -r '
  "Project: \(.projectPath // "auto-detected")\n" +
  "Stats:\n" +
  (.stats | to_entries | map("  \(.key): \(.value)") | join("\n"))
'
