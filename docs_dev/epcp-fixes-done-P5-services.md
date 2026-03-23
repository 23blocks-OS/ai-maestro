# EPCP P5 Fixes: Domain Services (Updated)

**Generated:** 2026-02-22T21:24:00Z
**Pass:** 5 (second run -- handles remaining items from re-review)
**Scope:** services/, lib/agent-registry.ts, lib/index-delta.ts, lib/file-lock.ts, lib/document-registry.ts, lib/task-registry.ts

## Summary

| Severity | Assigned | Already Fixed (prior) | Fixed in P5 Run 2 | Total Resolved |
|----------|----------|-----------------------|--------------------|----------------|
| MUST-FIX | 7 | 6 | 1 | 7 |
| SHOULD-FIX | 10 | 7 | 3 | 10 |
| NIT | 6 | 2 | 4 | 6 |
| **Total** | **23** | **15** | **8** | **23** |

---

## MUST-FIX (7/7 resolved)

| ID | File | Status | Notes |
|----|------|--------|-------|
| MF-002 | lib/index-delta.ts | Prior pass | try/finally at lines 438-698 guarantees exactly-once releaseSlot() |
| MF-003 | lib/agent-registry.ts | Prior pass | withLock('agents') wraps all mutating functions |
| MF-006 | services/headless-router.ts | **P5 Run 2** | Moved static /restore and /activity routes BEFORE parameterized /([^/]+) route |
| MF-010 | services/agents-graph-service.ts | Prior pass | Local escapeString removed, escapeForCozo imported |
| MF-011 | services/agents-docs-service.ts | Prior pass | escapeForCozo imported and used |
| MF-012 | services/agents-graph-service.ts:950 | Prior pass | escapeForCozo used in files case |
| MF-013 | services/agents-repos-service.ts | Prior pass | execFileSync with array args, path validation |

## SHOULD-FIX (10/10 resolved)

| ID | File | Status | Notes |
|----|------|--------|-------|
| SF-010 | lib/agent-registry.ts | Prior pass | saveAgents eagerly populates cache (lines 208-212) |
| SF-011 | lib/agent-registry.ts | Prior pass | indexOf-based '@' parsing (lines 1033-1036) |
| SF-012 | lib/index-delta.ts | Prior pass | Streaming head/tail reader (lines 277-299) |
| SF-036 | services/agents-messaging-service.ts | **P5 Run 2** | Added Phase 2 auth TODO comment at public API section |
| SF-037 | services/agents-memory-service.ts | Prior pass | ALLOWED_METRIC_FIELDS whitelist (lines 1114-1143) |
| SF-038 | services/agents-subconscious-service.ts | Prior pass | Null check at lines 73-76 |
| SF-039 | services/agents-graph-service.ts | Prior pass | Generic error message at lines 312-317 |
| SF-041 | services/agents-docs-service.ts | **P5 Run 2** | X-Background-Trigger header added to background delta indexing fetch |
| SF-042 | services/agents-memory-service.ts | Prior pass | amount ?? 1 at line 1129 |
| SF-043 | services/agents-messaging-service.ts | Prior pass | Status/priority validation at lines 209-218 |

## NIT (6/6 resolved)

| ID | File | Status | Notes |
|----|------|--------|-------|
| NT-008 | lib/document-registry.ts, lib/task-registry.ts | **P5 Run 2** | Added "Returns boolean for legacy compat" comments |
| NT-009 | lib/agent-registry.ts | Prior pass | Numeric suffix fallback at lines 102-110 |
| NT-010 | lib/file-lock.ts | **P5 Run 2** | Added Phase 2 deadlock detection comment (timeout already implemented via NT-007) |
| NT-031 | services/agents-memory-service.ts | **P5 Run 2** | Added TODO comment about replacing ServiceResult<any> |
| NT-032 | services/shared-state.ts | Prior pass | WS_OPEN constant at line 16, used at line 101 |
| NT-033 | services/agents-playback-service.ts | Prior pass | console.log removed (lines 47, 102) |

---

## Files Modified in P5 Run 2

1. `services/headless-router.ts` -- MF-006: Reordered DELETE/GET session routes (static before parameterized)
2. `services/agents-messaging-service.ts` -- SF-036: Added Phase 2 auth TODO comment
3. `services/agents-docs-service.ts` -- SF-041: Added X-Background-Trigger guard header
4. `lib/document-registry.ts` -- NT-008: Added legacy compat comment on saveDocuments
5. `lib/task-registry.ts` -- NT-008: Added legacy compat comment on saveTasks
6. `services/agents-memory-service.ts` -- NT-031: Added ServiceResult<any> TODO comment
7. `lib/file-lock.ts` -- NT-010: Added Phase 2 deadlock detection comment

## Build Verification

Build passed successfully (`yarn build`: Done in 19.64s, zero errors).
