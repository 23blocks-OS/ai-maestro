# P9 Review Fixes Applied

**Date:** 2026-02-26
**Pass:** P9

## SHOULD-FIX (Tests)

| ID | File | Fix |
|----|------|-----|
| SF-031 | tests/use-governance-hook.test.ts:41 | Added comment: "NOTE: Tests standalone function replicas. Phase 2 will use @testing-library/react for actual hook testing." |
| SF-032 | tests/governance-peers.test.ts:33-88 | Extracted shared vi.fn() references (mockExistsSync, mockReadFileSync, etc.) used by both named and default exports |
| SF-033 | tests/agent-config-governance-extended.test.ts:380-447 | Replaced manual globalThis.fetch save/restore with vi.stubGlobal('fetch', ...) + vi.unstubAllGlobals() |
| SF-034 | lib/task-registry.ts:123 + tests/task-registry.test.ts:241-245 | Changed `??` to `||` to normalize empty string assigneeAgentId to null; updated test expectation |

## SHOULD-FIX (Teams API)

| ID | File | Fix |
|----|------|-----|
| SF-001 | app/api/teams/notify/route.ts:26 | Whitelist only agentIds and teamName from body |
| SF-002 | app/api/teams/[id]/documents/route.ts:58 | Whitelist only title, content, pinned, tags from body |
| SF-003 | app/api/teams/notify/route.ts:26 | Added validation that each agentIds element is a string |
| SF-004 | services/teams-service.ts:120,300,468,623 | Replaced any[] with Team[], TaskWithDeps[], TeamDocument[], AgentNotifyResult[] |

## NIT (Types)

| ID | File | Fix |
|----|------|-----|
| NT-002 | types/service.ts:10-13 | Added "Phase 2: Refactor to discriminated union" comment |
| NT-003 | types/agent.ts:198-199,472-475 | Replaced `// DEPRECATED` with `/** @deprecated */` JSDoc |
| NT-004 | types/host.ts:55-58 | Added `Removal: v1.0.0` timeline to @deprecated JSDoc |
| NT-005 | types/governance.ts:77 | Added Phase 2 discriminated union plan comment |
| NT-016 | 4 test files | Standardized withLock callback type from `() => any` to `() => unknown` |
| NT-017 | tests/transfer-resolve-route.test.ts:23-29 | Imported MockTeamValidationException from test-utils/service-mocks.ts |

## NIT (Teams API)

| ID | File | Fix |
|----|------|-----|
| NT-001 | app/api/teams/[id]/chief-of-staff/route.ts:110 | Replaced internal error message exposure with generic "Internal server error" |

## Additional Fix (from linter)

| File | Fix |
|------|-----|
| tests/task-registry.test.ts:162-164 | Updated saveTasks test to match new void return type (SF-028 from prior pass) |

## Files Modified

1. tests/use-governance-hook.test.ts
2. tests/governance-peers.test.ts
3. tests/agent-config-governance-extended.test.ts
4. tests/task-registry.test.ts
5. tests/team-api.test.ts
6. tests/transfer-registry.test.ts
7. tests/team-registry.test.ts
8. tests/document-api.test.ts
9. tests/transfer-resolve-route.test.ts
10. tests/test-utils/service-mocks.ts
11. lib/task-registry.ts
12. app/api/teams/notify/route.ts
13. app/api/teams/[id]/documents/route.ts
14. app/api/teams/[id]/chief-of-staff/route.ts
15. services/teams-service.ts
16. types/service.ts
17. types/agent.ts
18. types/host.ts
19. types/governance.ts
