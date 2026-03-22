#!/usr/bin/env bash
# merge-rechecker-worktrees.sh — Merge all rechecker worktree branches into the current branch
#
# Usage:
#   ./scripts/merge-rechecker-worktrees.sh [--dry-run] [--ours-on-conflict]
#
# Options:
#   --dry-run           Show what would be merged without doing it
#   --ours-on-conflict  Auto-resolve conflicts by preferring current branch (ours)
#
# Prerequisites: clean working tree (no uncommitted changes)

set -euo pipefail

DRY_RUN=false
OURS_ON_CONFLICT=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --ours-on-conflict) OURS_ON_CONFLICT=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Uncommitted changes detected. Commit or stash first."
  echo "  git stash   OR   git add -A && git commit -m 'WIP'"
  exit 1
fi

# Find all rechecker worktree branches
WORKTREE_BRANCHES=$(git branch --list 'worktree-rck-*' 'worktree-rechecker-*' | sed 's/^[* ]*//')

if [ -z "$WORKTREE_BRANCHES" ]; then
  echo "No rechecker worktree branches found. Nothing to merge."
  exit 0
fi

echo ""
echo "Found rechecker branches:"
echo "$WORKTREE_BRANCHES" | while read -r branch; do
  commit=$(git log --oneline -1 "$branch" 2>/dev/null || echo "???")
  diff_stat=$(git diff --stat "$CURRENT_BRANCH...$branch" 2>/dev/null | tail -1)
  echo "  $branch  ($commit)"
  if [ -n "$diff_stat" ]; then
    echo "    $diff_stat"
  else
    echo "    (no changes vs current branch)"
  fi
done

if $DRY_RUN; then
  echo ""
  echo "[DRY RUN] Would merge the above branches. Run without --dry-run to proceed."
  exit 0
fi

echo ""
MERGED=0
SKIPPED=0
FAILED=0

for branch in $WORKTREE_BRANCHES; do
  echo "---"
  echo "Merging: $branch"

  # Check if branch has any diff vs current
  diff_count=$(git diff --stat "$CURRENT_BRANCH...$branch" 2>/dev/null | wc -l)
  if [ "$diff_count" -le 1 ]; then
    echo "  SKIP: No changes to merge"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Attempt merge
  if $OURS_ON_CONFLICT; then
    merge_output=$(git merge "$branch" --no-edit -X ours 2>&1) && merge_ok=true || merge_ok=false
  else
    merge_output=$(git merge "$branch" --no-edit 2>&1) && merge_ok=true || merge_ok=false
  fi

  if $merge_ok; then
    echo "  MERGED successfully"
    MERGED=$((MERGED + 1))
  else
    # Check if there are conflicts
    conflict_files=$(git diff --name-only --diff-filter=U 2>/dev/null)
    if [ -n "$conflict_files" ]; then
      echo "  CONFLICT in:"
      echo "$conflict_files" | sed 's/^/    /'
      echo ""
      echo "  Resolve conflicts manually, then run:"
      echo "    git add <resolved-files>"
      echo "    git commit --no-edit"
      echo "    # then re-run this script to continue with remaining branches"
      FAILED=$((FAILED + 1))
      echo ""
      echo "=== STOPPED: resolve conflicts before continuing ==="
      echo "Merged: $MERGED | Skipped: $SKIPPED | Failed: $FAILED | Remaining: $(echo "$WORKTREE_BRANCHES" | wc -l | tr -d ' ')"
      exit 1
    else
      echo "  FAILED: $merge_output"
      FAILED=$((FAILED + 1))
    fi
  fi
done

echo ""
echo "=== MERGE COMPLETE ==="
echo "Merged: $MERGED | Skipped: $SKIPPED | Failed: $FAILED"

# Clean up worktrees and branches
echo ""
echo "Cleaning up worktrees..."
for branch in $WORKTREE_BRANCHES; do
  # Remove worktree if exists
  wt_name=$(echo "$branch" | sed 's/^worktree-//')
  wt_path=".claude/worktrees/$wt_name"
  if [ -d "$wt_path" ]; then
    git worktree remove "$wt_path" --force 2>/dev/null && echo "  Removed worktree: $wt_path" || true
  fi
done

echo ""
echo "To delete the merged branches, run:"
echo "  git branch -D $(echo $WORKTREE_BRANCHES | tr '\n' ' ')"
