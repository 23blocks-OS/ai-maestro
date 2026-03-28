#!/bin/bash
# =============================================================================
# AMP Clone Repo - Clone a repository to the agent's work directory
# =============================================================================
#
# Clone a git repository into the agent's working directory.
#
# Usage:
#   amp-clone-repo.sh <url> [<localName>]
#
# Examples:
#   amp-clone-repo.sh https://github.com/org/repo.git
#   amp-clone-repo.sh https://github.com/org/repo.git my-local-name
#   amp-clone-repo.sh --id <uuid> https://github.com/org/repo.git
#
# =============================================================================

set -e

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

URL=""
LOCAL_NAME=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --id) shift 2 ;;  # Already handled in pre-source parsing
    --help|-h)
      echo "Usage: amp-clone-repo.sh <url> [<localName>]"
      echo ""
      echo "Clone a repository to the agent's work directory."
      echo ""
      echo "Arguments:"
      echo "  url         Git repository URL"
      echo "  localName   Local directory name (default: derived from URL)"
      echo ""
      echo "Options:"
      echo "  --id UUID   Operate as this agent (UUID from config.json)"
      echo "  --help, -h  Show this help"
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      shift ;;
    *)
      if [ -z "$URL" ]; then URL="$1"
      elif [ -z "$LOCAL_NAME" ]; then LOCAL_NAME="$1"
      fi
      shift ;;
  esac
done

if [ -z "$URL" ]; then
  echo "Usage: amp-clone-repo.sh <url> [<localName>]" >&2
  exit 1
fi

# Derive local name from URL if not provided
if [ -z "$LOCAL_NAME" ]; then
  LOCAL_NAME=$(basename "$URL" .git)
fi

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

if [ -z "$WORK_DIR" ]; then
  WORK_DIR="$HOME/agents/${AGENT_ID:-default}"
  mkdir -p "$WORK_DIR"
fi

TARGET="$WORK_DIR/$LOCAL_NAME"

if [ -d "$TARGET/.git" ]; then
  echo "Repository already cloned at $TARGET"
  exit 0
fi

echo "Cloning $URL to $TARGET..."
git clone "$URL" "$TARGET"
echo "Cloned to $TARGET"
