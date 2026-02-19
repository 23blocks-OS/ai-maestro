# Fix Exploration Findings
Generated: 2026-02-16

## 1. `/Users/emanuelesabetta/ai-maestro/lib/message-send.ts`

### forwardFromUI and checkMessageAllowed (lines 349-408)
- **forwardFromUI** is defined at line 360. It does NOT call `checkMessageAllowed` anywhere in the function body (lines 360-408+). The governance message filter is only applied in `sendFromUI()` at line 153-161.
- **Issue confirmed:** Forwarded messages bypass governance message filtering entirely.

### Empty agentId for unresolved recipients (lines 145-161)
- Line 146: `agentId: ''` is set for unresolved recipients.
- Line 153: The guard `if (fromAgent?.agentId && toResolved.agentId)` means that when `toResolved.agentId` is `''` (falsy), `checkMessageAllowed` is SKIPPED entirely. So messages to unresolved/external recipients bypass governance filtering.

## 2. `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`

### loadTeams() outside lock vs updateTeam inside lock (lines 39-93)
- Line 39: `const teams = loadTeams()` is called OUTSIDE any lock (at the top of the handler).
- Lines 87, 92: `await updateTeam(...)` is called later, which uses `withLock('teams', ...)` internally.
- **Issue confirmed:** TOCTOU race condition. The `teams` snapshot at line 39 can become stale by the time `updateTeam` runs at lines 87/92. The `fromTeam.agentIds` and `toTeam.agentIds` used to build the update payloads (lines 86, 91) may be outdated. Also the multi-closed-team check at lines 70-82 uses the stale `teams` array.

## 3. `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts`

### tasksFilePath — no teamId sanitization (lines 23-24)
- Line 23-24: `function tasksFilePath(teamId: string): string { return path.join(TEAMS_DIR, \`tasks-${teamId}.json\`) }`
- **Issue confirmed:** `teamId` is used directly in the file path without any sanitization. A `teamId` like `../../etc/passwd` or `../foo` would allow path traversal.

## 4. `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`

### deleteTeam does not clean up task files (lines 302-310)
- Lines 302-310: `deleteTeam` only filters the team from `teams` array and calls `saveTeams(filtered)`. It does NOT delete the corresponding `tasks-{teamId}.json` file.
- **Issue confirmed:** Orphaned task files remain on disk after team deletion.

## 5. `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts`

### removeAgentFromTeam: COS guard ordering vs filter (lines 193-222)
- Line 202: `const updatedAgentIds = team.agentIds.filter(...)` runs BEFORE the COS check.
- Lines 204-207: COS guard check happens AFTER the filter has already been computed.
- **Issue:** The filter result is computed wastefully before the guard, but this is purely a logic ordering inefficiency (not a bug per se, since the early return prevents the API call). However, the COS check at line 205 references `targetAgentId` against `team.chiefOfStaffId` which is correct.

### refresh dependency array (line 88)
- Line 88: `refresh` has `[]` empty dependency array. This is correct for a stable callback.
- Line 93: `useEffect(() => { refresh() }, [agentId, refresh])` — `agentId` in deps ensures re-fetch when agent changes. This looks correct.

### addAgentToTeam dependency array (line 190)
- Line 190: `[refresh, managerId, allTeams]` — includes `allTeams` which changes on every refresh, causing the callback to be recreated on every refresh cycle. This could cause unnecessary re-renders of consumers.

## 6. `/Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx`

### useState for name/description — no useEffect sync (lines 20-23)
- Line 22: `const [name, setName] = useState(team.name)`
- Line 23: `const [description, setDescription] = useState(team.description || '')`
- **No useEffect** exists to sync these local states when `team` prop changes (e.g., after a refresh or navigation to a different team).
- **Issue confirmed:** If the parent re-renders with a different `team` prop, the local `name` and `description` states will remain stale (showing the old team's values). `useState` initial value is only used on first mount.

## 7. `/Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts` (used by `app/teams/[id]/page.tsx`)

### loading initializes as false (line 16)
- Line 16: `const [loading, setLoading] = useState(false)`
- Line 38: `setLoading(true)` happens inside the `useEffect`.
- Line 26 (page.tsx): `if (loading || !team)` controls rendering.
- **Issue confirmed:** On first render, `loading` is `false` and `team` is `null`, so the condition `!team` catches it. However, the loading message at line 37 says `loading ? 'Loading team...' : 'Team not found'` — on first render before the effect runs, it will flash "Team not found" momentarily because `loading` starts as `false`. Should initialize `loading` as `true`.

## Summary Table

| # | File | Lines | Issue |
|---|------|-------|-------|
| 1a | message-send.ts | 360-408 | forwardFromUI never calls checkMessageAllowed |
| 1b | message-send.ts | 146, 153 | Empty agentId '' causes filter skip for unresolved recipients |
| 2 | transfers/.../resolve/route.ts | 39 vs 87,92 | loadTeams() outside lock = TOCTOU race |
| 3 | task-registry.ts | 23-24 | teamId not sanitized in file path (path traversal) |
| 4 | team-registry.ts | 302-310 | deleteTeam does not remove tasks-{teamId}.json |
| 5a | useGovernance.ts | 202 vs 205 | COS guard after filter (minor ordering) |
| 5b | useGovernance.ts | 190 | addAgentToTeam deps include allTeams (unstable) |
| 6 | TeamOverviewSection.tsx | 22-23 | No useEffect to sync name/description when team prop changes |
| 7 | useTeam.ts | 16 | loading starts false, flashes "Team not found" |
