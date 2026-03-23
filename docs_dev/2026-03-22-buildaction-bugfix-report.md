# BuildAction.tsx Bug Fix Report
Date: 2026-03-22
File: components/plugin-builder/BuildAction.tsx

## Bugs Fixed

### BUG 1 (medium) — clearPoll: abort() called after nulling ref
- Old order: capture ref → null ref → abort()
- Problem: a concurrent clearPoll could null the ref between capture and abort, leaving a fetch un-aborted
- Fix: reordered to capture ref → abort() → null ref (lines 52-54)

### BUG 2 (low) — handleBuild: pollAbortRef not explicitly reset after clearPoll()
- Problem: inconsistent state if clearPoll somehow failed to null the ref
- Fix: added explicit `pollAbortRef.current = null` after `clearPoll()` in handleBuild (line 63)

### BUG 3 (medium) — setInterval callback: shared AbortController overwritten mid-flight
- Problem: `pollAbortRef.current = new AbortController()` at the top of each tick replaced the previous tick's controller before clearPoll() could abort it, leaving in-flight fetches un-abortable
- Fix: local `tickAbortCtrl` variable per tick; assigned to `pollAbortRef.current` before fetch; cleared after fetch only if ref still matches this tick's controller; catch block also clears ref unconditionally (lines 100-107, 142)
