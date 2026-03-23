# Merge Conflict Resolution: worktree-rck-ed5d09 → feature/team-governance

Date: 2026-03-22
Conflicts resolved: 9 files, ~20 individual conflict blocks

## Strategy
- OURS (feature/team-governance, already incorporating rck-1f8cb0 + rck-561727): preferred by default
- THEIRS (worktree-rck-ed5d09): included when it had genuinely new improvements

## File-by-File Resolutions

### app/api/plugin-builder/build/route.ts
- Rewrote the POST function cleanly: kept OURS SyntaxError distinction in JSON parse catch, removed dead code (duplicate buildPlugin call at end of OURS), added THEIRS validation flow pattern.
- Result: clean separation of JSON parse errors (400) from service errors (500).

### app/api/plugin-builder/push/route.ts
- Single conflict in catch block wording. Kept OURS ("Malformed JSON" + "An unexpected error occurred") over THEIRS (different wording, verbose internal error message).

### app/api/plugin-builder/scan-repo/route.ts
- Conflict 1: Kept OURS (explicit `url` validation before `ref`, explicit string cast for scanRepo call).
- Conflict 2: Kept OURS (simple service error catch) since SyntaxError is already caught in the outer try above.

### components/plugin-builder/PluginComposer.tsx
- Single conflict in getSkillDisplayName. Took THEIRS improvement: `parts[2] || parts[parts.length - 1] || skill.id` (more defensive parsing of "source:plugin:skillname" format).

### components/plugin-builder/RepoScanner.tsx
- Conflict 1: Took THEIRS `ref.trim()` (trims whitespace) instead of OURS `ref`.
- Conflict 2: Kept OURS (stores lastScannedUrl/Ref snapshot for consistency), merged THEIRS `ref.trim()`.
- Conflict 3: Kept OURS (uses lastScannedUrl/Ref snapshots in handleAddSkill), merged THEIRS trim.
- Conflict 4: Kept OURS (key includes lastScannedRef for consistency with getSkillKey), merged THEIRS trim.

### components/plugin-builder/SkillPicker.tsx
- Single conflict: comment "Use filtered lengths so the count always matches the visible list". Took THEIRS comment (genuinely useful explanation).

### scripts/remote-install.sh
- Conflict 1: Took THEIRS (uses `@` as sed delimiter to avoid `/` conflict in URL values).
- Conflict 2: Took THEIRS (smarter pm2 restart: tries ecosystem.config.cjs then .js, falls back to name-based restart, warns instead of silent failure).
- Conflict 3: Kept OURS (`[][\.*^$|&\\/]` character class notation for portable bracket escaping).
- Conflict 4: Kept OURS (awk-based multiline substitution for ACTIVE_GATEWAYS_LIST, since macOS sed can't handle newlines in replacement).
- Conflict 5: Took THEIRS (uses double-quotes for INITIAL_PROMPT in tmux command, adds error handling on tmux new-session failure, adds sleep + attach logic).

### services/headless-router.ts
- All 3 conflicts were already resolved (file was clean before our python writes - likely resolved in a previous rechecker merge).

### services/plugin-builder-service.ts
- Conflict 1: Kept OURS (buildDispatched variable name, buildId/buildDir declared before try for cleanup access).
- Conflict 2: Kept OURS (buildDispatched flag set before fire).
- Conflict 3: Took THEIRS (added `.finally(() => { activeOps = Math.max(0, activeOps - 1) })` to runBuild promise chain - ensures activeOps is always decremented).
- Conflict 4: Kept OURS (buildDir cleanup in catch when build was never dispatched).
- Conflict 5: Kept OURS (more descriptive maxBuffer comment).

## Verification
All 9 files verified clean with grep for `<<<<<<<` and `>>>>>>>` patterns.
