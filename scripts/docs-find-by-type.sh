#!/bin/bash
# AI Maestro - Find documents by type
# Usage: docs-find-by-type.sh <type>
# Types: function, class, module, interface, component, constant, readme, guide

set -e

# Source docs helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/docs-helper.sh"

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

# Initialize (gets SESSION, AGENT_ID, HOST_ID)
init_docs || exit 1

RESPONSE=$(docs_find_by_type "$AGENT_ID" "$DOC_TYPE")

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
