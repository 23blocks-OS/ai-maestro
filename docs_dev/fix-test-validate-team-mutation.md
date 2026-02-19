# Fix: validate-team-mutation.test.ts cleanup hook

## Change
- Replaced `afterEach` with `beforeEach` for mock cleanup consistency
- Removed `vi.restoreAllMocks()` (not needed; `vi.mock` at module level is persistent)
- Kept `vi.clearAllMocks()` in `beforeEach` to reset call counts before each test
- Updated import from `afterEach` to `beforeEach`

## File
`/Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts`

## Verification
- TypeScript syntax check: PASSED (createSourceFile parsed without errors)
