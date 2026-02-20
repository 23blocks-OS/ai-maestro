# Test Compatibility Analysis: origin/main vs feature/team-governance
Generated: 2026-02-20T02:35:00Z
Merge base: f0d6cee1d3f9fa851f9a3aec36c7829484cddf0f

## Summary

**Overall Risk: MEDIUM.** Origin/main has 15 test files across `tests/` and `tests/services/` + `tests/test-utils/`. Our branch has 15 test files (all in `tests/` root). There are significant overlapping changes in 6 shared test files, but **no structural conflicts** in mocking patterns. Our 5 governance-only test files are safe. The origin's 5 new files (3 in `tests/services/`, 2 in `tests/test-utils/`) do not conflict with ours.

---

## File Inventory Comparison

### Files ONLY on origin/main (5 new files, no conflict)
| File | Purpose | Mocking Approach |
|------|---------|-----------------|
| `tests/services/teams-service.test.ts` | Service-layer orchestration tests (878 lines) | Mocks `@/lib/team-registry`, `@/lib/task-registry`, `@/lib/document-registry`, `@/lib/agent-registry`, `@/lib/notification-service` via `vi.hoisted()` |
| `tests/services/agents-core-service.test.ts` | Agent CRUD, wake/hibernate service tests | Mocks agent-runtime, agent-registry, hosts-config, etc. via `vi.hoisted()` |
| `tests/services/sessions-service.test.ts` | Session service logic tests | Mocks agent-runtime, session-persistence, hosts-config via `vi.hoisted()` |
| `tests/test-utils/fixtures.ts` | Shared factory functions: `makeTeam`, `makeTask`, `makeDocument`, `makeAgent`, etc. | No mocks, pure factories with `resetFixtureCounter()` |
| `tests/test-utils/service-mocks.ts` | Shared mock factories: `createRuntimeMock`, `createHostsConfigMock`, etc. | vi.fn() stubs for runtime, hosts, shared state, child_process |

### Files ONLY on our branch (5 governance files, safe)
| File | Purpose | Mocking Approach |
|------|---------|-----------------|
| `tests/governance.test.ts` | Governance lib + team-registry integration | Mocks `fs` (default export), `uuid`, `bcryptjs`, `@/lib/file-lock`, `@/lib/team-registry` |
| `tests/validate-team-mutation.test.ts` | sanitizeTeamName + validateTeamMutation pure functions | Mocks `fs`, `uuid`, `@/lib/file-lock` (minimal, for module loading only) |
| `tests/message-filter.test.ts` | checkMessageAllowed governance filter | Mocks `@/lib/governance`, `@/lib/team-registry` |
| `tests/transfer-registry.test.ts` | Transfer request CRUD | Mocks `fs` (named exports), `crypto`, `@/lib/file-lock` |
| `tests/transfer-resolve-route.test.ts` | Transfer resolve route handler | Mocks `@/lib/transfer-registry`, `@/lib/team-registry`, `@/lib/governance`, `@/lib/validation`, `@/lib/agent-registry`, `@/lib/notification-service`, `@/lib/file-lock` |

### Files on BOTH branches with CHANGES (6 files, need merge attention)
| File | Lines changed (our branch vs origin) | Conflict Risk |
|------|--------------------------------------|---------------|
| `tests/agent-registry.test.ts` | Origin adds `exec` mock to child_process + comment | **LOW** - additive change, our version lacks `exec` |
| `tests/amp-address.test.ts` | Origin changes `parseAMPAddress('alice@local')` expectation from null to parsed result | **MEDIUM** - behavioral change in expectations |
| `tests/team-api.test.ts` | Origin adds governance/acl/validation mocks + new CC-002/004/005/006 tests + async createTeam | **HIGH** - our branch has the same changes |
| `tests/team-registry.test.ts` | Origin adds file-lock mock, `type: 'open'`, async functions, `makeTeamCounter`, `saveTeams` tests, min-length test | **HIGH** - our branch has the same changes |
| `tests/task-registry.test.ts` | Origin adds UUID constants, file-lock mock, async functions, path traversal test, alias fallback tests | **HIGH** - our branch has the same changes |
| `tests/document-api.test.ts` | Origin adds file-lock mock, UUID-format IDs, CC-001/002/005/006 tests, tags test, XSS test | **HIGH** - our branch has the same changes |
| `tests/document-registry.test.ts` | Origin adds file-lock mock, UUID constants, async functions | **HIGH** - our branch has the same changes |

---

## Question 1: Do origin's new test fixtures conflict with our existing test helpers?

**ANSWER: NO CONFLICT.**

Origin introduces `tests/test-utils/fixtures.ts` with factory functions (`makeTeam`, `makeTask`, `makeDocument`, `makeAgent`, `makeHost`, `makeSession`). These are ONLY imported by the new `tests/services/*.test.ts` files.

Our governance tests define their OWN local `makeTeam()` helpers inline (e.g., `validate-team-mutation.test.ts:47`, `governance.test.ts` uses team-registry mock). There is no import collision because:
- Our tests do not import from `tests/test-utils/`
- Origin's fixtures import types from `@/types/team`, `@/types/task`, `@/types/document` -- types that our branch also defines
- The `Team` type in fixtures includes `type` field (matches our governance-extended type)

**Potential future issue:** If someone refactors our governance tests to use the shared fixtures, the `makeTeam` factory already includes `type` field support, so it would work.

## Question 2: Does origin's teams-service.test.ts mock the same lib/ modules our tests mock?

**ANSWER: YES, but at a DIFFERENT layer -- no conflict.**

Origin's `tests/services/teams-service.test.ts` mocks:
- `@/lib/team-registry` (loadTeams, createTeam, getTeam, updateTeam, deleteTeam)
- `@/lib/task-registry` (loadTasks, resolveTaskDeps, createTask, getTask, updateTask, deleteTask, wouldCreateCycle)
- `@/lib/document-registry` (loadDocuments, createDocument, getDocument, updateDocument, deleteDocument)
- `@/lib/agent-registry` (getAgent)
- `@/lib/notification-service` (notifyAgent)

Our tests that mock overlapping modules:
- `governance.test.ts` mocks `@/lib/team-registry` (loadTeams, getTeam) -- **same module, different functions**
- `message-filter.test.ts` mocks `@/lib/governance`, `@/lib/team-registry` (loadTeams)
- `transfer-resolve-route.test.ts` mocks `@/lib/team-registry` (loadTeams, saveTeams), `@/lib/governance`, `@/lib/agent-registry` (getAgent), `@/lib/notification-service` (notifyAgent)

**Key difference:** Origin's service tests mock at the `lib/` level to test `services/` orchestration. Our tests mock at the `lib/` OR `fs` level to test `lib/` functions directly or API route handlers. They are testing DIFFERENT layers and will not interfere.

**Both can coexist** because Vitest isolates mocks per test file.

## Question 3: Did origin change agent-registry.test.ts (which we also have)?

**ANSWER: YES -- minor additive change.**

Origin adds to the `child_process` mock:
```diff
+// Must include exec (used by agent-runtime.ts) and execSync (used by agent-registry.ts sync helpers)
 vi.mock('child_process', () => ({
+  exec: vi.fn((cmd: string, cb: Function) => cb(null, '', '')),
   execSync: vi.fn(),
 }))
```

Our branch does NOT have this change. During merge:
- **Git will auto-merge** this cleanly since our branch didn't touch these lines
- The `exec` mock is needed because `agent-runtime.ts` (which `agent-registry.ts` may transitively import) uses `exec`
- **Action needed: NONE** -- git merge will pick up the change automatically

## Question 4: Will our 5 governance test files still work after the merge?

**ANSWER: YES, with caveats.**

### governance.test.ts -- SAFE
- Mocks `fs` (default export), `uuid`, `bcryptjs`, `@/lib/file-lock`, `@/lib/team-registry`
- None of origin's changes affect the mocked interfaces
- Tests governance lib functions directly -- no dependency on service layer

### validate-team-mutation.test.ts -- SAFE
- Mocks only `fs`, `uuid`, `@/lib/file-lock` for module loading
- Tests pure functions `sanitizeTeamName` and `validateTeamMutation`
- No dependency on anything origin changed

### message-filter.test.ts -- SAFE
- Mocks `@/lib/governance` and `@/lib/team-registry`
- Tests `checkMessageAllowed` filter
- Origin doesn't modify governance or message-filter modules

### transfer-registry.test.ts -- SAFE
- Mocks `fs` (named exports), `crypto`, `@/lib/file-lock`
- Tests transfer-registry CRUD
- No overlap with origin's changes

### transfer-resolve-route.test.ts -- SAFE
- Mocks `@/lib/transfer-registry`, `@/lib/team-registry`, `@/lib/governance`, `@/lib/validation`, `@/lib/agent-registry`, `@/lib/notification-service`, `@/lib/file-lock`
- Tests resolve route handler
- Origin doesn't modify transfer-related modules

---

## Merge Strategy for the 6 Overlapping Test Files

### HIGH confidence auto-merge (origin change is additive, our branch didn't touch same lines):
1. **`tests/agent-registry.test.ts`** -- Origin adds `exec` mock. Our branch didn't change this area. Auto-merge.

### MEDIUM confidence -- need verification:
2. **`tests/amp-address.test.ts`** -- Origin CHANGED the expectation for `parseAMPAddress('alice@local')` from returning `null` to returning a parsed object. Our branch has the OLD expectation (returns null). This means origin changed the `parseAMPAddress` implementation. **After merge, our test must match origin's new behavior.** Git will auto-merge this since we didn't touch those lines, but we should verify the lib implementation matches.

### HIGH risk -- likely identical changes (our branch already has governance additions):
3. **`tests/team-api.test.ts`** -- Both branches added governance mocks, CC-002/004/005/006 tests, async createTeam. **These are likely the SAME changes** since our branch implemented governance. Git merge should detect identical additions. If not, manual resolution needed.
4. **`tests/team-registry.test.ts`** -- Both branches added file-lock mock, `type: 'open'`, async functions, saveTeams tests. Same situation as team-api.
5. **`tests/task-registry.test.ts`** -- Both branches added UUID constants, file-lock mock, async, path traversal tests. Same situation.
6. **`tests/document-api.test.ts`** -- Both branches added file-lock mock, UUID-format IDs, new tests. Same situation.
7. **`tests/document-registry.test.ts`** -- Both branches added file-lock mock, UUID constants, async. Same situation.

**Root cause of overlap:** Origin/main already merged our governance changes into the shared test files. The diffs show **our branch's changes are already on origin/main**. This means git merge will see identical content on both sides and auto-resolve for most hunks.

---

## Conclusion

| Category | Count | Risk |
|----------|-------|------|
| Our governance-only tests | 5 | NONE - fully isolated |
| Origin's new service tests | 3 | NONE - new layer, no overlap |
| Origin's new test-utils | 2 | NONE - only used by origin's service tests |
| Shared files with identical changes | 5 | LOW - same changes on both sides |
| Shared files with different changes | 2 | LOW-MEDIUM - agent-registry (additive), amp-address (behavioral) |

**Recommendation:** Merge will likely succeed automatically for most files. Post-merge, run `yarn test` to verify all 20 test files pass. Pay special attention to `amp-address.test.ts` if `parseAMPAddress` behavior changed.
