# Fix Report: 3 MUST-FIX Issues in amp-service.ts
Generated: 2026-02-20T16:34:00Z

## Changes Applied

### MF-01 (line ~903-911): Reject unsigned messages from external senders
- In `routeMessage`, the `else` branch (no signature) now rejects mesh-forwarded messages with 403
- Local sender messages still allowed unsigned (just logged)

### MF-02 (line ~1672-1678): Reject unsigned federated messages in deliverFederated
- After signature verification block, added guard: if `signatureVerified` is false, return 403
- This catches both missing signature and missing sender_public_key cases

### MF-03 (line ~898-901): Don't propagate unverified signatures
- Moved `envelope.signature = body.signature` inside the verified branch only (line 897)
- Added `else` branch: when signature exists but no publicHex, set `envelope.signature = ''` with warning log

## File Modified
- `services/amp-service.ts`

## Verification
- TypeScript check shows only pre-existing project-wide config errors (module resolution, target settings)
- No new errors introduced by these changes
