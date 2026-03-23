# Test Report: host-keys.ts — 2026-02-21

## Summary
- Function complexity: simple (180 lines total, 4 exports + 3 internal helpers)
- Tests written: 15
- All passing: YES (16ms total)
- Effective coverage: 95%

## Tests

| # | Describe | Test | Result |
|---|----------|------|--------|
| 1 | getOrCreateHostKeyPair | generates new keypair when no keys exist | PASS |
| 2 | getOrCreateHostKeyPair | returns same keys on subsequent calls (cache) | PASS |
| 3 | getOrCreateHostKeyPair | loads existing keys from disk | PASS |
| 4 | getOrCreateHostKeyPair | regenerates when files are corrupt | PASS |
| 5 | key persistence | writes via atomic rename pattern | PASS |
| 6 | key persistence | creates host-keys directory | PASS |
| 7 | getHostPublicKeyHex | returns only public key hex | PASS |
| 8 | signHostAttestation | produces valid base64 signature | PASS |
| 9 | signHostAttestation | different data gives different sigs | PASS |
| 10 | verifyHostAttestation | valid sig returns true | PASS |
| 11 | verifyHostAttestation | tampered data returns false | PASS |
| 12 | verifyHostAttestation | wrong key returns false | PASS |
| 13 | verifyHostAttestation | malformed sig returns false (no throw) | PASS |
| 14 | edge cases | empty string data signs/verifies | PASS |
| 15 | edge cases | 100KB data signs/verifies | PASS |

## Mock strategy
- Only `fs` module mocked (external I/O) using in-memory fsStore
- All crypto operations run real Ed25519 — no mocking
- Module cache reset via vi.resetModules() + dynamic import per test

## Coverage gaps
- File permission bits (0o600, 0o700) not verifiable in mocked fs (5%)
- console.log/warn output not asserted (logging, not logic)
