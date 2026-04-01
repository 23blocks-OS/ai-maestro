#!/usr/bin/env bash
# =============================================================================
# AMP Create Branch - Create and push a new git branch
# =============================================================================
#
# Create a new branch in a git repository and push it to origin.
#
# Usage:
#   amp-create-branch.sh <repo-path> <branch-name>
#
# Examples:
#   amp-create-branch.sh /path/to/repo feature/new-api
#   amp-create-branch.sh . fix/login-bug
#
# =============================================================================

set -eo pipefail

REPO_PATH="$1"
BRANCH_NAME="$2"

if [ -z "$REPO_PATH" ] || [ -z "$BRANCH_NAME" ]; then
  echo "Usage: amp-create-branch.sh <repo-path> <branch-name>" >&2
  exit 1
fi

if [ ! -d "$REPO_PATH/.git" ]; then
  echo "Error: $REPO_PATH is not a git repository" >&2
  exit 1
fi

cd "$REPO_PATH"
git checkout -b "$BRANCH_NAME"
git push -u origin "$BRANCH_NAME"
echo "Branch '$BRANCH_NAME' created and pushed"
