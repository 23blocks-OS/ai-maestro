#!/usr/bin/env bash
# merge-rechecker-worktrees.sh — Fully automated merge of rechecker worktree branches
#
# Merges all worktree-rck-* branches into the current branch.
# Handles dirty working tree (auto-stash), conflicts (--ours strategy),
# file cleanup (moves reports to docs_dev/), and branch deletion (-d safe).
#
# Usage:
#   ./scripts/merge-rechecker-worktrees.sh              # full auto merge
#   ./scripts/merge-rechecker-worktrees.sh --dry-run    # preview only
#   ./scripts/merge-rechecker-worktrees.sh --no-delete  # merge but keep branches
#
# Designed to be called by Claude Code without manual intervention.
# All git operations use safe flags (no -D, no --force, no checkout --).

set -euo pipefail

GIT_ROOT="$(git rev-parse --show-toplevel)"
cd "$GIT_ROOT"

DRY_RUN=false
DELETE_BRANCHES=true

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --no-delete) DELETE_BRANCHES=false ;;
    --help|-h)
      cat <<'HELP'
Usage: merge-rechecker-worktrees.sh [options]

Fully automated merge of rechecker worktree branches into the current branch.

Options:
  --dry-run     Preview what would be merged without doing anything
  --no-delete   Merge branches but don't delete them afterward
  --help, -h    Show this help

Use Cases:
  After rechecker runs:  ./scripts/merge-rechecker-worktrees.sh
  Preview first:         ./scripts/merge-rechecker-worktrees.sh --dry-run
  Keep branches:         ./scripts/merge-rechecker-worktrees.sh --no-delete

Behavior:
  1. Auto-stashes uncommitted changes (restores after)
  2. Merges each worktree-rck-* branch with -X ours (our fixes take priority)
  3. Moves rck-*-report.md and rck-*-merge-pending.md to docs_dev/
  4. Deletes merged branches with safe -d flag (keeps unmerged ones)
  5. Auto-commits cleanup if there are staged changes
HELP
      exit 0
      ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

CURRENT_BRANCH=$(git branch --show-current)
DOCS_DEV="$GIT_ROOT/docs_dev"
mkdir -p "$DOCS_DEV"

# Collect worktree branches
BRANCHES=$(git branch --list 'worktree-rck-*' 'worktree-rechecker-*' | sed 's/^[* ]*//' || true)
if [[ -z "$BRANCHES" ]]; then
  echo "No rechecker worktree branches found. Nothing to do."
  exit 0
fi

BRANCH_COUNT=$(echo "$BRANCHES" | wc -l | tr -d ' ')
echo "Found $BRANCH_COUNT rechecker branches to merge into $CURRENT_BRANCH"

if $DRY_RUN; then
  echo ""
  echo "DRY RUN — would merge these branches:"
  echo "$BRANCHES" | while read -r branch; do
    diff_count=$(git diff --stat "$CURRENT_BRANCH...$branch" --ignore-submodules 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$diff_count" -le 1 ]]; then
      echo "  $branch  (no changes — would skip)"
    else
      echo "  $branch  ($((diff_count - 1)) files changed)"
    fi
  done
  exit 0
fi

# ---- Step 1: Auto-stash if dirty ----
STASHED=false
if ! git diff --quiet --ignore-submodules 2>/dev/null || ! git diff --cached --quiet --ignore-submodules 2>/dev/null; then
  echo "Auto-stashing uncommitted changes..."
  git stash push --include-untracked -m "auto-stash: rechecker merge $(date +%Y%m%d_%H%M%S)"
  STASHED=true
fi

# ---- Step 2: Move existing rechecker files to docs_dev ----
for pattern in "rck-*-merge-pending.md" "rck-*-report.md"; do
  for f in $pattern; do
    [[ -f "$f" ]] && mv "$f" "$DOCS_DEV/" 2>/dev/null || true
  done
done

# ---- Step 3: Merge each branch ----
MERGED=0
SKIPPED=0
FAILED=0

echo ""
while IFS= read -r branch; do
  [[ -z "$branch" ]] && continue
  echo -n "  $branch... "

  # Check if branch has meaningful changes
  diff_count=$(git diff --stat "$CURRENT_BRANCH...$branch" --ignore-submodules 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$diff_count" -le 1 ]]; then
    echo "skip (no changes)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Merge with ours strategy — our verified fixes take priority over rechecker's
  if git merge -X ours "$branch" --no-edit 2>/dev/null; then
    echo "merged ($((diff_count - 1)) files)"
    MERGED=$((MERGED + 1))
  else
    git merge --abort 2>/dev/null || true
    echo "FAILED (aborted)"
    FAILED=$((FAILED + 1))
  fi
done <<< "$BRANCHES"

# ---- Step 4: Move new rechecker files to docs_dev ----
for pattern in "rck-*-merge-pending.md" "rck-*-report.md"; do
  for f in $pattern; do
    [[ -f "$f" ]] && mv "$f" "$DOCS_DEV/" 2>/dev/null || true
  done
done

# ---- Step 5: Delete merged branches (safe -d) ----
DELETED=0
KEPT=0
if $DELETE_BRANCHES; then
  echo ""
  while IFS= read -r branch; do
    [[ -z "$branch" ]] && continue
    if git branch -d "$branch" 2>/dev/null; then
      DELETED=$((DELETED + 1))
    else
      KEPT=$((KEPT + 1))
    fi
  done <<< "$BRANCHES"
fi

# ---- Step 6: Auto-commit cleanup ----
# Stage any deleted tracked rechecker files
git add rck-*.md reports_dev/rck-*.md .rechecker/rck-progress.json 2>/dev/null || true

if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "chore: merge $MERGED rechecker worktrees + cleanup reports" 2>/dev/null || true
  echo "  Auto-committed cleanup"
fi

# ---- Step 7: Restore stash ----
if $STASHED; then
  echo "Restoring stashed changes..."
  git stash pop 2>/dev/null || echo "  WARNING: stash pop failed — check 'git stash list'"
fi

# ---- Summary ----
echo ""
echo "=== Done ==="
echo "  Merged:  $MERGED"
echo "  Skipped: $SKIPPED (no changes)"
echo "  Failed:  $FAILED"
if $DELETE_BRANCHES; then
  echo "  Deleted: $DELETED branches"
  [[ $KEPT -gt 0 ]] && echo "  Kept:    $KEPT (not fully merged — safe)"
fi
