#!/bin/bash
# docs-search.sh - Search documentation
# Usage: docs-search.sh <query>
#        docs-search.sh --keyword <term>
#        docs-search.sh --limit 20 <query>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docs-helper.sh" 2>/dev/null || source "$(dirname "$0")/docs-helper.sh" 2>/dev/null || {
  # Inline helper if not found
  AIMAESTRO_URL="${AIMAESTRO_URL:-http://localhost:23000}"
  get_agent_id() {
    if [ -n "$AIMAESTRO_AGENT_ID" ]; then echo "$AIMAESTRO_AGENT_ID"; return 0; fi
    if [ -z "$TMUX" ]; then echo "Error: Not in tmux session" >&2; return 1; fi
    local session_name=$(tmux display-message -p '#S' 2>/dev/null)
    local response=$(curl -s "${AIMAESTRO_URL}/api/agents?session=${session_name}")
    echo "$response" | jq -r '.agents[0].id // .[0].id // empty' 2>/dev/null
  }
}

# Parse arguments
KEYWORD_MODE=false
LIMIT=10
QUERY=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --keyword|-k)
      KEYWORD_MODE=true
      shift
      ;;
    --limit|-l)
      LIMIT="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: docs-search.sh [options] <query>"
      echo ""
      echo "Options:"
      echo "  --keyword, -k    Use keyword search instead of semantic"
      echo "  --limit, -l N    Limit results (default: 10)"
      echo "  --help, -h       Show this help"
      echo ""
      echo "Examples:"
      echo "  docs-search.sh 'authentication flow'"
      echo "  docs-search.sh --keyword authenticate"
      echo "  docs-search.sh --limit 20 'database connection'"
      exit 0
      ;;
    *)
      QUERY="$1"
      shift
      ;;
  esac
done

if [ -z "$QUERY" ]; then
  echo "Usage: docs-search.sh [--keyword] <query>"
  echo "Try --help for more options"
  exit 1
fi

AGENT_ID=$(get_agent_id)
if [ -z "$AGENT_ID" ]; then
  exit 1
fi

# URL encode the query
ENCODED_QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))" 2>/dev/null || echo "$QUERY")

# Build URL
if [ "$KEYWORD_MODE" = true ]; then
  URL="${AIMAESTRO_URL}/api/agents/${AGENT_ID}/docs?action=search&keyword=${ENCODED_QUERY}&limit=${LIMIT}"
else
  URL="${AIMAESTRO_URL}/api/agents/${AGENT_ID}/docs?action=search&q=${ENCODED_QUERY}&limit=${LIMIT}"
fi

# Make request
RESPONSE=$(curl -s "$URL")

# Check for errors
if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "Error: $ERROR" >&2
  exit 1
fi

# Format output
RESULTS=$(echo "$RESPONSE" | jq -r '.result // []')
COUNT=$(echo "$RESULTS" | jq 'length')

if [ "$COUNT" = "0" ]; then
  echo "No documentation found for: $QUERY"
  echo ""
  echo "Tips:"
  echo "  - Try different search terms"
  echo "  - Check if docs are indexed: docs-stats.sh"
  echo "  - Re-index docs: docs-index.sh"
  exit 0
fi

echo "Found $COUNT document(s) matching '$QUERY':"
echo ""

# Display results
echo "$RESULTS" | jq -r '.[] | "[\(.doc_id // .docId)] \(.title // "Untitled")\n  Type: \(.doc_type // .docType // "unknown") | File: \(.file_path // .filePath // "unknown")\n  \(.summary // .content // "" | split("\n")[0] | .[0:100])...\n"'
