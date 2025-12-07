#!/bin/bash
# AI Maestro - Search project documentation
# Usage: doc-search.sh <query> [--keyword] [--limit N]
# Example: doc-search.sh "authentication flow"
#          doc-search.sh "OAuth" --keyword
#          doc-search.sh "API conventions" --limit 5

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/doc-helper.sh"

show_help() {
    echo "Usage: doc-search.sh <query> [--keyword] [--limit N]"
    echo ""
    echo "Search project documentation using semantic or keyword search."
    echo ""
    echo "Options:"
    echo "  --keyword    Use exact keyword matching instead of semantic search"
    echo "  --limit N    Limit results (default: 10)"
    echo ""
    echo "Examples:"
    echo "  doc-search.sh \"authentication flow\"     # Semantic search"
    echo "  doc-search.sh \"OAuth\" --keyword         # Keyword search"
    echo "  doc-search.sh \"API design\" --limit 5    # Limited results"
}

if [ -z "$1" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 1
fi

QUERY="$1"
shift

KEYWORD_MODE=""
LIMIT="10"

while [ $# -gt 0 ]; do
    case "$1" in
        --keyword)
            KEYWORD_MODE="true"
            shift
            ;;
        --limit)
            LIMIT="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Initialize (gets SESSION and AGENT_ID)
init_doc || exit 1

# URL encode the query
ENCODED_QUERY=$(echo "$QUERY" | jq -sRr @uri)

echo "Searching docs for: $QUERY"
echo "---"

# Make the query
if [ -n "$KEYWORD_MODE" ]; then
    RESPONSE=$(doc_query "$AGENT_ID" "search" "&keyword=${ENCODED_QUERY}&limit=${LIMIT}") || exit 1
else
    RESPONSE=$(doc_query "$AGENT_ID" "search" "&q=${ENCODED_QUERY}&limit=${LIMIT}") || exit 1
fi

# Display results
RESULTS=$(echo "$RESPONSE" | jq '.result // []')
COUNT=$(echo "$RESULTS" | jq 'length')

if [ "$COUNT" = "0" ]; then
    echo "No documents found matching: $QUERY"
    echo ""
    echo "Tips:"
    echo "  - Try different keywords"
    echo "  - Use doc-stats.sh to check if docs are indexed"
    echo "  - Use doc-find-type.sh to browse by document type"
else
    echo "Found $COUNT result(s):"
    echo ""
    echo "$RESULTS" | jq -r '.[] | "[\(.docType // "doc")] \(.title // "Untitled")\n  File: \(.filePath)\n  Section: \(.heading // "N/A")\n  Score: \(.similarity // "N/A")\n  Preview: \(.content[0:150] | gsub("\n"; " "))...\n"'
fi
