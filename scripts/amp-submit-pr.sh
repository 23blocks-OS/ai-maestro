#!/bin/bash
# =============================================================================
# AMP Submit PR - Create a pull request from the current branch
# =============================================================================
#
# Push the current branch and create a GitHub pull request.
#
# Usage:
#   amp-submit-pr.sh <repo-path> <title> [--body "..."] [--base main]
#
# Examples:
#   amp-submit-pr.sh /path/to/repo "Add login feature"
#   amp-submit-pr.sh . "Fix auth bug" --body "Fixes #42" --base develop
#
# =============================================================================

set -e

REPO_PATH=""
TITLE=""
BODY=""
BASE="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --body) BODY="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: amp-submit-pr.sh <repo-path> <title> [--body \"...\"] [--base main]"
      echo ""
      echo "Arguments:"
      echo "  repo-path   Path to the git repository"
      echo "  title       Pull request title"
      echo ""
      echo "Options:"
      echo "  --body TEXT   PR description body"
      echo "  --base BRANCH Base branch (default: main)"
      echo "  --help, -h    Show this help"
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      shift
      ;;
    *)
      if [ -z "$REPO_PATH" ]; then REPO_PATH="$1"
      elif [ -z "$TITLE" ]; then TITLE="$1"
      fi
      shift
      ;;
  esac
done

if [ -z "$REPO_PATH" ] || [ -z "$TITLE" ]; then
  echo "Usage: amp-submit-pr.sh <repo-path> <title> [--body \"...\"] [--base main]" >&2
  exit 1
fi

cd "$REPO_PATH"

# Push current branch
BRANCH=$(git branch --show-current)
git push -u origin "$BRANCH" 2>/dev/null || true

# Create PR
if [ -n "$BODY" ]; then
  PR_URL=$(gh pr create --title "$TITLE" --base "$BASE" --body "$BODY" 2>&1 | tail -1)
else
  PR_URL=$(gh pr create --title "$TITLE" --base "$BASE" 2>&1 | tail -1)
fi

echo "PR created: $PR_URL"
