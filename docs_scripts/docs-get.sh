#!/bin/bash
# AI Maestro - Get a specific document with all sections
# Usage: docs-get.sh <doc-id>

set -e

# Source docs helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docs-helper.sh"

if [ -z "$1" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: docs-get.sh <doc-id>"
  echo ""
  echo "Get a specific document with all its sections."
  echo "Find doc IDs using: docs-search.sh or docs-list.sh"
  exit 0
fi

DOC_ID="$1"

# Initialize (gets SESSION, AGENT_ID, HOST_ID)
init_docs || exit 1

RESPONSE=$(docs_get "$AGENT_ID" "$DOC_ID")

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
