# Rechecker: Merge Pending

The rechecker plugin reviewed your latest commit and fixed bugs.

- **Worktree**: `rck-2a0adf`
- **Branch with fixes**: `worktree-rck-2a0adf`

## What you must do

**Read the full report** at the path above, then merge all rechecker fixes at once:

```bash
cd "/Users/emanuelesabetta/ai-maestro" && bash .rechecker/merge-worktrees.sh
```

Or merge this branch individually:

```bash
cd "/Users/emanuelesabetta/ai-maestro" && git merge worktree-rck-2a0adf --no-edit
```

If there are merge conflicts, resolve them yourself and commit.
After merging, delete this file and the worktree branch:

```bash
rm rck-20260322_214510_2a0adf-merge-pending.md && git branch -d worktree-rck-2a0adf
```
