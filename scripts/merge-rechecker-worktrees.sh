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

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null) || { echo "Error: Must be checked out to a branch (not detached HEAD)." >&2; exit 1; }
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
    # Use a single --name-only call for both empty check and count (avoids redundant --stat call)
    diff_files=$(git diff --name-only "$CURRENT_BRANCH..$branch" --ignore-submodules 2>/dev/null)
    if [[ -z "$diff_files" ]]; then
      echo "  $branch  (no changes — would skip)"
    else
      diff_file_count=$(echo "$diff_files" | wc -l | tr -d ' ')
      echo "  $branch  ($diff_file_count files changed)"
    fi
  done
  exit 0
fi

# ---- Step 1: Auto-stash if dirty ----
STASHED=false
# Check for modified tracked files (staged or unstaged) AND untracked files
if ! git diff --quiet --ignore-submodules 2>/dev/null || \
   ! git diff --cached --quiet --ignore-submodules 2>/dev/null || \
   git ls-files --others --exclude-standard 2>/dev/null | grep -q .; then
  echo "Auto-stashing uncommitted changes..."
  git stash push --include-untracked -m "auto-stash: rechecker merge $(date +%Y%m%d_%H%M%S)"
  STASHED=true
fi

# ---- Step 2: Move existing rechecker files to docs_dev ----
for pattern in "rck-*-merge-pending.md" "rck-*-report.md"; do
  shopt -s nullglob
  # shellcheck disable=SC2206  # intentional glob expansion into array
  files=( $pattern )
  shopt -u nullglob
  for f in "${files[@]}"; do
    if [[ -f "$f" ]]; then
      if ! mv "$f" "$DOCS_DEV/"; then
        echo "WARNING: Failed to move '$f' to '$DOCS_DEV/'" >&2
      fi
    fi
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

  # Check if branch has meaningful changes — single --name-only call for both empty check and count
  diff_files=$(git diff --name-only "$CURRENT_BRANCH..$branch" --ignore-submodules 2>/dev/null)
  if [[ -z "$diff_files" ]]; then
    echo "skip (no changes)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  diff_file_count=$(echo "$diff_files" | wc -l | tr -d ' ')

  # Merge with ours strategy — our verified fixes take priority over rechecker's
  if git merge -X ours "$branch" --no-edit; then
    echo "merged ($diff_file_count files)"
    MERGED=$((MERGED + 1))
  else
    git merge --abort 2>/dev/null || true
    echo "FAILED (aborted)"
    FAILED=$((FAILED + 1))
  fi
done <<< "$BRANCHES"

# ---- Step 4: Move new rechecker files to docs_dev ----
for pattern in "rck-*-merge-pending.md" "rck-*-report.md"; do
  shopt -s nullglob
  # shellcheck disable=SC2206  # intentional glob expansion into array
  files=( $pattern )
  shopt -u nullglob
  for f in "${files[@]}"; do
    if [[ -f "$f" ]]; then
      if ! mv "$f" "$DOCS_DEV/"; then
        echo "WARNING: Failed to move '$f' to '$DOCS_DEV/'" >&2
      fi
    fi
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
# Stage any deleted tracked rechecker files and moved files in docs_dev
# Use update mode (-u) for deletions from root, then add docs_dev additions explicitly
git add -u . 2>/dev/null || echo "WARNING: Failed to stage tracked file deletions" >&2
shopt -s nullglob
files=( docs_dev/rck-*.md )
for f in "${files[@]}"; do
  [[ -f "$f" ]] && git add "$f"
done
shopt -u nullglob
if [[ -f .rechecker/rck-progress.json ]]; then
  if ! git add .rechecker/rck-progress.json; then
    echo "WARNING: Failed to add .rechecker/rck-progress.json" >&2
  fi
fi

if ! git diff --cached --quiet 2>/dev/null; then
  if ! git commit -m "chore: merge $MERGED rechecker worktrees + cleanup reports"; then
    echo "WARNING: Auto-commit of cleanup failed." >&2
  else
    echo "  Auto-committed cleanup"
  fi
fi

# ---- Step 7: Restore stash ----
if $STASHED; then
  echo "Restoring stashed changes..."
  if git stash apply; then
    git stash drop
  else
    echo "ERROR: Failed to restore stashed changes due to conflicts." >&2
    echo "Please resolve conflicts manually. The stash entry has NOT been dropped." >&2
    echo "Run 'git stash drop' after resolving to clean up." >&2
    exit 1
  fi
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
