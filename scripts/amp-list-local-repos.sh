#!/usr/bin/env bash
# =============================================================================
# AMP List Local Repos - List git repositories in the agent's work directory
# =============================================================================
#
# Scan the agent's working directory for git repositories and output
# their metadata as JSON.
#
# Usage:
#   amp-list-local-repos.sh
#
# Examples:
#   amp-list-local-repos.sh
#   amp-list-local-repos.sh --id <uuid>
#
# =============================================================================

set -eo pipefail

# Pre-source: extract --id to set agent identity before helper resolves it
_amp_prev=""
for _amp_arg in "$@"; do
    if [ "$_amp_prev" = "--id" ]; then
        export CLAUDE_AGENT_ID="$_amp_arg"
        break
    fi
    _amp_prev="$_amp_arg"
done
unset _amp_prev _amp_arg

# Source helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/amp-helper.sh"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --id) shift 2 ;;  # Already handled in pre-source parsing
    --help|-h)
      echo "Usage: amp-list-local-repos.sh"
      echo ""
      echo "List git repositories in the agent's work directory."
      echo ""
      echo "Options:"
      echo "  --id UUID   Operate as this agent (UUID from config.json)"
      echo "  --help, -h  Show this help"
      exit 0
      ;;
    *) shift ;;
  esac
done

# Get agent work directory from AI Maestro API
API="${AIMAESTRO_API:-http://localhost:23000}"
AGENT_ID="${CLAUDE_AGENT_ID:-}"

# If no agent ID set, try to resolve from AMP config
if [ -z "$AGENT_ID" ] && [ -f "${AMP_CONFIG}" ]; then
  AGENT_ID=$(jq -r '.agent.id // empty' "${AMP_CONFIG}" 2>/dev/null)
fi

WORK_DIR=""
if [ -n "$AGENT_ID" ]; then
  WORK_DIR=$(curl -sf "$API/api/agents/$AGENT_ID" | jq -r '.agent.workingDirectory // empty' 2>/dev/null) || true
fi

if [ -z "$WORK_DIR" ] || [ ! -d "$WORK_DIR" ]; then
  echo "[]"
  exit 0
fi

# Collect repos into a JSON array
REPOS="[]"
while IFS= read -r GIT_DIR; do
  [ -z "$GIT_DIR" ] && continue
  REPO_DIR=$(dirname "$GIT_DIR")
  REMOTE=$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || echo "none")
  BRANCH=$(git -C "$REPO_DIR" branch --show-current 2>/dev/null || echo "detached")
  DIRTY=$(git -C "$REPO_DIR" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  STATUS="clean"
  [ "$DIRTY" -gt 0 ] && STATUS="dirty ($DIRTY files)"

  REPOS=$(echo "$REPOS" | jq \
    --arg path "$REPO_DIR" \
    --arg name "$(basename "$REPO_DIR")" \
    --arg remote "$REMOTE" \
    --arg branch "$BRANCH" \
    --arg status "$STATUS" \
    '. + [{path: $path, name: $name, remote: $remote, branch: $branch, status: $status}]')
done < <(find "$WORK_DIR" -maxdepth 2 -name .git -type d 2>/dev/null)

echo "$REPOS" | jq '.'
