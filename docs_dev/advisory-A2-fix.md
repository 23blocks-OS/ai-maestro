# Advisory A2 Fix: Governance Troubleshooting in SKILL.md

**Date:** 2026-02-22
**File:** `plugin/plugins/ai-maestro/skills/agent-messaging/SKILL.md`

## Changes Made

### 1. Security Section (line 384)
Added governance-aware routing bullet point after existing security items.

### 2. Troubleshooting Section (lines 411-431)
Added two new troubleshooting entries after existing entries:

- **"Message blocked by team governance policy"** - Explains closed-team, COS, and open-world messaging restrictions with resolution steps (check governance role, check recipient team, relay via COS/MANAGER).
- **"Mesh message denied: recipient is in a closed team"** - Explains cross-host governance verification failures with resolution steps (governance sync, role attestation, host trust).

## Verification
- No existing content was modified
- Formatting matches existing troubleshooting entry style
- New entries inserted before "## Persisting Identity (Optional)" section
