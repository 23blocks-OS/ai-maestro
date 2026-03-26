#!/bin/bash
# AI Maestro - Delta index documentation (only changed files)
# Usage: docs-index-delta.sh [project-path]

set -e

# Source docs helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docs-helper.sh"

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

# Initialize (gets SESSION, AGENT_ID, HOST_ID)
init_docs || exit 1

echo "Delta indexing documentation (only changed files)..."

# Build request body with delta: true
if [ -n "$PROJECT_PATH" ]; then
  BODY=$(jq -n --arg path "$PROJECT_PATH" '{"projectPath": $path, "delta": true}')
else
  BODY='{"delta": true}'
fi

RESPONSE=$(api_query "POST" "/api/agents/${AGENT_ID}/docs" -H "Content-Type: application/json" -d "$BODY")

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
