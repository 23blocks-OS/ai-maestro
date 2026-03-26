#!/bin/bash
# AI Maestro - Search conversation history
# Usage: memory-search.sh <query> [--mode MODE] [--role ROLE] [--limit N]
# Example: memory-search.sh "authentication"
#          memory-search.sh "component design" --mode semantic
#          memory-search.sh "user request" --role user

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/memory-helper.sh"

show_help() {
    echo "Usage: memory-search.sh <query> [options]"
    echo ""
    echo "Search your conversation history for past discussions and context."
    echo ""
    echo "Options:"
    echo "  --mode MODE    Search mode: hybrid (default), semantic, term, symbol"
    echo "  --role ROLE    Filter by role: user, assistant"
    echo "  --limit N      Limit results (default: 10)"
    echo ""
    echo "Examples:"
    echo "  memory-search.sh \"authentication\"           # Hybrid search"
    echo "  memory-search.sh \"component design\" --mode semantic"
    echo "  memory-search.sh \"what did user ask\" --role user"
    echo "  memory-search.sh \"previous solution\" --limit 5"
}

if [ -z "$1" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 1
fi

QUERY="$1"
shift

MODE="hybrid"
ROLE=""
LIMIT="10"

while [ $# -gt 0 ]; do
    case "$1" in
        --mode)
            MODE="$2"
            shift 2
            ;;
        --role)
            ROLE="$2"
            shift 2
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
init_memory || exit 1

# URL encode the query
ENCODED_QUERY=$(echo "$QUERY" | jq -sRr @uri)

echo "Searching memory for: $QUERY"
echo "Mode: $MODE"
echo "---"

# Build params
PARAMS="q=${ENCODED_QUERY}&mode=${MODE}&limit=${LIMIT}"
if [ -n "$ROLE" ]; then
    PARAMS="${PARAMS}&role=${ROLE}"
fi

# Make the query
RESPONSE=$(memory_query "$AGENT_ID" "$PARAMS") || exit 1

# Display results
RESULTS=$(echo "$RESPONSE" | jq '.results // []')
COUNT=$(echo "$RESULTS" | jq 'length')

if [ "$COUNT" = "0" ]; then
    echo "No conversations found matching: $QUERY"
    echo ""
    echo "Tips:"
    echo "  - Try different keywords or phrasing"
    echo "  - Use --mode semantic for conceptual matches"
    echo "  - Check if conversation history is indexed"
else
    echo "Found $COUNT result(s):"
    echo ""
    echo "$RESULTS" | jq -r '.[] | "[\(.role)] Score: \(.score | tostring[0:4])\n  \(.text[0:200] | gsub("\n"; " "))...\n"'
fi
