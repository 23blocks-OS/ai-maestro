# EPCP Fixes Done - P7 - Domain: lib
Generated: 2026-02-22

## Findings Fixed: 3/3

### SF-006 (lib/team-registry.ts:247)
- **Issue:** Atomic write temp file used `.tmp` suffix instead of `.tmp.<pid>`
- **Fix:** Changed `TEAMS_FILE + '.tmp'` to `TEAMS_FILE + '.tmp.' + process.pid`

### SF-007 (lib/transfer-registry.ts:60)
- **Issue:** Atomic write temp file used `.tmp` suffix instead of `.tmp.<pid>`
- **Fix:** Changed `` `${TRANSFERS_FILE}.tmp` `` to `` `${TRANSFERS_FILE}.tmp.${process.pid}` ``

### NT-004 (lib/amp-auth.ts:162-183)
- **Issue:** Body of `withLock` callback was not indented, making it unclear that logic runs under the lock
- **Fix:** Re-indented the entire callback body by one additional level (2 spaces) so it's visually nested under `withLock`
