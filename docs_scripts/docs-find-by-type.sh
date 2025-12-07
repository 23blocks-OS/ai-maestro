#!/bin/bash
# docs-find-by-type.sh - Find documents by type
# Usage: docs-find-by-type.sh <type>
# Types: function, class, module, interface, component, constant, readme, guide

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

if [ -z "$1" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: docs-find-by-type.sh <type>"
  echo ""
  echo "Document types:"
  echo "  function   - Function/method documentation"
  echo "  class      - Class documentation"
  echo "  module     - Module/namespace documentation"
  echo "  interface  - Interface/type documentation"
  echo "  component  - React/Vue component documentation"
  echo "  constant   - Documented constants"
  echo "  readme     - README files"
  echo "  guide      - Guide/tutorial documentation"
  exit 0
fi

DOC_TYPE="$1"

AGENT_ID=$(get_agent_id)
if [ -z "$AGENT_ID" ]; then
  exit 1
fi

URL="${AIMAESTRO_URL}/api/agents/${AGENT_ID}/docs?action=find-by-type&type=${DOC_TYPE}"

RESPONSE=$(curl -s "$URL")

if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "Error: $ERROR" >&2
  exit 1
fi

RESULTS=$(echo "$RESPONSE" | jq -r '.result // []')
COUNT=$(echo "$RESULTS" | jq 'length')

if [ "$COUNT" = "0" ]; then
  echo "No documents of type '$DOC_TYPE' found."
  echo ""
  echo "Available types: function, class, module, interface, component, constant, readme, guide"
  exit 0
fi

echo "Found $COUNT document(s) of type '$DOC_TYPE':"
echo ""

echo "$RESULTS" | jq -r '.[] | "[\(.doc_id // .docId)] \(.title // "Untitled")\n  File: \(.file_path // .filePath // "unknown")\n"'
