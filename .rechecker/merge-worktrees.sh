#!/usr/bin/env bash
# merge-worktrees.sh — Merge all rechecker worktree branches and clean up
#
# Standalone script. Only requires: git, bash. No Claude Code dependency.
# Run from any git repo where the rechecker plugin created worktrees.
#
# Usage:
#   bash merge-worktrees.sh [--dry-run] [--ours-on-conflict] [--no-cleanup]
#
# Options:
#   --dry-run           Show what would be merged without doing it
#   --ours-on-conflict  Auto-resolve conflicts by preferring current branch (ours)
#   --no-cleanup        Skip worktree/branch/file cleanup after merging

set -euo pipefail

DRY_RUN=false
OURS_ON_CONFLICT=false
NO_CLEANUP=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --ours-on-conflict) OURS_ON_CONFLICT=true ;;
    --no-cleanup) NO_CLEANUP=true ;;
    -h|--help)
      sed -n '2,/^$/s/^# \?//p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# Must be in a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: Not inside a git repository."
  exit 1
fi

GIT_ROOT=$(git rev-parse --show-toplevel)
CURRENT_BRANCH=$(git branch --show-current)
echo "Git root: $GIT_ROOT"
echo "Current branch: $CURRENT_BRANCH"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Uncommitted changes detected. Commit or stash first."
  echo "  git stash   OR   git add -A && git commit -m 'WIP'"
  exit 1
fi

# Find all rechecker worktree branches (both naming conventions)
# Strip leading markers: * (current), + (worktree checkout), spaces
WORKTREE_BRANCHES=$(git branch --list 'worktree-rck-*' 'worktree-rechecker-*' | sed 's/^[+* ]*//' || true)

if [ -z "$WORKTREE_BRANCHES" ]; then
  echo "No rechecker worktree branches found. Nothing to merge."
  exit 0
fi

# Remove worktrees FIRST — can't merge a branch that's checked out in a worktree
echo ""
echo "Removing worktrees before merge..."
git worktree list --porcelain 2>/dev/null | {
  wt_path=""
  while IFS= read -r line; do
    if [[ "$line" == "worktree "* ]]; then
      wt_path="${line#worktree }"
    elif [[ "$line" == "branch refs/heads/worktree-rck-"* ]] || [[ "$line" == "branch refs/heads/worktree-rechecker-"* ]]; then
      if [ -n "${wt_path:-}" ] && [ -d "$wt_path" ]; then
        git worktree remove "$wt_path" --force 2>/dev/null && echo "  Removed worktree: $wt_path" || echo "  Failed to remove: $wt_path"
      fi
    fi
  done
}
# Prune stale worktree references
git worktree prune 2>/dev/null

BRANCH_COUNT=$(echo "$WORKTREE_BRANCHES" | wc -l | tr -d ' ')
echo ""
echo "Found $BRANCH_COUNT rechecker branch(es):"
for branch in $WORKTREE_BRANCHES; do
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
    conflict_files=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
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
      echo "Merged: $MERGED | Skipped: $SKIPPED | Failed: $FAILED"
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

if $NO_CLEANUP; then
  echo ""
  echo "Cleanup skipped (--no-cleanup). To clean up manually:"
  echo "  git worktree list  # find rechecker worktrees"
  echo "  git branch -D $(echo $WORKTREE_BRANCHES | tr '\n' ' ')"
  exit 0
fi

# Worktrees already removed before merge step — just delete branches and files

# Delete merged branches
echo ""
echo "Deleting merged branches..."
for branch in $WORKTREE_BRANCHES; do
  git branch -D "$branch" 2>/dev/null && echo "  Deleted branch: $branch" || echo "  Failed to delete: $branch"
done

# Clean up merge-pending files
PENDING_FILES=$(find "$GIT_ROOT" -maxdepth 1 -name 'rck-*-merge-pending.md' 2>/dev/null || true)
if [ -n "$PENDING_FILES" ]; then
  echo ""
  echo "Removing merge-pending files..."
  echo "$PENDING_FILES" | while read -r f; do
    rm -f "$f" && echo "  Removed: $(basename "$f")"
  done
fi

echo ""
echo "Done."
