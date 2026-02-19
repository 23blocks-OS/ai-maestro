# Code Correctness Report: types

**Agent:** epcp-code-correctness-agent
**Domain:** types
**Files audited:** 2 (types/governance.ts, types/team.ts) + 8 consumer files traced
**Date:** 2026-02-16T19:30:00Z

## MUST-FIX

_None found._

## SHOULD-FIX

### [CC-001] Conflicting TransferRequest interface in agent transfer route
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`:12
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** A local `TransferRequest` interface is defined at line 12 of `app/api/agents/[id]/transfer/route.ts` with completely different fields (`targetHostId`, `targetHostUrl`, `mode`, `newAlias`, `cloneRepositories`) than the governance `TransferRequest` in `types/governance.ts` (which has `agentId`, `fromTeamId`, `toTeamId`, `requestedBy`, `status`, etc.). Both serve different purposes (host-to-host agent transfer vs. team-to-team governance transfer), but sharing the same name creates confusion and risks accidental misuse if someone imports the wrong one.
- **Evidence:**
  ```typescript
  // types/governance.ts:31
  export interface TransferRequest {
    id: string
    agentId: string
    fromTeamId: string
    toTeamId: string
    ...
  }

  // app/api/agents/[id]/transfer/route.ts:12
  interface TransferRequest {
    targetHostId: string
    targetHostUrl: string
    mode: 'move' | 'clone'
    ...
  }
  ```
- **Fix:** Rename the local interface in the agent transfer route to `AgentHostTransferRequest` or `HostTransferPayload` to avoid naming collision and confusion. Alternatively, move it to `types/` with a distinct name.

### [CC-002] Inconsistent home directory resolution in transfer-registry.ts
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts`:15
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `transfer-registry.ts` uses `process.env.HOME || '~'` to resolve the home directory, while every other file in `lib/` uses `os.homedir()`. The `'~'` fallback is incorrect because `path.join('~', '.aimaestro', ...)` produces the literal path `~/.aimaestro/...` -- Node's `path.join` does NOT expand tilde. If `HOME` is unset (e.g., in certain CI environments or containerized contexts), this would create files under a literal `~` directory instead of the actual home directory.
- **Evidence:**
  ```typescript
  // transfer-registry.ts:15 — uses process.env.HOME with bad fallback
  const AI_MAESTRO_DIR = path.join(process.env.HOME || '~', '.aimaestro')

  // governance.ts:18 — uses os.homedir() (correct pattern)
  const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')

  // team-registry.ts:184 — uses os.homedir() (correct pattern)
  const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')

  // meeting-registry.ts:14 — uses os.homedir() (correct pattern)
  const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
  ```
- **Fix:** Change line 15 of `transfer-registry.ts` to: `const AI_MAESTRO_DIR = path.join(os.homedir(), '.aimaestro')` and add `import os from 'os'` at the top. This aligns with the convention used by all other registry files.

### [CC-003] Unvalidated status query parameter in transfers GET route
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts`:16-28
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `status` query parameter from the URL is used directly to filter `TransferRequest` objects without validating it against the `TransferRequestStatus` type (`'pending' | 'approved' | 'rejected'`). While this is a query filter (so an invalid value just returns no matches rather than causing data corruption), it silently accepts any string value. The comparison `r.status === status` compares a `TransferRequestStatus` with a `string | null`, which TypeScript allows but is semantically loose.
- **Evidence:**
  ```typescript
  // route.ts:16
  const status = request.nextUrl.searchParams.get('status') // 'pending', 'approved', 'rejected', or null for all

  // route.ts:27
  requests = requests.filter(r => r.status === status)
  // `status` is `string | null`, `r.status` is `TransferRequestStatus`
  ```
- **Fix:** Add validation: `if (status && !['pending', 'approved', 'rejected'].includes(status)) { return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 }) }`. Optionally cast the validated value to `TransferRequestStatus`.

## NIT

### [CC-004] cleanupOldTransfers is exported but never called
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts`:116
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `cleanupOldTransfers()` function is exported from `transfer-registry.ts` but is never imported or called anywhere in the codebase. Old resolved transfer requests will accumulate indefinitely. This is dead code until a cron/scheduler or API route is wired up to call it.
- **Evidence:** Searched the entire codebase for `cleanupOldTransfers` -- only found the definition at `lib/transfer-registry.ts:116`. No callers exist.
- **Fix:** Either wire it into a periodic cleanup (e.g., call it at server startup in `server.mjs` or on a timer), or add a TODO comment documenting that it's intended for future use. If it's truly dead code, consider removing it.

### [CC-005] GovernanceRole type defined in hook, not in types/ directory
- **File:** `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts`:7
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `GovernanceRole = 'manager' | 'chief-of-staff' | 'normal'` is defined in `hooks/useGovernance.ts` and re-exported from `components/governance/RoleBadge.tsx`. This type logically belongs in `types/governance.ts` alongside `TeamType` and `TransferRequestStatus` since it represents a governance domain concept. Its current location in a hook file means server-side code that might need this type cannot import it without pulling in `'use client'` code.
- **Evidence:**
  ```typescript
  // hooks/useGovernance.ts:7
  export type GovernanceRole = 'manager' | 'chief-of-staff' | 'normal'

  // components/governance/RoleBadge.tsx:5
  export type { GovernanceRole }

  // components/governance/TeamMembershipSection.tsx:6
  import type { GovernanceRole } from '@/components/governance/RoleBadge'
  ```
- **Fix:** Move `GovernanceRole` to `types/governance.ts` and update all imports. This keeps all governance types colocated and allows server-side usage if needed.

### [CC-006] GovernanceConfig.version uses literal type 1 without forward-compatibility
- **File:** `/Users/emanuelesabetta/ai-maestro/types/governance.ts`:13
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** `GovernanceConfig`, `TransfersFile`, `TeamsFile`, and `MeetingsFile` all use `version: 1` as a literal type. This means bumping the version to 2 in the future would require changing the type definition, updating all constants, and potentially breaking deserialization of old files. The `loadGovernance` function casts parsed JSON to `GovernanceConfig` without checking the version number, so a v2 file would be silently accepted.
- **Evidence:**
  ```typescript
  // types/governance.ts:13
  export interface GovernanceConfig {
    version: 1  // literal type, not `number`
    ...
  }
  ```
- **Fix:** This is a minor design consideration. Either keep `version: 1` as a strict discriminant (good for type-level guarantees) and add runtime version checking in loaders, or change to `version: number` for forward-compatibility. The current approach is acceptable for a v1 system.

## CLEAN

Files with no issues found:
- `types/governance.ts` — Type definitions are correct, well-documented, and used consistently across all consumers. `TeamType`, `GovernanceConfig`, `TransferRequest`, `TransfersFile`, and `DEFAULT_GOVERNANCE_CONFIG` all have proper types and are consumed correctly.
- `types/team.ts` — Type definitions are correct. `Team`, `TeamsFile`, `Meeting`, `MeetingsFile`, `TeamMeetingState`, `TeamMeetingAction`, `MeetingPhase`, `SidebarMode`, `RightPanelTab`, and `MeetingStatus` are all well-defined. The `TeamMeetingAction` discriminated union covers all 19 action types, and the reducer in MeetingRoom.tsx handles all of them. The `RESTORE_MEETING` action correctly uses `Meeting` type and `teamId: string | null`.

---

## Summary

The two type files under audit (`types/governance.ts` and `types/team.ts`) are well-structured, correctly typed, and consistently consumed across the codebase. No bugs were found in the type definitions themselves. The issues found are in consumer files:

| ID | Severity | Category | File | Summary |
|----|----------|----------|------|---------|
| CC-001 | SHOULD-FIX | api-contract | agents/[id]/transfer/route.ts | Conflicting TransferRequest interface name |
| CC-002 | SHOULD-FIX | logic | lib/transfer-registry.ts | Inconsistent home dir resolution (tilde fallback) |
| CC-003 | SHOULD-FIX | type-safety | api/governance/transfers/route.ts | Unvalidated status query parameter |
| CC-004 | NIT | logic | lib/transfer-registry.ts | cleanupOldTransfers never called |
| CC-005 | NIT | api-contract | hooks/useGovernance.ts | GovernanceRole type mislocated |
| CC-006 | NIT | type-safety | types/governance.ts | Literal version type without runtime check |
