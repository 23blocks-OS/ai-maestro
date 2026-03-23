# Rechecker: Merge Pending

The rechecker plugin reviewed your latest commit and fixed bugs.

- **Worktree**: `rck-a98a0c`
- **Branch with fixes**: `worktree-rck-a98a0c`

## What you must do

**Read the full report** at the path above, then merge all rechecker fixes at once:

```bash
cd "/Users/emanuelesabetta/ai-maestro" && bash .rechecker/merge-worktrees.sh
```

Or merge this branch individually:

```bash
cd "/Users/emanuelesabetta/ai-maestro" && git merge worktree-rck-a98a0c --no-edit
```

If there are merge conflicts, resolve them yourself and commit.
After merging, delete this file and the worktree branch:

```bash
rm rck-20260322_214535_a98a0c-merge-pending.md && git branch -d worktree-rck-a98a0c
```
