#!/bin/bash
# docs-helper.sh - Common functions for docs scripts
# This file is sourced by other scripts

# AI Maestro API base URL
AIMAESTRO_URL="${AIMAESTRO_URL:-http://localhost:23000}"

# Get agent ID from tmux session name
get_agent_id() {
  if [ -n "$AIMAESTRO_AGENT_ID" ]; then
    echo "$AIMAESTRO_AGENT_ID"
    return 0
  fi

  if [ -z "$TMUX" ]; then
    echo "Error: Not in a tmux session and AIMAESTRO_AGENT_ID not set" >&2
    return 1
  fi

  local session_name
  session_name=$(tmux display-message -p '#S' 2>/dev/null)
  if [ -z "$session_name" ]; then
    echo "Error: Could not determine tmux session name" >&2
    return 1
  fi

  # Query AI Maestro for agent ID by session name
  local response
  response=$(curl -s "${AIMAESTRO_URL}/api/agents?session=${session_name}")

  if [ -z "$response" ]; then
    echo "Error: Could not connect to AI Maestro at ${AIMAESTRO_URL}" >&2
    return 1
  fi

  local agent_id
  agent_id=$(echo "$response" | jq -r '.agents[0].id // empty' 2>/dev/null)

  if [ -z "$agent_id" ]; then
    # Try alternate response format
    agent_id=$(echo "$response" | jq -r '.[0].id // empty' 2>/dev/null)
  fi

  if [ -z "$agent_id" ]; then
    echo "Error: No agent found for session '${session_name}'" >&2
    return 1
  fi

  echo "$agent_id"
}

# Format JSON output for readability
format_json() {
  if command -v jq &> /dev/null; then
    jq '.'
  else
    cat
  fi
}

# Check if AI Maestro is running
check_aimaestro() {
  if ! curl -s "${AIMAESTRO_URL}/api/agents" > /dev/null 2>&1; then
    echo "Error: AI Maestro is not running at ${AIMAESTRO_URL}" >&2
    echo "Start it with: pm2 start ai-maestro" >&2
    return 1
  fi
}

# URL encode a string
urlencode() {
  local string="$1"
  python3 -c "import urllib.parse; print(urllib.parse.quote('$string'))"
}
