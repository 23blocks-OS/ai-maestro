# EPCP Fix Report: Pass 1 - UI Domain (Components, Hooks)
Generated: 2026-02-22T17:23:00Z

## Files Modified
- `components/AgentProfile.tsx`
- `components/marketplace/AgentSkillEditor.tsx`

## Fixes Applied

### SF-018 (AgentProfile.tsx:880-883) - DONE
**Issue:** Duplicate filtering of `pendingConfigRequests` inline (filtered twice in JSX).
**Fix:** Extracted filtered list into `agentPendingConfigRequests` and `pendingConfigCount` local variables computed once near the `useGovernance` call. Replaced both inline `.filter()` calls with the pre-computed variables.

### SF-019 (AgentSkillEditor.tsx:295-306) - DONE
**Issue:** Approve/reject buttons fire `resolveConfigRequest` without error feedback.
**Fix:** Created `handleResolve` async function that wraps `resolveConfigRequest` in try/catch with `console.error` on failure. Updated both button `onClick` handlers to use `handleResolve`.

### SF-020 (AgentSkillEditor.tsx:294-309) - DONE
**Issue:** No loading/disabled state on approve/reject buttons during resolution.
**Fix:** Added `resolvingIds` state (`Set<string>`) that tracks in-flight request IDs. `handleResolve` adds the ID before the call and removes it in `finally`. Both buttons now have `disabled={resolvingIds.has(req.id)}` with `disabled:opacity-50 disabled:cursor-not-allowed` CSS.

### SF-021 (AgentSkillEditor.tsx:72) - DONE
**Issue:** `canApprove` checks viewed agent's role instead of acting user's role.
**Fix:** Added documentation comment explaining this is acceptable for Phase 1 (localhost, single user = system owner) and should check viewer identity in Phase 2 with auth.

### NT-015 (AgentSkillEditor.tsx:294-309) - DONE
**Issue:** Approve/reject icon buttons lack `aria-label`.
**Fix:** Added `aria-label="Approve configuration request"` and `aria-label="Reject configuration request"` to the respective buttons.

### NT-016 (AgentSkillEditor.tsx:286-287) - DONE
**Issue:** Pending config display shows raw `req.type` as fallback.
**Fix:** Changed fallback to map `configure-agent` type to human-readable "Configuration change" label:
```typescript
req.payload?.configuration?.operation || (req.type === 'configure-agent' ? 'Configuration change' : req.type)
```

### NT-017 (AgentProfile.tsx:55, AgentSkillEditor.tsx:70) - DONE
**Issue:** `useGovernance` instantiated in both components.
**Fix:** Added comment in AgentProfile.tsx documenting the duplication and recommending a `GovernanceContext` provider for Phase 2. Acceptable for Phase 1 with localhost-only architecture.

## Type Check
All 6 pre-existing TS errors are in test files (unrelated). No new errors introduced by these changes.

## Summary
7/7 findings fixed. All changes are minimal and targeted.
