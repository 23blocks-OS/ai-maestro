#!/bin/bash
# docs-index.sh - Index documentation from project
# Usage: docs-index.sh [project-path]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docs-helper.sh" 2>/dev/null || source "$(dirname "$0")/docs-helper.sh" 2>/dev/null || {
  AIMAESTRO_URL="${AIMAESTRO_URL:-http://localhost:23000}"
  get_agent_id() {
    if [ -n "$AIMAESTRO_AGENT_ID" ]; then echo "$AIMAESTRO_AGENT_ID"; return 0; fi
    if [ -z "$TMUX" ]; then echo "Error: Not in tmux session" >&2; return 1; fi
    local session_name=$(tmux display-message -p '#S' 2>/dev/null)
    local response=$(curl -s "${AIMAESTRO_URL}/api/agents?session=${session_name}")
    echo "$response" | jq -r '.agents[0].id // .[0].id // empty' 2>/dev/null
  }
}

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

AGENT_ID=$(get_agent_id)
if [ -z "$AGENT_ID" ]; then
  exit 1
fi

URL="${AIMAESTRO_URL}/api/agents/${AGENT_ID}/docs"

echo "Indexing documentation..."

# Build request body
if [ -n "$PROJECT_PATH" ]; then
  BODY="{\"projectPath\": \"$PROJECT_PATH\"}"
else
  BODY="{}"
fi

RESPONSE=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "$BODY")

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
