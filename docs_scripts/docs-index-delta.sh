#!/bin/bash
# docs-index-delta.sh - Delta index documentation (only changed files)
# Usage: docs-index-delta.sh [project-path]

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
      echo "Usage: docs-index-delta.sh [project-path]"
      echo ""
      echo "Delta index documentation from a project directory."
      echo "Only indexes new and modified files, skips unchanged files."
      echo ""
      echo "If no path is provided, uses the agent's configured working directory."
      echo ""
      echo "Benefits of delta indexing:"
      echo "  - Much faster than full indexing"
      echo "  - Only processes changed files"
      echo "  - Preserves existing indexed content"
      echo ""
      echo "Use 'docs-index.sh' for a full re-index."
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

echo "Delta indexing documentation (only changed files)..."

# Build request body with delta: true
if [ -n "$PROJECT_PATH" ]; then
  BODY="{\"projectPath\": \"$PROJECT_PATH\", \"delta\": true}"
else
  BODY="{\"delta\": true}"
fi

RESPONSE=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "$BODY")

if echo "$RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "Error: $ERROR" >&2
  exit 1
fi

echo "Delta indexing complete!"
echo ""
echo "$RESPONSE" | jq -r '
  "Project: \(.projectPath // "auto-detected")\n" +
  "Mode: \(.mode // "delta")\n" +
  "\nFile Changes:" +
  "\n  New files: \(.stats.filesNew // 0)" +
  "\n  Modified files: \(.stats.filesModified // 0)" +
  "\n  Deleted files: \(.stats.filesDeleted // 0)" +
  "\n  Unchanged files: \(.stats.filesUnchanged // 0)" +
  "\n\nIndexing Stats:" +
  "\n  Documents indexed: \(.stats.documents // 0)" +
  "\n  Chunks created: \(.stats.chunks // 0)" +
  "\n  Embeddings generated: \(.stats.embeddings // 0)"
'
