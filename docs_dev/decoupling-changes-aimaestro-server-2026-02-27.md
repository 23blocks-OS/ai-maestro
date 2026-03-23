# Decoupling Changes — AI Maestro Server
Date: 2026-02-27

## Context

The Plugin Abstraction Principle requires that plugins reference AI Maestro's global skills (not embed API syntax) and call global scripts (not curl). To fully support this, the AI Maestro server needs some additions.

## Required Changes

### P1: Add Team-by-Name Lookup API (NEW)
**Purpose:** Eliminate need for plugins to list all teams and filter by name

- **Endpoint:** `GET /api/teams/by-name/{name}`
- **Returns:** Team object if found, 404 if not
- **Usage:** Teams like AMAMA and AMCOS can be referenced by name directly
- **File:** `app/api/teams/by-name/[name]/route.ts` (NEW)
- **Priority:** HIGH
- **Status:** TODO

**Implementation Notes:**
- Use existing team registry from `lib/team-registry.ts`
- Return full team object with metadata (id, name, members, config)
- Handle team names with special characters (URL-encode in request)
- Add to API documentation

---

### P2: Add `aimaestro-agent.sh role` Command (NEW)
**Purpose:** Replace bare curl API calls with a global script wrapper

- **Command:** `aimaestro-agent.sh role [<agentId>]`
- **Returns:** Agent's governance role (e.g., "manager", "contributor", "external")
- **Usage:** Replaces `curl -s "http://localhost:23000/api/governance"` patterns
- **File:** `plugin/plugins/ai-maestro/scripts/agent-helper.sh` (add new subcommand)
- **Priority:** HIGH
- **Status:** TODO

**Implementation Notes:**
- Call `/api/governance` endpoint internally
- Parse response and extract role for specified agent
- Default to current agent if agentId not provided
- Handle missing agents gracefully (return "unknown")
- This eliminates the only curl example in the ai-maestro-agents-management skill

---

### P3: Update ai-maestro-agents-management Skill
**Purpose:** Teach plugins correct abstraction for governance role checks

- **Change:** Replace curl example with `aimaestro-agent.sh role` command
- **File:** `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`
- **Priority:** HIGH
- **Status:** TODO

**Current Pattern (WRONG):**
```
curl -s "http://localhost:23000/api/governance" | jq '.agents[] | select(.id==env.AGENT_ID) | .role'
```

**New Pattern (CORRECT):**
```
aimaestro-agent.sh role
```

---

### P4: Add GovernanceRequest Webhook/AMP Notification (FUTURE)
**Purpose:** Agents notified immediately of governance decisions instead of polling

- **Trigger:** When a GovernanceRequest changes status (approved/rejected/pending)
- **Notification:** Send AMP message to requesting agent with status update
- **File:** `services/governance-service.ts` (add notification hook to `updateGovernanceRequest()`)
- **Priority:** MEDIUM
- **Status:** FUTURE

**Implementation Notes:**
- Hook into governance request status changes
- Send AMP message via `sendMessage()` function (if available in agent-messaging service)
- Include request details, decision rationale, next steps
- Implement in Phase 2+ when AMP messaging is fully integrated

---

### P5: Add Agent Registration Event Hook (FUTURE)
**Purpose:** Automatically integrate new agents into governance and team workflows

- **Trigger:** When an agent registers with AI Maestro via `/api/agents/register`
- **Actions:**
  - Emit `AgentRegistered` event
  - Auto-add to default team (if configured)
  - Trigger governance sync
  - Notify team managers via AMP
- **File:** `services/agent-lifecycle-events.ts` (NEW - event publisher)
- **Modified:** `app/api/agents/register/route.ts` (emit event after registration)
- **Priority:** MEDIUM
- **Status:** FUTURE

**Implementation Notes:**
- Create event system: `EventEmitter` or similar pattern
- Publish `agent:registered` event with agent metadata
- Team Governance service subscribes and auto-adds to teams
- Cerebellum/notification service subscribes and notifies
- Implement in Phase 2+ for autonomous agent onboarding

---

### P6: Document Hook Exception in ai-maestro-hook.cjs
**Purpose:** Clarify why the pre-commit hook uses direct fetch() calls (allowed exception)

- **Change:** Add JSDoc comment block explaining the exception
- **File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
- **Priority:** LOW
- **Status:** TODO

**Comment Text:**
```javascript
/**
 * PLUGIN ABSTRACTION EXCEPTION: This hook uses direct fetch() calls instead of
 * wrapping them in aimaestro-* scripts. This is an acceptable exception because:
 *
 * 1. Hooks run in Node.js context only (no CLI subprocess available)
 * 2. Hooks have strict timeout constraints (~5s before git hangs)
 * 3. No global abstraction layer exists yet for hook→API calls
 * 4. Subprocess overhead (spawning aimaestro-agent.sh) would exceed timeout
 *
 * When hook abstraction is added (Phase 2+), migrate these fetch calls
 * to use the hook-aware API wrapper instead.
 */
```

---

## Summary Table

| # | Change | Files | Priority | Status |
|---|--------|-------|----------|--------|
| P1 | Team-by-name lookup API | `app/api/teams/by-name/[name]/route.ts` (NEW) | HIGH | TODO |
| P2 | aimaestro-agent.sh role command | `plugin/.../scripts/agent-helper.sh` | HIGH | TODO |
| P3 | Update agents-management skill | `plugin/.../skills/ai-maestro-agents-management/SKILL.md` | HIGH | TODO |
| P4 | GovernanceRequest AMP notifications | `services/governance-service.ts` | MEDIUM | FUTURE |
| P5 | Agent registration event system | `services/agent-lifecycle-events.ts` (NEW), `app/api/agents/register/route.ts` (modified) | MEDIUM | FUTURE |
| P6 | Document hook fetch exception | `plugin/.../scripts/ai-maestro-hook.cjs` | LOW | TODO |

---

## Already Completed

The following changes were already completed in the 2026-02-27 session:
- **team-governance skill** updated with GovernanceRequests, Transfers, Auth Headers, Discovery sections
- **PLUGIN-ABSTRACTION-PRINCIPLE.md** created in `docs/` directory
- **Plugin Abstraction Principle section** added to `CLAUDE.md` project instructions
- **Design context notes** added to all 4 audit reports (AMAMA, AMCOS, Cerebellum, Team Governance)

---

## Implementation Sequence

**Recommended order for implementation (when executed):**

1. **P1 + P2 (Week 1):** Add team-by-name endpoint and role command (high-value, low-risk)
2. **P3 (Week 1):** Update skill documentation to use new command
3. **P6 (Week 1):** Add hook exception comment (documentation only)
4. **P4 + P5 (Week 3+):** Implement event system and async notifications (requires more integration testing)

---

## Testing Strategy

**For P1 (Team-by-Name API):**
- Unit test: Lookup existing team by name → returns correct object
- Unit test: Lookup non-existent team → returns 404
- Integration test: AMAMA skill can reference teams by name without listing all teams

**For P2 (aimaestro-agent.sh role):**
- Unit test: Extract role from governance API response
- Unit test: Handle missing agents gracefully
- Integration test: ai-maestro-agents-management skill uses new command without errors

**For P3 (Skill Update):**
- Manual verification: Skill examples work with new command
- Smoke test: Invoke example → no curl calls in command history

**For P4 + P5 (Events):**
- Integration test: Register agent → event emitted → team updated
- Integration test: GovernanceRequest status change → AMP message sent
- End-to-end: New agent registers → AMAMA onboarded → COS notified

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|-----------|
| P1 | New endpoint might break existing team refs | Backward-compatible; old list-based approach still works |
| P2 | Script command might have parsing edge cases | Test with special characters, missing agents |
| P3 | Skill update changes documented examples | Update examples, test before publishing |
| P4 | Event system adds latency to governance API | Async notifications (queue-based) to prevent blocking |
| P5 | Auto-team-adding might onboard unwanted agents | Make auto-add configurable; log all additions |
| P6 | Documentation might become stale | Mark with TODO comment; revisit in Phase 2 |

---

## Open Questions

1. **Team names:** Should team name lookup be case-sensitive or case-insensitive?
2. **Role command:** Should it accept team ID as a second parameter to get role within specific team?
3. **Event ordering:** If agent registers and governance rule fires, what order should updates occur?
4. **Notification format:** What fields should GovernanceRequest notifications include?
5. **Default team:** Should there be a designated "default" team for auto-onboarding new agents?

---

## References

- **Plugin Abstraction Principle:** `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
- **CLAUDE.md Plugin Abstraction Section:** `CLAUDE.md` (line ~1850)
- **Audit Reports:**
  - AMAMA Audit: `docs_dev/plugin-audit-amama-2026-02-27.md`
  - AMCOS Audit: `docs_dev/plugin-audit-amcos-2026-02-27.md`
  - Cerebellum Audit: `docs_dev/plugin-audit-cerebellum-2026-02-27.md`
  - Team Governance Audit: `docs_dev/plugin-audit-team-governance-2026-02-27.md`
