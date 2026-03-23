# EPCP Fixes Done - Pass 5 - UI Domain

**Generated:** 2026-02-22T05:01:00Z
**Pass:** 5
**Domain:** UI (hooks, components, pages)

## Summary

| Severity | Assigned | Fixed | Deferred | Notes |
|----------|----------|-------|----------|-------|
| MUST-FIX | 2 | 2 | 0 | |
| SHOULD-FIX | 8 | 7 | 1 | SF-016 deferred (requires new API endpoint) |
| NIT | 5 | 2 | 3 | NT-009/010/011 acknowledged as no-action-needed per review |
| **Total** | **15** | **11** | **4** | |

## MUST-FIX

### MF-004: Unsafe type assertion on params.id
**File:** `app/teams/[id]/page.tsx:23`
**Fix:** Replaced `params.id as string` with runtime guard `typeof params.id === 'string' ? params.id : ''`. When empty, the existing `!team` guard renders "Team not found" error state.

### MF-005: Missing AbortController in useTeam fetch
**File:** `hooks/useTeam.ts:33-41`
**Fix:** Added AbortController to the useEffect. The signal is passed to `fetchTeam()` which forwards it to `fetch()`. On cleanup (unmount or teamId change), `controller.abort()` cancels in-flight requests. AbortError is silently ignored. State updates are guarded against aborted signals. Pattern matches `useGovernance` hook.

## SHOULD-FIX

### SF-009: Unsafe `error as Error` cast in useWebSocket
**File:** `hooks/useWebSocket.ts:170`
**Fix:** Replaced `error as Error` with `error instanceof Error ? error : new Error(String(error))`.

### SF-010: useTerminal returns terminalRef.current which does not trigger re-renders
**File:** `hooks/useTerminal.ts:341`
**Fix:** Added `terminalInstance` state variable mirroring `terminalRef.current`. Updated all 4 locations where the ref is set/cleared to also update state. Return value now uses `terminalInstance` so consumers re-render when terminal is created/disposed. Ref is still used internally for synchronous callback access.

### SF-011: No exponential backoff for WebSocket reconnection
**File:** `hooks/useWebSocket.ts:154-159`
**Fix:** Replaced fixed `WS_RECONNECT_DELAY = 3000` with `WS_RECONNECT_BACKOFF = [100, 500, 1000, 2000, 5000]` array as documented in CLAUDE.md architecture section. Reconnection delay now uses `WS_RECONNECT_BACKOFF[attemptIndex]` for proper exponential backoff.

### SF-012: Modal dialogs lack role="dialog" and aria-modal
**File:** `app/teams/page.tsx:241-293, 296-317`
**Fix:** Added `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` to both the Create Team and Delete Confirmation dialog containers. Added `id` attributes to the corresponding `<h4>` titles.

### SF-013: Create Team input lacks explicit label element
**File:** `app/teams/page.tsx:252-262`
**Fix:** Added `aria-label="Team name"` to the input element.

### SF-014: Connection status indicator uses color-only differentiation
**File:** `components/TerminalView.tsx:631-635`
**Fix:** Added `role="status"` and `aria-label={isConnected ? 'Connected' : 'Disconnected'}` to the status dot.

### SF-015: Emoji-only buttons lack aria-labels
**File:** `components/TerminalView.tsx:651-716`
**Fix:** Added `aria-label` to all 5 emoji-only buttons (Notes toggle, Logging, Copy, Paste, Clear). Each aria-label matches the button's `title` attribute.

### SF-016: N+1 fetch pattern in teams list (DEFERRED)
**File:** `app/teams/page.tsx:37-51`
**Status:** Deferred to backend domain. Requires creating a new `/api/teams/stats` endpoint which is a backend concern. The existing code already documents this as a Phase 2 improvement.

## NIT

### NT-008: screenReaderMode explicitly disabled
**File:** `hooks/useTerminal.ts:107`
**Fix:** Expanded the comment to explain the trade-off: performance degradation with high-output sessions vs. accessibility. Documents that terminal accessibility is handled via Copy button and aria-labels on controls.

### NT-009: GovernancePasswordDialog redundant state reset on close (NO ACTION)
**File:** `components/governance/GovernancePasswordDialog.tsx:26-43`
**Status:** Review notes "The duplication is defensive and acceptable." No change needed.

### NT-010: localStorage reads use mount-only effects without storageId in deps (NO ACTION)
**File:** `components/TerminalView.tsx:498-519`
**Status:** Review notes "No action needed for current tab-based architecture." No change needed.

### NT-011: RoleBadge default case uses String() conversion (NO ACTION)
**File:** `components/governance/RoleBadge.tsx:64-72`
**Status:** Review notes "The defensive pattern is correct. No change needed."

### NT-012: TeamOverviewSection re-fetches repos on every section expand
**File:** `components/zoom/AgentProfileTab.tsx:74-93`
**Fix:** Added `reposLoaded` state guard. Repos are fetched only on first expand; subsequent toggles skip the fetch. Guard resets when agent changes via `initialAgent` prop.

## Files Modified

1. `app/teams/[id]/page.tsx` - MF-004
2. `hooks/useTeam.ts` - MF-005
3. `hooks/useWebSocket.ts` - SF-009, SF-011
4. `hooks/useTerminal.ts` - SF-010, NT-008
5. `components/TerminalView.tsx` - SF-014, SF-015
6. `app/teams/page.tsx` - SF-012, SF-013
7. `components/zoom/AgentProfileTab.tsx` - NT-012

## Verification

TypeScript compilation check: all 7 modified files pass with zero new type errors.
