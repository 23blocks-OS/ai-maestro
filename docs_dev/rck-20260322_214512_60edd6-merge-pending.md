# Rechecker: Merge Pending

The rechecker plugin reviewed your latest commit and fixed bugs.

- **Worktree**: `rck-60edd6`
- **Branch with fixes**: `worktree-rck-60edd6`

## What you must do

**Read the full report** at the path above, then merge all rechecker fixes at once:

```bash
cd "/Users/emanuelesabetta/ai-maestro" && bash .rechecker/merge-worktrees.sh
```

Or merge this branch individually:

```bash
cd "/Users/emanuelesabetta/ai-maestro" && git merge worktree-rck-60edd6 --no-edit
```

If there are merge conflicts, resolve them yourself and commit.
After merging, delete this file and the worktree branch:

```bash
rm rck-20260322_214512_60edd6-merge-pending.md && git branch -d worktree-rck-60edd6
```
