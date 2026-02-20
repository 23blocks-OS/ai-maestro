# Fix Report: headless-router.ts (MF-07, MF-08, SF-03, SF-04)
Generated: 2026-02-20

## Changes Applied

### MF-07: resolvedBy identity spoofing (line ~1132)
- Removed `body.resolvedBy` fallback in transfer resolve handler
- Now requires `auth.agentId`; returns 401 if absent

### MF-08: requestedBy from untrusted body in transfers POST (line ~1142)
- Added `authenticateAgent()` call to POST /api/governance/transfers
- Uses `auth.agentId` as `requestedBy` instead of trusting body
- Returns 401 if no auth or no agentId

### SF-03: readJsonBody no size limit (line ~277)
- Added 1MB (1_048_576 bytes) size limit
- Tracks `totalSize` across chunks; destroys request and rejects with 413 if exceeded
- Updated router catch block to propagate 413 statusCode

### SF-04: sendServiceResult error+data logic (line ~318)
- Changed condition from `result.error && !result.data` to just `result.error`
- Error response now includes spread of `result.data` alongside the error field

## Verification
- `tsc --noEmit` passes with no headless-router errors
