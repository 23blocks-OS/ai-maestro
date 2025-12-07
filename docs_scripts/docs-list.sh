#!/bin/bash
# docs-list.sh - List all indexed documents
# Usage: docs-list.sh [--limit N]

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

LIMIT=50

while [[ $# -gt 0 ]]; do
  case $1 in
    --limit|-l)
      LIMIT="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: docs-list.sh [--limit N]"
      echo ""
      echo "Options:"
      echo "  --limit, -l N    Limit results (default: 50)"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

AGENT_ID=$(get_agent_id)
if [ -z "$AGENT_ID" ]; then
  exit 1
fi

URL="${AIMAESTRO_URL}/api/agents/${AGENT_ID}/docs?action=list&limit=${LIMIT}"

RESPONSE=$(curl -s "$URL")

if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "Error: $ERROR" >&2
  exit 1
fi

RESULTS=$(echo "$RESPONSE" | jq -r '.result // []')
COUNT=$(echo "$RESULTS" | jq 'length')

if [ "$COUNT" = "0" ]; then
  echo "No documents indexed."
  echo ""
  echo "Index documentation with: docs-index.sh"
  exit 0
fi

echo "Indexed Documents ($COUNT):"
echo ""

echo "$RESULTS" | jq -r '.[] | "[\(.docId)] \(.title // "Untitled")\n  Type: \(.docType // "unknown") | File: \(.filePath // "unknown")\n"'
