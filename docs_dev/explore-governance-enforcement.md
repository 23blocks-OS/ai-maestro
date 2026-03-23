# Governance Enforcement System -- Exploration Report
Generated: 2026-02-22

## Summary

The governance enforcement system is a multi-layered architecture spanning types, registries, services, and API routes. It covers cross-host governance requests (Layer 3), manager trust auto-approval (Layer 4), and RBAC enforcement on agent CRUD (Layer 5). The `configure-agent` type exists as a scaffolded stub only -- it is accepted on receive but rejected on submit and has no execution handler.

---

## 1. Cross-Host Governance Request System

### Types: `types/governance-request.ts` (85 lines)

**GovernanceRequestType enum (lines 12-22):**
```
'add-to-team' | 'remove-from-team' | 'assign-cos' | 'remove-cos' |
'transfer-agent' | 'create-agent' | 'delete-agent' | 'configure-agent'
```

- `configure-agent` IS in the type union (line 20-22)
- BUT it has a comment: "SF-057 (P5): Scaffolded type only -- receiveCrossHostRequest accepts it but submitCrossHostRequest rejects it and performRequestExecution has no handler."
- `GovernanceRequestPayload.configuration` field exists (line 55) for `configure-agent` payloads

**GovernanceRequestStatus state machine (lines 24-31):**
```
pending -> remote-approved / local-approved / dual-approved -> executed / rejected
```

**Approval slots (lines 41-46):**
- `sourceCOS`, `sourceManager`, `targetCOS`, `targetManager`
- Both managers approved -> auto-execute (status = 'executed')

### Registry: `lib/governance-request-registry.ts` (262 lines)

- Storage: `~/.aimaestro/governance-requests.json`
- CRUD operations with `withLock('governance-requests')` serialization
- Key functions:
  - `createGovernanceRequest()` (lines 102-134) -- creates pending request
  - `approveGovernanceRequest()` (lines 145-193) -- adds approval, computes status
  - `rejectGovernanceRequest()` (lines 196-217) -- sets rejected status
  - `executeGovernanceRequest()` (lines 220-238) -- marks as executed
  - `purgeOldRequests()` (lines 244-262) -- cleanup terminal-state requests

**Approval status computation (lines 169-188):**
- Both `sourceManager` AND `targetManager` approved -> status = `'executed'`
- Only source side approved -> `'remote-approved'`
- Only target side approved -> `'local-approved'`
- Both sides have some approval but not both managers -> `'dual-approved'`

### Service: `services/cross-host-governance-service.ts` (590 lines)

**submitCrossHostRequest (lines 46-118):**
- Rate-limited password verification
- Validates requesting agent exists and role matches
- Validates targetHostId is a known peer (not self)
- **IMPLEMENTED_TYPES whitelist (line 94):** `['add-to-team', 'remove-from-team', 'assign-cos', 'remove-cos', 'transfer-agent']`
- `configure-agent`, `create-agent`, `delete-agent` are NOT in IMPLEMENTED_TYPES -> rejected with "not yet implemented"
- Creates local record, fires-and-forgets HTTP to target host

**receiveCrossHostRequest (lines 124-204):**
- Validates fromHostId is known
- VALID_REQUEST_TYPES (line 141-144): includes ALL 8 types including `configure-agent`
- Forces `status: 'pending'` and `approvals: {}` on received requests (CC-P1-002 security)
- Auto-approve check via `shouldAutoApprove()` (Layer 4)

**approveCrossHostRequest (lines 210-269):**
- Password-gated, rate-limited
- Determines approverType based on role (MANAGER/COS) and host position (source/target)
- If approval results in `'executed'` status -> calls `performRequestExecution()`

**rejectCrossHostRequest (lines 275-325):**
- Password-gated, rate-limited
- Notifies source host via fire-and-forget HTTP if cross-host

**performRequestExecution (lines 331-457):**
- Acquires `withLock('teams')` for mutations
- Handles: `add-to-team`, `remove-from-team`, `assign-cos`, `remove-cos`, `transfer-agent`
- Default case (line 440-443): `create-agent`, `delete-agent`, `configure-agent` -> "not yet implemented" warning
- Broadcasts governance sync after successful execution

**receiveRemoteRejection (lines 566-589):**
- Host-signature auth (no password needed)
- Validates rejecting host is involved in the request

---

## 2. RBAC Enforcement Pattern

### Agent CRUD: `services/agents-core-service.ts` (lines 598-721)

**createNewAgent (lines 602-622):**
- Layer 5: Opt-in governance (only when `requestingAgentId` is provided)
- If `requestingAgentId` present: must be MANAGER or COS (any team) -> else 403
- If no `requestingAgentId`: no governance check (Phase 1 backward compat)

**updateAgentById (lines 645-686):**
- Layer 5: Opt-in governance (only when `requestingAgentId` is provided)
- Allowed if: MANAGER, COS-anywhere, self (agent updating itself), OR COS of a team that contains the target agent
- Checks closed teams where target is a member, then checks if requester is that team's COS

**deleteAgentById (lines 692-721):**
- Layer 5: Opt-in governance (only when `requestingAgentId` is provided)
- ONLY MANAGER can delete agents -> else 403

### Governance Service: `services/governance-service.ts` (529 lines)

**setManagerRole (lines 57-100):**
- Requires governance password (rate-limited, bcrypt-verified)
- Can set or remove manager (agentId=null)
- Agent must exist in registry

**resolveTransferReq (lines 307-448):**
- Only source team COS or global MANAGER can resolve transfers
- Closed-team constraint: normal agents in one closed team only
- Compensating action on save failure: reverts transfer to pending

**createTransferReq (lines 231-302):**
- Only MANAGER or COS can request transfers
- From-team must be closed
- Duplicate pending transfer prevention

### Governance Lib: `lib/governance.ts` (174 lines)

**Key role-check functions:**
- `isManager(agentId)` (lines 127-132) -- checks `governance.json` `managerId` against agentId
- `isChiefOfStaff(agentId, teamId)` (lines 136-143) -- checks team's `chiefOfStaffId`
- `isChiefOfStaffAnywhere(agentId)` (lines 147-154) -- checks if COS of any closed team
- `getClosedTeamForAgent(agentId)` (lines 158-165) -- first closed team
- `getClosedTeamsForAgent(agentId)` (lines 169-174) -- all closed teams

---

## 3. Manager Trust System

### `lib/manager-trust.ts` (215 lines)

- Storage: `~/.aimaestro/manager-trust.json`
- Trust keyed by `hostId` (one trust record per host)

**Key functions:**
- `addTrustedManager()` (lines 111-145) -- upserts trust record (hostId + managerId + autoApprove)
- `removeTrustedManager()` (lines 152-169) -- removes by hostId
- `isTrustedManager(hostId, managerId)` (lines 179-184) -- exact match check
- `shouldAutoApprove(request)` (lines 201-215) -- returns true IFF:
  1. Trust record exists for `request.sourceHostId`
  2. `trust.autoApprove === true`
  3. `trust.managerId === request.requestedBy`

**Auto-approve flow in cross-host-governance-service.ts (lines 187-198):**
- When a request is received from a remote host
- If `shouldAutoApprove()` returns true:
  - Auto-approves as `targetManager` using local managerId
  - If resulting status is `'executed'`, immediately runs `performRequestExecution()`

---

## 4. API Routes

### Headless Router: `services/headless-router.ts`

| Route | Line | Handler |
|-------|------|---------|
| `GET /api/governance` | 1165 | `getGovernanceConfig()` |
| `POST /api/governance/manager` | 1168 | `setManagerRole(body)` |
| `POST /api/governance/password` | 1172 | `setGovernancePassword(body)` |
| `GET /api/governance/reachable` | 1176 | `getReachableAgents(query.agentId)` |
| `POST /api/governance/transfers/:id/resolve` | 1179 | `resolveTransferReq()` (auth required: MF-07) |
| `GET /api/governance/transfers` | 1197 | `listTransferRequests()` |
| `POST /api/governance/transfers` | 1204 | `createTransferReq()` (auth required: MF-08) |
| `POST /api/v1/governance/sync` | 1223 | `handleGovernanceSyncMessage()` |
| `GET /api/v1/governance/sync` | 1267 | `buildLocalGovernanceSnapshot()` (host-sig auth: SR-002) |
| `POST /api/v1/governance/requests` | 1306 | submit (local w/ password) or receive (remote w/ host-sig) |
| `GET /api/v1/governance/requests` | 1349 | `listCrossHostRequests(filter)` |
| `POST /api/v1/governance/requests/:id/approve` | 1356 | `approveCrossHostRequest()` |
| `POST /api/v1/governance/requests/:id/reject` | 1364 | reject (host-sig or password) |
| `GET /api/governance/trust` | 1399 | `listTrustedManagers()` |
| `POST /api/governance/trust` | 1402 | `addTrust(body)` |
| `DELETE /api/governance/trust/:hostId` | 1406 | `removeTrust()` |

**Agent CRUD governance enforcement in headless router:**
- `POST /api/agents` (line 611-619): Optional auth via `authenticateAgent()`, passes `auth.agentId` to `createNewAgent()`
- `PATCH /api/agents/:id` (line 972-979): Optional auth, passes to `updateAgentById()`
- `DELETE /api/agents/:id` (line 981-988): Optional auth, passes to `deleteAgentById()`

### Next.js Routes: `app/api/governance/`

| File | Endpoint |
|------|----------|
| `app/api/governance/route.ts` | `GET /api/governance` |
| `app/api/governance/manager/route.ts` | `POST /api/governance/manager` |
| `app/api/governance/password/route.ts` | `POST /api/governance/password` |
| `app/api/governance/reachable/route.ts` | `GET /api/governance/reachable` |
| `app/api/governance/transfers/route.ts` | `GET/POST /api/governance/transfers` |
| `app/api/governance/transfers/[id]/resolve/route.ts` | `POST /api/governance/transfers/:id/resolve` |
| `app/api/governance/trust/route.ts` | `GET/POST /api/governance/trust` |
| `app/api/governance/trust/[hostId]/route.ts` | `DELETE /api/governance/trust/:hostId` |

---

## 5. Key Answers

### Is `configure-agent` already in GovernanceRequestType?

**YES** -- it exists in the type union at `types/governance-request.ts:20`. BUT it is scaffolded only:
- `submitCrossHostRequest()` REJECTS it (not in IMPLEMENTED_TYPES at line 94)
- `receiveCrossHostRequest()` ACCEPTS it (in VALID_REQUEST_TYPES at line 141)
- `performRequestExecution()` has NO handler for it (falls to default warning at line 440)
- The payload field `configuration?: Record<string, unknown>` exists at line 55

To implement `configure-agent` end-to-end, you would need:
1. Add to IMPLEMENTED_TYPES in `submitCrossHostRequest()` (line 94)
2. Add a case in `performRequestExecution()` switch (after line 438)
3. Decide what "configure" means (update agent fields? set preferences? update session config?)

### How does governance enforcement work for agent CRUD?

**Layer 5 opt-in pattern:** All three CRUD operations (create/update/delete) accept an optional `requestingAgentId`. When present, RBAC is enforced:
- **Create**: MANAGER or any COS
- **Update**: MANAGER, any COS, self, or owning-team COS
- **Delete**: MANAGER only

When `requestingAgentId` is null (no auth header), governance is NOT enforced (Phase 1 backward compat).
The headless router extracts agent identity via `authenticateAgent(Authorization, X-Agent-Id)` headers.
