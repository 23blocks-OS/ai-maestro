#!/usr/bin/env bash
# =============================================================================
# AMP Create Repo - Create a GitHub repository and register with the team
# =============================================================================
#
# Create a new GitHub repository via gh CLI and optionally register it
# with the agent's team in AI Maestro.
#
# Usage:
#   amp-create-repo.sh <name> [--org <org>] [--private] [--description "..."]
#
# Examples:
#   amp-create-repo.sh my-new-repo
#   amp-create-repo.sh my-new-repo --org myorg --private --description "A cool project"
#   amp-create-repo.sh my-new-repo --team <team-id>
#   amp-create-repo.sh --id <uuid> my-new-repo
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

NAME=""
ORG=""
PRIVATE=""
DESCRIPTION=""
TEAM_ID=""

show_help() {
    echo "Usage: amp-create-repo.sh <name> [--org <org>] [--private] [--description \"...\"]"
    echo ""
    echo "Create a GitHub repository and register with the team."
    echo ""
    echo "Arguments:"
    echo "  name              Repository name"
    echo ""
    echo "Options:"
    echo "  --org ORG         GitHub organization (default: personal account)"
    echo "  --private         Create as private repository (default: public)"
    echo "  --description STR Repository description"
    echo "  --team TEAM_ID    Team ID to register the repo with"
    echo "  --id UUID         Operate as this agent (UUID from config.json)"
    echo "  --help, -h        Show this help"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --org) ORG="$2"; shift 2 ;;
    --private) PRIVATE="--private"; shift ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --team) TEAM_ID="$2"; shift 2 ;;
    --id) shift 2 ;;  # Already handled in pre-source parsing
    --help|-h) show_help; exit 0 ;;
    -*)
      echo "Unknown option: $1" >&2
      shift ;;
    *)
      [ -z "$NAME" ] && NAME="$1"
      shift ;;
  esac
done

if [ -z "$NAME" ]; then
  echo "Error: Missing required argument: name" >&2
  echo ""
  show_help
  exit 1
fi

FULL_NAME="$NAME"
[ -n "$ORG" ] && FULL_NAME="$ORG/$NAME"

# Build gh repo create command
VISIBILITY="${PRIVATE:---public}"
GH_ARGS=("gh" "repo" "create" "$FULL_NAME" "$VISIBILITY" "--add-readme" "--clone=false")
[ -n "$DESCRIPTION" ] && GH_ARGS+=("--description" "$DESCRIPTION")

echo "Creating repository $FULL_NAME..."
"${GH_ARGS[@]}"

# Get repo URL
REPO_URL=$(gh repo view "$FULL_NAME" --json url --jq '.url')
echo "Created: $REPO_URL"

# Register with team if available
API="${AIMAESTRO_API:-http://localhost:23000}"
if [ -z "$TEAM_ID" ]; then
  AGENT_ID="${CLAUDE_AGENT_ID:-}"
  # If no agent ID set, try to resolve from AMP config
  if [ -z "$AGENT_ID" ] && [ -f "${AMP_CONFIG}" ]; then
    AGENT_ID=$(jq -r '.agent.id // empty' "${AMP_CONFIG}" 2>/dev/null)
  fi
  if [ -n "$AGENT_ID" ]; then
    TEAM_ID=$(curl -sf "$API/api/agents/$AGENT_ID" | jq -r '.agent.teamId // empty' 2>/dev/null) || true
  fi
fi

if [ -n "$TEAM_ID" ]; then
  # MF-020: Use jq for JSON construction to prevent injection via special chars in values
  REGISTER_BODY=$(jq -n --arg url "$REPO_URL" --arg name "$NAME" '{url: $url, name: $name}')
  curl -sf -X POST "$API/api/teams/$TEAM_ID/repos" \
    -H "Content-Type: application/json" \
    -d "$REGISTER_BODY" >/dev/null 2>&1 || true
  echo "Registered with team $TEAM_ID"
fi
