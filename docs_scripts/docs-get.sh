#!/bin/bash
# docs-get.sh - Get a specific document with all sections
# Usage: docs-get.sh <doc-id>

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
  echo "Usage: docs-get.sh <doc-id>"
  echo ""
  echo "Get a specific document with all its sections."
  echo "Find doc IDs using: docs-search.sh or docs-list.sh"
  exit 0
fi

DOC_ID="$1"

AGENT_ID=$(get_agent_id)
if [ -z "$AGENT_ID" ]; then
  exit 1
fi

URL="${AIMAESTRO_URL}/api/agents/${AGENT_ID}/docs?action=get-doc&docId=${DOC_ID}"

RESPONSE=$(curl -s "$URL")

if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "Error: $ERROR" >&2
  exit 1
fi

RESULT=$(echo "$RESPONSE" | jq '.result')

if [ "$RESULT" = "null" ] || [ -z "$RESULT" ]; then
  echo "Document not found: $DOC_ID"
  exit 1
fi

# Display document
echo "$RESULT" | jq -r '
  "=== \(.title // "Untitled") ===\n" +
  "Type: \(.doc_type // .docType // "unknown")\n" +
  "File: \(.file_path // .filePath // "unknown")\n" +
  "---\n" +
  (.content // .summary // "No content available") +
  "\n"
'

# Display sections if available
SECTIONS=$(echo "$RESULT" | jq '.sections // []')
SECTION_COUNT=$(echo "$SECTIONS" | jq 'length')

if [ "$SECTION_COUNT" != "0" ]; then
  echo ""
  echo "=== Sections ==="
  echo "$SECTIONS" | jq -r '.[] | "\n## \(.title // "Section")\n\(.content // "")"'
fi
