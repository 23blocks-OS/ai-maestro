# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:39:16.548Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-fixes-done-P9-all.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-fixes-done-P9-all.md
- Line 12: | SF-031 | tests/use-governance-hook.test.ts:41 | Added comment: "NOTE: Tests standalone function replicas. Phase 2 will use @testing-library/react for actual hook testing." |
- Line 13: | SF-032 | tests/governance-peers.test.ts:33-88 | Extracted shared vi.fn() references (mockExistsSync, mockReadFileSync, etc.) used by both named and default exports |
- Line 14: | SF-033 | tests/agent-config-governance-extended.test.ts:380-447 | Replaced manual globalThis.fetch save/restore with vi.stubGlobal('fetch', ...) + vi.unstubAllGlobals() |
- Line 15: | SF-034 | lib/task-registry.ts:123 + tests/task-registry.test.ts:241-245 | Changed `??` to `||` to normalize empty string assigneeAgentId to null; updated test expectation |
- Line 22: | SF-001 | app/api/teams/notify/route.ts:26 | Whitelist only agentIds and teamName from body |
- Line 23: | SF-002 | app/api/teams/[id]/documents/route.ts:58 | Whitelist only title, content, pinned, tags from body |
- Line 24: | SF-003 | app/api/teams/notify/route.ts:26 | Added validation that each agentIds element is a string |
- Line 25: | SF-004 | services/teams-service.ts:120,300,468,623 | Replaced any[] with Team[], TaskWithDeps[], TeamDocument[], AgentNotifyResult[] |
- Line 32: | NT-002 | types/service.ts:10-13 | Added "Phase 2: Refactor to discriminated union" comment |
- Line 33: | NT-003 | types/agent.ts:198-199,472-475 | Replaced `// DEPRECATED` with `/** @deprecated */` JSDoc |
- Line 34: | NT-004 | types/host.ts:55-58 | Added `Removal: v1.0.0` timeline to @deprecated JSDoc |
- Line 35: | NT-005 | types/governance.ts:77 | Added Phase 2 discriminated union plan comment |
- Line 36: | NT-016 | 4 test files | Standardized withLock callback type from `() => any` to `() => unknown` |
- Line 37: | NT-017 | tests/transfer-resolve-route.test.ts:23-29 | Imported MockTeamValidationException from test-utils/service-mocks.ts |
- Line 43: | NT-001 | app/api/teams/[id]/chief-of-staff/route.ts:110 | Replaced internal error message exposure with generic "Internal server error" |
- Line 49: | tests/task-registry.test.ts:162-164 | Updated saveTasks test to match new void return type (SF-028 from prior pass) |
- Line 52: 1. tests/use-governance-hook.test.ts
- Line 53: 2. tests/governance-peers.test.ts
- Line 54: 3. tests/agent-config-governance-extended.test.ts
- Line 55: 4. tests/task-registry.test.ts
- Line 56: 5. tests/team-api.test.ts
- Line 57: 6. tests/transfer-registry.test.ts
- Line 58: 7. tests/team-registry.test.ts
- Line 59: 8. tests/document-api.test.ts
- Line 60: 9. tests/transfer-resolve-route.test.ts
- Line 61: 10. tests/test-utils/service-mocks.ts
- Line 62: 11. lib/task-registry.ts
- Line 63: 12. app/api/teams/notify/route.ts
- Line 64: 13. app/api/teams/[id]/documents/route.ts
- Line 65: 14. app/api/teams/[id]/chief-of-staff/route.ts
- Line 66: 15. services/teams-service.ts
- Line 67: 16. types/service.ts
- Line 68: 17. types/agent.ts
- Line 69: 18. types/host.ts
- Line 70: 19. types/governance.ts
```