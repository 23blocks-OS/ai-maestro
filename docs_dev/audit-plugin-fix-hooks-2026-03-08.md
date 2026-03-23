# Plugin Hook Fixes: ai-maestro-hook.cjs
Generated: 2026-03-08

## File Modified
`plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`

## Changes Made

### CRIT-2: Invalid status values in writeState() calls
- **Line 300** (was 297): Changed `status: 'waiting_for_input'` to `status: 'waiting'` (idle_prompt handler)
- **Line 334** (was 331): Changed `status: 'waiting_for_input'` to `status: 'waiting'` (permission_prompt handler)
- **Line 327**: Updated stale-state check from `existingState.status !== 'permission_request'` to `existingState.status !== 'waiting' || existingState.notificationType !== 'permission_prompt'` (since `permission_request` is no longer a valid status, the check now uses the combination of status + notificationType)

### CRIT-3: Remove dead PermissionRequest case handler
- **No action needed**: Verified the entire file -- no `case 'PermissionRequest':` block exists. It was already removed in a prior change.

### MED-7: index.json atomic write
- **Lines 139-148**: Changed index.json write to use atomic pattern: write to `index.json.tmp.<pid>` temp file first, then `fs.renameSync()` to atomically replace. PID suffix prevents collisions between concurrent hook processes.

### MED-8: readStdin timeout too long
- **Line 52-56**: Reduced timeout from 5000ms to 2000ms. This leaves 3s headroom for SessionStart's `setTimeout(3000)` to complete within the 5s hook timeout.

### MED-9: readStdin timeout never cleared on success
- **No action needed**: Already fixed in current code. Lines 36 and 46 call `clearTimeout(timeoutId)` in both `'end'` and `'error'` handlers. The `timeoutId` variable is accessible via closure scope (declared at line 52).

### MED-19: InstructionsLoaded overwrites instructionFiles
- **Line 407**: Changed `instructionFiles: input.files || []` to `instructionFiles: [...(prevState.instructionFiles || []), ...(input.files || [])]` to append new instruction files to previously tracked ones.

## Verification
- Syntax check: PASS (`node --check` returned no errors)
- Pattern followed: Existing code style (CommonJS, same indentation, same comment style)
- No new dependencies introduced

## Notes
- The `mapStatusForBroadcast()` function (lines 67-73) was left in place as a safety net. Now that writeState uses valid statuses directly, the map entries are passthrough, but keeping the function provides defense-in-depth if any future code path introduces non-standard statuses.
- CRIT-3 was a no-op: the PermissionRequest case was already absent from the file.
- MED-9 was a no-op: clearTimeout was already implemented correctly.
