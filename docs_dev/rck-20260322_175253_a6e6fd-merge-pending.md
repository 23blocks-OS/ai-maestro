# Rechecker: Merge Pending

The rechecker plugin reviewed your latest commit and fixed bugs.

- **Worktree**: `rck-a6e6fd`
- **Branch with fixes**: `worktree-rck-a6e6fd`

## What you must do

When you finish your current task, merge the fixes and resolve any conflicts:

```bash
cd "/Users/emanuelesabetta/ai-maestro" && git merge worktree-rck-a6e6fd --no-edit
```

If there are merge conflicts, resolve them yourself and commit.
After merging, delete this file and the worktree branch:

```bash
rm rck-20260322_175253_a6e6fd-merge-pending.md && git branch -d worktree-rck-a6e6fd
```
