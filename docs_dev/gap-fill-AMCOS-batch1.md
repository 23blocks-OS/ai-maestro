# Plugin Abstraction Principle Audit: AMCOS Batch 1

**Audit Date:** 2026-02-27
**Reference Standard:** `/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
**Auditor:** Claude Code (claude-sonnet-4-6)
**Plugin Root:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/`

---

## Files Audited

1. `skills/amcos-label-taxonomy/SKILL.md`
2. `skills/amcos-plugin-management/SKILL.md`
3. `skills/amcos-skill-management/references/validation-procedures.md`

---

## Summary

| File | HARDCODED_API | HARDCODED_GOVERNANCE | HARDCODED_AMP | LOCAL_REGISTRY | CLI_SYNTAX | REDUNDANT_OPERATIONS | Total Violations |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| amcos-label-taxonomy/SKILL.md | 5 | 0 | 0 | 0 | 0 | 0 | **5** |
| amcos-plugin-management/SKILL.md | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| amcos-skill-management/references/validation-procedures.md | 1 | 0 | 0 | 0 | 0 | 0 | **1** |

**Total violations found: 6**

---

## FILE 1: `skills/amcos-label-taxonomy/SKILL.md`

### Violation 1 — HARDCODED_API

**Lines:** 93–95
**Severity:** HIGH
**Type:** HARDCODED_API

**Offending code:**
```bash
# Step 3: Update team registry via REST API
curl -X PATCH "$AIMAESTRO_API/api/agents/implementer-1" \
  -H "Content-Type: application/json" \
  -d '{"current_issues": [42]}'
```

**Why it violates the principle:**
The skill embeds a direct `curl` call to the AI Maestro REST API (`/api/agents/<name>`). Rule 2 of the Plugin Abstraction Principle states: "Plugin Hooks/Scripts MUST NOT Call the API Directly." Plugin skills should reference the global `ai-maestro-agents-management` skill for agent update operations. If the API endpoint or auth headers change, this skill breaks silently.

**Required change:**
Replace the raw `curl` call with a reference to the `ai-maestro-agents-management` skill:
```markdown
**Step 3: Update team registry**
Use the `ai-maestro-agents-management` skill to update the agent's current issues.
Refer to: `~/.claude/skills/ai-maestro-agents-management/SKILL.md` → "Update Agent" section.
```

---

### Violation 2 — HARDCODED_API

**Lines:** 117–119
**Severity:** HIGH
**Type:** HARDCODED_API

**Offending code:**
```bash
# Step 3: Remove agent from team registry via REST API
curl -X PATCH "$AIMAESTRO_API/api/agents/implementer-1" \
  -H "Content-Type: application/json" \
  -d '{"status": "terminated"}'
```

**Why it violates the principle:**
Same as Violation 1 — direct `curl` call to the REST API for agent lifecycle management. This is duplicating functionality that the `ai-maestro-agents-management` global skill already provides.

**Required change:**
Replace with a reference to the `ai-maestro-agents-management` skill:
```markdown
**Step 3: Remove agent from team registry**
Use the `ai-maestro-agents-management` skill to update the agent's status to terminated.
Refer to: `~/.claude/skills/ai-maestro-agents-management/SKILL.md` → "Update/Delete Agent" section.
```

---

### Violation 3 — HARDCODED_API

**Lines:** 257–259
**Severity:** HIGH
**Type:** HARDCODED_API

**Offending code:**
```bash
# Query agent info from registry via REST API
curl -s "$AIMAESTRO_API/api/agents/implementer-1" | jq .
# Returns: {"session_name": "code-impl-01", "status": "active", "current_issues": [42, 43]}
```

**Why it violates the principle:**
Direct API call embedded in the skill body. Rule 1 states plugin skills must not embed API syntax. The `ai-maestro-agents-management` skill is the correct abstraction for agent queries.

**Required change:**
```markdown
**Query agent info from registry**
Use the `ai-maestro-agents-management` skill to retrieve agent details.
Refer to: `~/.claude/skills/ai-maestro-agents-management/SKILL.md` → "Show Agent" section.
```

---

### Violation 4 — HARDCODED_API

**Lines:** 265–268
**Severity:** HIGH
**Type:** HARDCODED_API

**Offending code:**
```bash
# Compare with registry (via REST API)
REGISTERED=$(curl -s "$AIMAESTRO_API/api/agents/implementer-1" | jq -r '.current_issues | sort | .[]')
```

**Why it violates the principle:**
Another raw `curl` call to the REST API embedded within the skill's sync-check example. Even using environment variables for the URL does not exempt a skill from this rule — the issue is the `curl` call pattern itself with direct endpoint and jq parsing of API responses.

**Required change:**
Replace the `curl`-based registry query with a reference to the abstraction layer:
```markdown
**Compare with registry**
Use the `ai-maestro-agents-management` skill to retrieve the agent's `current_issues` list.
Refer to: `~/.claude/skills/ai-maestro-agents-management/SKILL.md` → "Show Agent" section.
Compare the retrieved list against the GitHub labels result.
```

---

### Violation 5 — HARDCODED_API

**Lines:** 50, 73 (checklist item and error table)
**Severity:** LOW
**Type:** HARDCODED_API (implicit — normative reference to direct REST API use)

**Offending text:**
- Line 50: `- [ ] Update team registry via AI Maestro REST API if agent assignment changed`
- Line 73: `Registry out of sync | Labels don't match team registry | Run sync check via REST API to reconcile`

**Why it violates the principle:**
The checklist item and error resolution table explicitly instruct agents to interact with the "AI Maestro REST API" directly rather than through the abstraction layer. This normalizes the anti-pattern even when not providing an explicit `curl` command.

**Required change:**
- Checklist: `- [ ] Update team registry using the ai-maestro-agents-management skill if agent assignment changed`
- Error table: `Run sync check via the ai-maestro-agents-management skill to reconcile`

---

### Harmonization Note (PRESERVE — not a violation)

The label taxonomy skill's internal tracking of agent assignments (which agents are assigned to which issues) is **not** a violation of the Plugin Abstraction Principle. The HARMONIZATION RULE applies: plugin internal approval/recording systems must be preserved and harmonized with AI Maestro's GovernanceRequest system. The `gh issue edit` commands for label management, the assignment tracking logic, and the sync-check comparison pattern are all legitimate plugin-internal operations that complement rather than duplicate AI Maestro's GovernanceRequest system. Only the `curl` calls to AI Maestro's own REST API must be replaced with skill references.

---

### Missing Prerequisites Section

The file does list prerequisites (lines 25–30) but does not declare skill dependencies per the standard format required by the Plugin Abstraction Principle. The following skills should be listed under a proper `## Prerequisites` section:
- `ai-maestro-agents-management` — For agent lifecycle and registry operations
- `team-governance` — If any governance/permission checks are performed

**Required addition at the top of the skill body:**
```markdown
## Prerequisites

This skill requires the following AI Maestro skills to be installed:
- `ai-maestro-agents-management` — For agent registry update and query operations
```

---

## FILE 2: `skills/amcos-plugin-management/SKILL.md`

### Result: NO VIOLATIONS FOUND

This file correctly follows the Plugin Abstraction Principle throughout.

**Evidence of correct patterns:**

1. **Lines 340–344 (GovernanceRequest pattern):** The skill explicitly distinguishes between local and remote operations, directing cross-host operations through the governance pipeline rather than direct CLI commands. This is exemplary adherence.

2. **Lines 343–356 (Remote operations):** Remote plugin management is delegated entirely to the `ai-maestro-agents-management` skill, never embedding raw `curl` calls or CLI syntax.

3. **Lines 370–389 (Remote operations table):** All remote operations are described abstractly by operation name, not by underlying command syntax. Agents are directed to use the `ai-maestro-agents-management` skill.

4. **Lines 254 (remote install op reference):** Correctly references the `ai-maestro-agents-management` skill for remote plugin operations.

5. **No hardcoded API URLs, no auth headers, no permission matrices, no AMP wire formats.**

**One minor observation (not a violation):**
Line 29 (`Access to AI Maestro REST API ($AIMAESTRO_API, default http://localhost:23000)`) lists API access as a prerequisite in the compatibility/prerequisites section. This is a runtime environment requirement, not an instruction to call the API directly, so it does not constitute a violation. However, following the spirit of the principle, this prerequisite would be more accurately stated as "AI Maestro installed with `ai-maestro-agents-management` skill available."

---

## FILE 3: `skills/amcos-skill-management/references/validation-procedures.md`

### Violation 6 — HARDCODED_API

**Lines:** 914–916
**Severity:** MEDIUM
**Type:** HARDCODED_API

**Offending code:**
```bash
# Check if AI Maestro server is running
ps aux | grep ai-maestro
# If not, start it (consult AI Maestro docs)
```

**Context:** Section 7.2 "PSS unavailable or not responding," Step 4.

**Why it violates the principle:**
While `ps aux | grep ai-maestro` is not a direct API call, it is a hardcoded system-level introspection command for determining AI Maestro's running state. The correct abstraction is to use the `ai-maestro-agents-management` skill's health check function, which is what Step 1 of the same section already does correctly (line 906: "Use the `ai-maestro-agents-management` skill to check AI Maestro health status."). Having a fallback that bypasses the abstraction layer (going directly to the OS process table) creates an inconsistency and potential future maintenance issue if the process name changes.

**Severity rationale:** MEDIUM rather than HIGH because this is a fallback diagnostic step in an error recovery section, and because the surrounding steps in the same section correctly use the skill abstraction. It does not expose API endpoints or auth logic.

**Required change:**
Replace the direct `ps aux` command with a reference to the established abstraction:
```markdown
Step 4: If AI Maestro is still not responding:
- Consult the AI Maestro operations documentation for server restart procedures
- Or contact the system administrator responsible for the AI Maestro instance
- Use the `ai-maestro-agents-management` skill to retry the health status check after restart
```

---

### Correct Patterns in This File (Positive Examples)

The file largely follows the Plugin Abstraction Principle well:

- **Lines 343, 351–352:** Remote PSS reindex is correctly routed through the `agent-messaging` skill, not direct API calls.
- **Lines 906, 908:** Health and agent status checks correctly reference the `ai-maestro-agents-management` skill.
- **Lines 5.3 (amcos_reindex_skills.py):** The script sends reindex requests via `amp-send` (the global script abstraction), not by calling an API endpoint directly.
- **Lines 601:** Error handling references network retries in an abstract way using the AI Maestro message path, not direct API calls.

---

## Consolidated Remediation Checklist

### File: `skills/amcos-label-taxonomy/SKILL.md`

- [ ] **Line 93–95:** Replace `curl -X PATCH "$AIMAESTRO_API/api/agents/..."` in Example 1, Step 3 with reference to `ai-maestro-agents-management` skill "Update Agent" section
- [ ] **Line 117–119:** Replace `curl -X PATCH "$AIMAESTRO_API/api/agents/..."` in Example 2, Step 3 with reference to `ai-maestro-agents-management` skill "Update/Delete Agent" section
- [ ] **Line 257–259:** Replace `curl -s "$AIMAESTRO_API/api/agents/..."` in "Agent Registry and Labels" section with reference to `ai-maestro-agents-management` skill "Show Agent" section
- [ ] **Line 265–268:** Replace `curl -s "$AIMAESTRO_API/api/agents/..."` in Sync Check section with reference to `ai-maestro-agents-management` skill
- [ ] **Line 50:** Reword checklist item to reference the `ai-maestro-agents-management` skill instead of "AI Maestro REST API"
- [ ] **Line 73:** Reword error table resolution to reference the `ai-maestro-agents-management` skill instead of "REST API"
- [ ] **Add Prerequisites section** declaring dependency on `ai-maestro-agents-management` skill

### File: `skills/amcos-plugin-management/SKILL.md`

- [ ] No violations. No changes required.
- [ ] Optional: Clarify line 29 prerequisite to reference the `ai-maestro-agents-management` skill instead of raw API access.

### File: `skills/amcos-skill-management/references/validation-procedures.md`

- [ ] **Lines 914–916:** Replace `ps aux | grep ai-maestro` in Section 7.2 Step 4 with documentation reference or `ai-maestro-agents-management` skill retry guidance

---

## Violation Severity Distribution

| Severity | Count | Files |
|----------|-------|-------|
| HIGH | 4 | amcos-label-taxonomy/SKILL.md (violations 1–4) |
| MEDIUM | 1 | amcos-skill-management/references/validation-procedures.md (violation 6) |
| LOW | 1 | amcos-label-taxonomy/SKILL.md (violation 5) |
| **TOTAL** | **6** | |

---

## Harmonization Rule Compliance

Per the HARMONIZATION RULE: "Plugin internal approval/recording systems must be PRESERVED and harmonized with AI Maestro's GovernanceRequest system. NEVER recommend removing plugin internal tracking."

All violations identified in this audit are about **direct API calls that should be routed through abstraction layers**, not about removing plugin-internal tracking logic. Specifically:

- The label assignment tracking system (GitHub label manipulation via `gh` CLI) is **fully preserved** — these are plugin-internal operations that do not duplicate AI Maestro operations.
- The sync-check pattern (comparing GitHub labels against the registry) is **preserved** — only the mechanism for reading the registry (raw `curl` vs. skill reference) needs to change.
- The PSS reindex workflow, agent validation tracking, and skill cross-reference logic are all **fully preserved**.

No recommendation in this audit removes any plugin-internal tracking capability.
