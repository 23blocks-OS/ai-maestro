# Test Report: manager-trust.ts — 2026-02-21

## Summary
- **File**: `/Users/emanuelesabetta/ai-maestro/tests/manager-trust.test.ts`
- **Module under test**: `/Users/emanuelesabetta/ai-maestro/lib/manager-trust.ts`
- **Tests written**: 15
- **Tests passing**: 15/15
- **Duration**: 5ms (141ms total with setup)

## Test Results

| # | Function | Test | Result |
|---|----------|------|--------|
| 1 | loadManagerTrust | returns defaults when file is missing | PASS |
| 2 | loadManagerTrust | reads existing file correctly | PASS |
| 3 | loadManagerTrust | handles corrupted JSON gracefully | PASS |
| 4 | saveManagerTrust | writes atomically via temp+rename | PASS |
| 5 | addTrustedManager | creates new trust record | PASS |
| 6 | addTrustedManager | updates existing trust record for same hostId | PASS |
| 7 | addTrustedManager | defaults autoApprove to true | PASS |
| 8 | removeTrustedManager | removes trust record and returns true | PASS |
| 9 | removeTrustedManager | returns false when hostId not found | PASS |
| 10 | isTrustedManager | returns true for matching hostId+managerId | PASS |
| 11 | isTrustedManager | returns false for wrong managerId | PASS |
| 12 | isTrustedManager | returns false for unknown hostId | PASS |
| 13 | shouldAutoApprove | returns true for trusted manager with autoApprove enabled | PASS |
| 14 | shouldAutoApprove | returns false when autoApprove is false | PASS |
| 15 | shouldAutoApprove | returns false for untrusted host | PASS |
