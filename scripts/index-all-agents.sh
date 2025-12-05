#!/bin/bash
# Index all running agent projects for code graph
# This script iterates through all tmux sessions with registered agents
# and triggers the graph indexing API for each one

API_BASE="http://localhost:23000"
TIMEOUT=300  # 5 minutes timeout per project

echo "=========================================="
echo "🔍 Indexing All Agent Projects"
echo "=========================================="
echo ""

# Get all sessions with agents as JSON array
sessions_json=$(curl -s "$API_BASE/api/sessions" | jq -c '[.sessions[] | select(.agentId) | {agentId, workingDirectory, name}]')

if [ -z "$sessions_json" ] || [ "$sessions_json" = "[]" ]; then
    echo "❌ No sessions with agents found"
    exit 1
fi

# Count total
total=$(echo "$sessions_json" | jq 'length')
echo "Found $total agent sessions to index"
echo ""

# Track results
success=0
failed=0
skipped=0

# Process each session by index to avoid subshell issues
for ((i=0; i<$total; i++)); do
    session=$(echo "$sessions_json" | jq -c ".[$i]")

    agentId=$(echo "$session" | jq -r '.agentId')
    workingDir=$(echo "$session" | jq -r '.workingDirectory')
    name=$(echo "$session" | jq -r '.name')

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
