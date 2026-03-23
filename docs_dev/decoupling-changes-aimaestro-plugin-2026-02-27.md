# Decoupling Changes — AI Maestro Plugin (Provider)
Date: 2026-02-27

## Context

The AI Maestro plugin is the **PROVIDER of the abstraction layer**. Its skills contain the canonical API syntax and its scripts make the actual API calls. The plugin IS the exception to the Plugin Abstraction Principle — it provides the layer that others use.

Based on audit findings (see: `audit-aimaestro-plugin-decoupling-2026-02-27.md`), the plugin is **fundamentally sound** (9/10 score) with only minor improvements needed.

---

## Overall Assessment: 9/10 — Fundamentally Sound

| Category | Score | Notes |
|----------|-------|-------|
| **Hooks Layer** | 8/10 | Direct API calls acceptable due to hook constraints |
| **Scripts Layer** | 10/10 | Excellent API abstraction, env-configurable |
| **Skills Layer** | 9/10 | One curl example to fix (governance role check) |
| **Overall** | **9/10** | Excellent separation of concerns |

---

## Required Changes

### Change 1: Add `aimaestro-agent.sh role` Command — HIGH PRIORITY

**File:** `plugin/plugins/ai-maestro/scripts/agent-helper.sh`

**Current State:**
- No `role` subcommand exists in agent-helper.sh
- The governance skill teaches a direct curl command as workaround

**Problem:**
The `skills/ai-maestro-agents-management/SKILL.md` skill teaches:
```bash
curl -s "http://localhost:23000/api/governance" | jq .
```
This is the **ONLY direct API curl example in any skill** — a violation of the principle that skills should teach CLI commands, not API syntax.

**Required Implementation:**

Add to `plugin/plugins/ai-maestro/scripts/agent-helper.sh`:

```bash
# After the existing subcommands, add:

role() {
  local api_base="${AIMAESTRO_API_BASE:-http://localhost:23000}"
  curl -s "${api_base}/api/governance" | jq '{
    role: (if .hasManager then (if .managerId == env.AGENT_ID then "manager" else "member" end) else "unset" end),
    hasPassword: .hasPassword,
    managerId: .managerId
  }'
}

main() {
  local cmd="${1:-}"
  case "${cmd}" in
    role)
      role
      ;;
    # ... existing cases ...
  esac
}
```

**Then Update Skill:**

In `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`, replace:
```bash
curl -s "http://localhost:23000/api/governance" | jq .
```

With:
```bash
aimaestro-agent.sh role
```

**Why This Fixes It:**
- Users never need to curl the API directly
- Skill teaches CLI command (canonical pattern)
- Script provides the HTTP abstraction
- Maintains proper layer separation (Layer 1 → Layer 2)

**Success Condition:**
- `aimaestro-agent.sh role` outputs governance role without requiring manual curl
- Skill documentation updated to teach the CLI command
- No direct API curl examples remain in any skill

---

### Change 2: Document Hook Exception — LOW PRIORITY

**File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`

**Current State:**
- 6 direct fetch() API calls with no comment explaining why
- No documentation of why a hook violates layering

**Problem:**
The hook makes direct HTTP calls to AI Maestro, which technically violates strict decoupling. Without documentation, future maintainers won't understand this is intentional.

**Required Change:**

Add this JSDoc block at the top of `ai-maestro-hook.cjs` (after the initial comments/requires, before the main event handlers):

```javascript
/**
 * HOOK IMPLEMENTATION EXCEPTION
 *
 * This hook makes direct fetch() calls to AI Maestro HTTP API.
 * This is normally a decoupling violation, but is acceptable here because:
 *
 * 1. Hooks are called by Claude Code's system, not transitively by scripts/skills
 *    → The hook is never invoked from the abstraction layer
 *
 * 2. Hooks must respond within ~5 seconds; spawning shell scripts adds overhead
 *    → Performance is critical for user experience (session start notifications)
 *
 * 3. No abstraction layer is available in Claude Code's hook API
 *    → Hooks have no way to delegate to shell scripts
 *
 * 4. One-way dependency only
 *    → Claude Code calls the hook; the hook doesn't call back
 *
 * Future refactoring could:
 * - Extract the "find agent by CWD" logic into a reusable Node.js module
 * - Consider creating a lightweight agent-lookup service
 * - Cache agent lookups to reduce API calls (agent list is static between changes)
 */
```

**Success Condition:**
- Exception is documented at top of hook file
- Future maintainers understand this is intentional
- No code changes needed, documentation only

---

### Change 3: Extract Agent Lookup Helper — LOW PRIORITY (FUTURE)

**File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`

**Current State:**
- Agent lookup by CWD pattern repeated 4 times in the hook

**Problem:**
Lines ~50, ~127, ~169 all repeat similar logic:
```javascript
const agent = (agentsData.agents || []).find(a => {
  const agentWd = a.workingDirectory || a.session?.workingDirectory;
  return agentWd && cwd.startsWith(agentWd);
});
```

**Recommendation (Not Required for This Change Spec):**

Extract into a reusable function:
```javascript
function findAgentByCwd(agents, cwd) {
  return (agents || []).find(a => {
    const agentWd = a.workingDirectory || a.session?.workingDirectory;
    return agentWd && cwd.startsWith(agentWd);
  });
}
```

**Why This Is Low Priority:**
- The code is small (single pattern, ~8 lines)
- Refactoring is nice-to-have, not critical
- Document as future work for post-release cleanup

**Success Condition (Future):**
- When touched again, extract into helper function
- Add unit tests for the extraction logic
- Mark as "Refactored" in the next audit

---

## Already Completed (Previous Session)

The following changes were completed in the previous session and documented in `skills/team-governance/SKILL.md`:

| Change | File | Status | Session |
|--------|------|--------|---------|
| GovernanceRequests section | skills/team-governance/SKILL.md | ✓ DONE | Prev |
| Agent Transfers section | skills/team-governance/SKILL.md | ✓ DONE | Prev |
| Authentication Headers section | skills/team-governance/SKILL.md | ✓ DONE | Prev |
| Governance Discovery section | skills/team-governance/SKILL.md | ✓ DONE | Prev |

---

## Clean Components (No Changes Needed)

The following components have excellent decoupling and require **NO changes**:

| Component | File | Assessment | Notes |
|-----------|------|------------|-------|
| **Skills: Messaging** | skills/agent-messaging/SKILL.md | ✓ 10/10 | Teaches CLI only, no API syntax |
| **Skills: Planning** | skills/planning/SKILL.md | ✓ 10/10 | File-based, no API calls |
| **Skills: Graph Query** | skills/graph-query/SKILL.md | ✓ 10/10 | Teaches CLI commands only |
| **Skills: Docs Search** | skills/docs-search/SKILL.md | ✓ 10/10 | Teaches CLI commands only |
| **Skills: Memory Search** | skills/memory-search/SKILL.md | ✓ 10/10 | No API calls |
| **Scripts: amp-send.sh** | scripts/amp-send.sh | ✓ 10/10 | IS the abstraction layer |
| **Scripts: amp-helper.sh** | scripts/amp-helper.sh | ✓ 10/10 | IS the abstraction layer, env-configurable |
| **Scripts: agent-helper.sh** | scripts/agent-helper.sh | ✓ 9/10 | IS the abstraction layer (except for `role` command) |
| **Config: hooks.json** | hooks/hooks.json | ✓ 10/10 | Declarative only, uses CLAUDE_PLUGIN_ROOT |

---

## Change Summary Table

| # | Change | File | Priority | Status | Effort | Impact |
|---|--------|------|----------|--------|--------|--------|
| 1 | Add `role` command | scripts/agent-helper.sh | **HIGH** | TODO | ~20 lines | Fixes curl in skill |
| 1b | Update skill doc | skills/ai-maestro-agents-management/SKILL.md | **HIGH** | TODO | ~1 line | Removes API example |
| 2 | Document exception | scripts/ai-maestro-hook.cjs | **LOW** | TODO | ~12 lines | Clarifies intent |
| 3 | Extract lookup helper | scripts/ai-maestro-hook.cjs | **LOW** | FUTURE | ~15 lines | Code quality |

---

## Implementation Order

### Batch 1 (High Priority - Must Do This Session)
1. Add `aimaestro-agent.sh role` command
2. Update `ai-maestro-agents-management/SKILL.md` to teach CLI command

**Expected Outcome:** Zero curl examples remain in any skill.

### Batch 2 (Low Priority - Housekeeping)
3. Add exception documentation to `ai-maestro-hook.cjs`

**Expected Outcome:** Future maintainers understand the hook is exempt from layering rules.

### Batch 3 (Deferred - Future Session)
4. Extract agent lookup helper (refactoring, not critical)

**Expected Outcome:** Code duplication reduced, better maintainability.

---

## Testing Checklist

After implementing these changes:

- [ ] `aimaestro-agent.sh role` command works
  - [ ] Returns `{"role": "manager"}` for manager agents
  - [ ] Returns `{"role": "member"}` for member agents
  - [ ] Returns `{"role": "unset"}` for agents without governance
  - [ ] Respects `AIMAESTRO_API_BASE` env var

- [ ] Skill documentation updated
  - [ ] No curl examples in governance skill
  - [ ] Teaches `aimaestro-agent.sh role` instead
  - [ ] Agent can check their role without knowing API syntax

- [ ] Hook exception documented
  - [ ] Comment appears at top of `ai-maestro-hook.cjs`
  - [ ] Explains why direct API calls are acceptable

- [ ] No regressions
  - [ ] Governance skill still teaches all other operations
  - [ ] Agent role checking still works
  - [ ] Hook still sends notifications

---

## Success Criteria

✓ **High Priority (Must Complete):**
- `aimaestro-agent.sh role` command implemented
- Skill updated to teach CLI command
- Zero curl examples remain in any skill

✓ **Low Priority (Should Complete):**
- Exception documentation added to hook

✓ **Future (Can Defer):**
- Agent lookup helper extracted

---

## Post-Implementation Audit

After all changes are merged, the next audit should verify:

| Component | Current Score | Expected Score | Pass Criteria |
|-----------|---|---|---|
| skills/ai-maestro-agents-management/SKILL.md | 9/10 | 10/10 | Zero API curl examples |
| Overall Plugin | 9/10 | 10/10 | All high-priority changes complete |

**Expected Final Score:** 10/10 (Perfect Decoupling)

---

## Appendix: Files Modified

### Modified Files
- `plugin/plugins/ai-maestro/scripts/agent-helper.sh` — Add `role` subcommand
- `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` — Add exception documentation
- `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` — Update to teach CLI command

### Reference Files (For Context)
- `docs_dev/audit-aimaestro-plugin-decoupling-2026-02-27.md` — Full audit findings

---

**Change Spec Date:** 2026-02-27
**Status:** READY FOR IMPLEMENTATION
**Estimated Time to Complete:** 1-2 hours
