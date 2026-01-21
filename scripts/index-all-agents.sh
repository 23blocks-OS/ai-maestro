#!/bin/bash
# Index all running agent projects for code graph
# This script iterates through all tmux sessions with registered agents
# and triggers the graph indexing API for each one

# Source common helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/shell-helpers/common.sh" ]; then
    source "${SCRIPT_DIR}/shell-helpers/common.sh"
elif [ -f "${HOME}/.local/share/aimaestro/shell-helpers/common.sh" ]; then
    source "${HOME}/.local/share/aimaestro/shell-helpers/common.sh"
else
    # Fallback: detect API URL manually (no common.sh available)
    API_BASE=$(curl -s --max-time 5 "http://127.0.0.1:23000/api/hosts/identity" | jq -r '.host.url // empty' 2>/dev/null)
    if [ -z "$API_BASE" ]; then
        API_BASE="http://$(hostname | tr '[:upper:]' '[:lower:]'):23000"
    fi
fi

# If we have common.sh, use the function
if command -v get_api_base &> /dev/null; then
    API_BASE=$(get_api_base)
fi

TIMEOUT=300  # 5 minutes timeout per project

echo "=========================================="
echo "🔍 Indexing All Agent Projects"
echo "=========================================="
echo ""

# Get all agents from registry as JSON array
agents_json=$(curl -s "$API_BASE/api/agents" | jq -c '[.agents[] | {agentId: .id, workingDirectory, name: (.alias // .name // .id)}]')

if [ -z "$agents_json" ] || [ "$agents_json" = "[]" ]; then
    echo "❌ No agents found in registry"
    exit 1
fi

# Count total
total=$(echo "$agents_json" | jq 'length')
echo "Found $total agents to index"
echo ""

# Track results
success=0
failed=0
skipped=0

# Process each session by index to avoid subshell issues
for ((i=0; i<$total; i++)); do
    agent=$(echo "$agents_json" | jq -c ".[$i]")

    agentId=$(echo "$agent" | jq -r '.agentId')
    workingDir=$(echo "$agent" | jq -r '.workingDirectory')
    name=$(echo "$agent" | jq -r '.name')

    echo "----------------------------------------"
    echo "[$((i+1))/$total] $name"
    echo "  Agent: $agentId"
    echo "  Path: $workingDir"

    # Skip if working directory is just home folder (not a project)
    if [ "$workingDir" = "/Users/juanpelaez" ]; then
        echo "  ⏭️  SKIPPED (no specific project directory)"
        ((skipped++))
        continue
    fi

    # Check if directory exists
    if [ ! -d "$workingDir" ]; then
        echo "  ⚠️  SKIPPED (directory not found)"
        ((skipped++))
        continue
    fi

    # Index the project
    echo "  📊 Indexing..."

    response=$(curl -s --max-time $TIMEOUT -X POST "$API_BASE/api/agents/$agentId/graph/code" \
        -H "Content-Type: application/json" \
        -d "{\"projectPath\": \"$workingDir\", \"clear\": false}" 2>&1)

    curl_exit=$?
    if [ $curl_exit -ne 0 ]; then
        echo "  ❌ FAILED (curl exit code: $curl_exit)"
        ((failed++))
        continue
    fi

    # Check response
    error=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)
    if [ -n "$error" ]; then
        echo "  ❌ FAILED: $error"
        ((failed++))
        continue
    fi

    # Check for success field
    is_success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
    if [ "$is_success" != "true" ]; then
        echo "  ❌ FAILED: Unexpected response: $response"
        ((failed++))
        continue
    fi

    # Extract stats
    files=$(echo "$response" | jq -r '.stats.filesIndexed // 0')
    functions=$(echo "$response" | jq -r '.stats.functionsIndexed // 0')
    components=$(echo "$response" | jq -r '.stats.componentsIndexed // .stats.classesIndexed // 0')
    projectType=$(echo "$response" | jq -r '.stats.projectType // "unknown"')
    framework=$(echo "$response" | jq -r '.stats.framework // ""')
    duration=$(echo "$response" | jq -r '.stats.durationMs // 0')

    type_display="$projectType"
    if [ -n "$framework" ] && [ "$framework" != "null" ]; then
        type_display="$projectType ($framework)"
    fi

    echo "  ✅ SUCCESS in ${duration}ms"
    echo "     Type: $type_display"
    echo "     Files: $files, Functions: $functions, Classes: $components"

    ((success++))

    # Small delay between requests to prevent server overload
    sleep 2
done

echo ""
echo "=========================================="
echo "📊 Summary"
echo "=========================================="
echo "  ✅ Success: $success"
echo "  ❌ Failed: $failed"
echo "  ⏭️  Skipped: $skipped"
echo "  📁 Total: $total"
echo "=========================================="
