# Test & Build Results — P1 (2026-02-22)

## Test Summary

| Metric | Value |
|--------|-------|
| Test Files | 2 failed, 27 passed (29 total) |
| Tests | 17 failed, 819 passed (836 total) |
| Duration | 4.91s |
| Exit Code | 1 (FAIL) |

## Failing Test Files

### 1. `tests/agent-config-governance-extended.test.ts` — 16 failures

All 16 failures are in the `config deploy service` describe block. Root cause: the agent ID validation rejects the test agent IDs with `"Invalid agent ID format"` before the actual config-deploy logic runs, so every test that expects 200/404/500 gets 400 instead.

| # | Test Name | Expected | Got | Error |
|---|-----------|----------|-----|-------|
| 1 | add-skill creates skill directory and SKILL.md | 200 | 400 | Invalid agent ID format |
| 2 | add-skill blocks path traversal in skill name | contains 'Invalid skill name' | 'Invalid agent ID format' | wrong error message |
| 3 | remove-skill removes existing skill directory | 200 | 400 | Invalid agent ID format |
| 4 | remove-skill is idempotent for non-existent skill | 200 | 400 | Invalid agent ID format |
| 5 | add-plugin creates plugin directory | 200 | 400 | Invalid agent ID format |
| 6 | remove-plugin removes existing plugin directory | 200 | 400 | Invalid agent ID format |
| 7 | update-hooks merges hooks into settings.json | 200 | 400 | Invalid agent ID format |
| 8 | update-mcp merges mcpServers into settings.json | 200 | 400 | Invalid agent ID format |
| 9 | update-model calls updateAgentById with new model | 200 | 400 | Invalid agent ID format |
| 10 | bulk-config handles multiple operations | 200 | 400 | Invalid agent ID format |
| 11 | returns 400 for invalid operation | contains 'Invalid configuration operation' | 'Invalid agent ID format' | wrong error message |
| 12 | returns 404 when agent does not exist | 404 | 400 | Invalid agent ID format |
| 13 | returns 400 when agent has no working directory | contains 'no working directory' | 'Invalid agent ID format' | wrong error message |
| 14 | add-plugin blocks path traversal in plugin name | contains 'Invalid plugin name' | 'Invalid agent ID format' | wrong error message |
| 15 | update-hooks handles missing settings.json gracefully | 200 | 400 | Invalid agent ID format |
| 16 | deployConfigToAgent returns 500 on unexpected error | 500 | 400 | Invalid agent ID format |

**Root cause analysis:** The `deployConfigToAgent` service (or the route handler calling it) validates the agent ID format before processing. The test fixtures use agent IDs that don't pass this validation (likely not UUID format). The fix is either:
- (a) Update test fixtures to use valid UUID-format agent IDs, or
- (b) Adjust the validation regex to accept the test IDs.

### 2. `tests/services/agents-core-service.test.ts` — 1 failure

| # | Test Name | Expected | Got | Error |
|---|-----------|----------|-----|-------|
| 1 | registers cloud agent with websocket URL | 200 | 400 | expected 400 to be 200 |

**Root cause analysis:** The `registerAgent` service rejects the cloud agent registration payload with 400. Likely the `websocketUrl` field or cloud agent type is not recognized by the current validation logic.

---

## Build Summary

| Metric | Value |
|--------|-------|
| Status | SUCCESS (with warnings) |
| Duration | 19.25s |
| Exit Code | 0 |

### Build Warnings (non-blocking)

1. **Critical dependency warnings** (3):
   - `lib/cerebellum/voice-subsystem.ts` — dynamic import expression
   - `lib/memory/claude-provider.ts` — dynamic import expression
   - `@huggingface/transformers` — `import.meta` access unsupported

2. **React hooks warnings** (2):
   - `app/companion/page.tsx:122` — useEffect missing dependency `activeAgentId`
   - `app/companion/page.tsx:167` — useEffect missing dependency `activeAgentId`

3. **Other lint warnings** (2):
   - `components/team-meeting/MeetingTerminalArea.tsx:162` — img element should use next/image
   - `services/headless-router.ts:66` — Unexpected `var`, use `let` or `const`

### Build Output

All pages compiled successfully. Static and dynamic routes generated without errors.

---

## Verdict

- **Tests:** 819/836 pass (97.97%), 17 failures in 2 files
- **Build:** Clean success (warnings only, no errors)
- **Blocking issues:** The 16 config-governance failures share a single root cause (agent ID validation). The 1 cloud-agent failure is a separate validation issue.
