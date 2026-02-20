# Fix Report: governance-service.ts CC-001 through CC-008

**Date:** 2026-02-20
**File:** `/Users/emanuelesabetta/ai-maestro/services/governance-service.ts`
**Audit source:** `docs_dev/epcp-correctness-governance-service.md`

## Fixes Applied

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| CC-001 | MUST-FIX | Added outer try/catch to `resolveTransferReq` catching `TeamValidationException` (returns `{ error, status: error.code }`) and generic errors (returns 500) | DONE |
| CC-002 | MUST-FIX | Added try/catch around `createTransferRequest()` call; catches duplicate Error (409) and generic errors (500) | DONE |
| CC-003 | SHOULD-FIX | Added `existingRequest: duplicate` to 409 response data for duplicate transfers | DONE |
| CC-004 | SHOULD-FIX | Resolved by CC-001 -- `TeamValidationException` is now used in the catch block | DONE |
| CC-005 | SHOULD-FIX | Moved notification block OUTSIDE lock try/finally; stored `fromTeamName`/`toTeamName` in let declarations before lock, assigned inside, used after finally | DONE |
| CC-006 | SHOULD-FIX | Changed `config.managerId ?? null` to `config.managerId` | DONE |
| CC-007 | NIT | Imported `TransferRequest` type from `@/types/governance`; replaced `any` in 3 return type signatures | DONE |
| CC-008 | NIT | Removed dead `rejectReason` and `resolution` params from `createTransferReq` and their validation | DONE |

## Type Check

- `npx tsc --noEmit` -- zero errors in `governance-service.ts`
- One pre-existing error in `tests/transfer-resolve-route.test.ts` (unrelated)
