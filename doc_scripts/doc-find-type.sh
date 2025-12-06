#!/bin/bash
# AI Maestro - Find documents by type
# Usage: doc-find-type.sh <type>
# Example: doc-find-type.sh adr
#          doc-find-type.sh readme
#          doc-find-type.sh design

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/doc-helper.sh"

show_help() {
    echo "Usage: doc-find-type.sh <type>"
    echo ""
    echo "Find all documents of a specific type."
    echo ""
    echo "Available types:"
    echo "  adr          - Architecture Decision Records"
    echo "  readme       - README files"
    echo "  design       - Design documents"
    echo "  api          - API documentation"
    echo "  setup        - Setup/installation guides"
    echo "  guide        - How-to guides and tutorials"
    echo "  spec         - Specifications"
    echo "  changelog    - Change logs"
    echo "  contributing - Contribution guidelines"
    echo "  roadmap      - Project roadmaps"
    echo "  doc          - General documentation"
    echo ""
    echo "Examples:"
    echo "  doc-find-type.sh adr       # Find all ADRs"
    echo "  doc-find-type.sh readme    # Find all READMEs"
    echo "  doc-find-type.sh design    # Find design docs"
}

if [ -z "$1" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 1
fi

TYPE="$1"

# Initialize (gets SESSION and AGENT_ID)
init_doc || exit 1

echo "Finding documents of type: $TYPE"
echo "---"

# Make the query
RESPONSE=$(doc_query "$AGENT_ID" "find-by-type" "&type=${TYPE}") || exit 1

# Display results
RESULTS=$(echo "$RESPONSE" | jq '.result // []')
COUNT=$(echo "$RESULTS" | jq 'length')

if [ "$COUNT" = "0" ]; then
    echo "No documents found of type: $TYPE"
else
    echo "Found $COUNT document(s):"
    echo ""
    echo "$RESULTS" | jq -r '.[] | "  \(.title // "Untitled")\n    File: \(.filePath)\n"'
fi
