# Messaging & Identity Enforcement Audit

**Date:** 2026-03-27
**Status:** Architecture verified, gaps identified

## Enforcement Architecture (9 Layers)

### Layer 1: Message Filter (lib/message-filter.ts)
`checkMessageAllowed()` — enforces R6 governance rules before delivery:
- MANAGER → anyone (unrestricted)
- COS → own team + other COS + MANAGER + open-world
- Normal closed-team member → same team + own COS only
- Outside sender → cannot reach closed-team members
- **VERIFIED:** Called at amp-service.ts:1104 before every local delivery

### Layer 2: Identity Verification (lib/agent-auth.ts)
`authenticateAgent()` — validates Bearer token + X-Agent-Id match:
- No headers → treated as web UI user (no agent identity)
- Bearer only → verified agent
- X-Agent-Id without Bearer → REJECTED (spoofing prevention)
- X-Agent-Id mismatch with Bearer → REJECTED (403)

### Layer 3: AMP Routing (services/amp-service.ts)
`routeMessage()` — full pipeline: auth → rate limit → payload validation → message filter → deliver
- Cross-host: verifies role attestation from X-Host-Signature
- Local: verifies agent identity, then message filter

### Layer 4: API Authentication (all api/ routes + headless-router.ts)
Every governance-protected endpoint calls `authenticateAgent()` from headers.

### Layer 5: Title-Based RBAC (lib/governance.ts + lib/team-acl.ts)
`isManager()`, `isChiefOfStaff()`, `checkTeamAccess()` — per-operation checks.

### Layer 6: Script Enforcement (scripts/amp-send.sh)
Messages signed with Ed25519 private key. Canonical string includes sender+recipient+payload hash.

### Layer 7: Identity Setup (scripts/aid-init.sh)
Ed25519 keypair generation per agent. Config stored at ~/.agent-messaging/agents/<name>/.

### Layer 8: Cryptography (lib/amp-keys.ts)
Ed25519 sign/verify. Host-level keypairs for cross-host attestation.

### Layer 9: Cross-Host Attestation (lib/governance-sync.ts)
Role attestation headers for mesh-forwarded governance operations.

## Gaps Identified

### GAP 1: Opt-In Authentication (SF-058) — CRITICAL
**Location:** lib/agent-auth.ts lines 39-40
**Issue:** When no auth headers are present, the system treats the caller as "web UI user" and SKIPS governance checks. Any agent that omits Authorization headers can bypass RBAC.
**Impact:** Agents could call governance APIs (create teams, manage agents) without identity.
**Fix (Phase 2):** Make auth mandatory on all governance endpoints. Add middleware that rejects requests without auth headers unless they come from the dashboard origin.

### GAP 2: Non-Claude Agents Can't Sign Messages
**Location:** scripts/amp-send.sh requires Ed25519 keys in ~/.agent-messaging/
**Issue:** Codex/Gemini/Aider agents may not have AMP identity initialized. The cross-client skill installer copies skills but doesn't run `aid-init.sh`.
**Fix:** Add `aid-init.sh --auto` to the cross-client install flow for non-Claude agents.

### GAP 3: Message Filter Doesn't Check Client Type
**Location:** lib/message-filter.ts
**Issue:** The filter checks agentId and team membership but doesn't know the agent's client type. A Codex agent could theoretically be registered in a closed team without having the governance skills installed.
**Fix:** The filter itself doesn't need to change (it's agent-agnostic). But the team assignment API should verify skills are installed before adding a non-Claude agent to a closed team.

### GAP 4: Skills Don't Enforce — They Advise
**Issue:** For non-Claude agents, governance rules are taught via skills (soft enforcement). There's no plugin-level enforcement like Claude has. A misbehaving Codex agent could ignore the skill instructions.
**Mitigation:** The message filter (Layer 1) is server-side and enforces regardless of client. The agent can TRY to send a forbidden message, but the server will block it. The real risk is API calls, not messaging.

## What Skills Must Teach

### For ALL agents (Claude, Codex, Gemini, Aider):
1. Initialize identity: `aid-init.sh --auto` (creates Ed25519 keypair)
2. Include auth headers in all API calls: `Authorization: Bearer <token>`, `X-Agent-Id: <uuid>`
3. Messaging rules: who you can/cannot message based on your title and team
4. Team boundaries: closed-team isolation is enforced server-side

### For MANAGER agents:
- You can message anyone
- You approve GovernanceRequests
- You CANNOT assign COS (that's USER-only)

### For COS agents:
- You can message: own team + other COS + MANAGER
- You CANNOT message: members of other closed teams directly
- All agent operations require GovernanceRequest to MANAGER

### For MEMBER agents:
- You can message: same-team members + your COS
- You CANNOT message: agents outside your team (including other closed teams)
- Route inter-team requests through your COS

## Action Items

1. [DONE] Message filter enforces governance at delivery — verified in amp-service.ts:1104
2. [TODO] Add `aid-init.sh --auto` to cross-client skill installer
3. [TODO] Verify team assignment API checks skills before adding non-Claude agent
4. [TODO] Phase 2: Make auth mandatory on governance endpoints
5. [DONE] Governance screening reports saved for all 6 role-plugins
