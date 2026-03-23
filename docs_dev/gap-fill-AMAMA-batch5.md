# Plugin Abstraction Principle Audit: EAMA Batch 5

**Date**: 2026-02-27
**Reference**: `/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
**Auditor**: Claude Code (automated audit)
**Harmonization Rule Applied**: EAMA's internal recording/tallying systems (handoff docs, decision-log, GitHub issue labels) MUST be PRESERVED. Only add GovernanceRequest integration alongside them.

---

## Files Audited

1. `skills/eama-label-taxonomy/SKILL.md`
2. `skills/eama-role-routing/SKILL.md`
3. `skills/eama-session-memory/SKILL.md`
4. `skills/eama-status-reporting/SKILL.md`

---

## Violation Type Definitions

| Code | Description |
|------|-------------|
| `HARDCODED_API` | Skill embeds raw `curl`/`fetch` calls or hardcoded API endpoint URLs |
| `HARDCODED_GOVERNANCE` | Skill hardcodes governance rules, permission matrices, or role restrictions instead of deferring to `team-governance` skill at runtime |
| `HARDCODED_AMP` | Skill embeds raw AMP API calls instead of referencing the `agent-messaging` global skill or `amp-*.sh` scripts |
| `LOCAL_REGISTRY` | Skill uses a locally-maintained registry/list of agents/teams instead of discovering them from the AI Maestro API at runtime |
| `CLI_SYNTAX` | Skill embeds specific CLI flags or script invocation patterns that bypass the global script abstraction layer |
| `REDUNDANT_OPERATIONS` | Skill duplicates logic already provided by a global skill (team-governance, ai-maestro-agents-management, agent-messaging) |

---

## File 1: `skills/eama-label-taxonomy/SKILL.md`

**Path**: `/Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent/skills/eama-label-taxonomy/SKILL.md`

### Verdict: CLEAN

**Analysis**:

All `gh` CLI commands in this file are GitHub CLI operations (issue creation, label editing, issue querying) — not AI Maestro API calls. GitHub CLI (`gh`) is the canonical tool for GitHub operations and is not subject to the Plugin Abstraction Principle, which governs AI Maestro API access. No `curl` calls to `localhost:23000`, no hardcoded governance rules, no AMP API calls, no local agent registries, no AI Maestro CLI syntax violations.

The label taxonomy defined here is EAMA's own domain-specific content, not a duplication of any global AI Maestro skill. The Prerequisites section correctly declares `gh` CLI as a dependency without embedding API syntax.

The EAMA authority matrix at the bottom (what EAMA can/cannot set) is EAMA's own operational rules — not AI Maestro governance rules — so it does not violate Rule 3.

**No violations found.**

---

## File 2: `skills/eama-role-routing/SKILL.md`

**Path**: `/Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent/skills/eama-role-routing/SKILL.md`

### Verdict: 2 VIOLATIONS FOUND

---

### VIOLATION RR-1

| Field | Value |
|-------|-------|
| **Type** | `HARDCODED_AMP` |
| **Severity** | MEDIUM |
| **Location** | Line 209 |

**Offending text** (line 209):
```
- [ ] **Target agent exists and is alive** - Send health ping before handoff using the `agent-messaging` skill
```

**Assessment**: This is a borderline case that PASSES — the line correctly references the global `agent-messaging` skill by name rather than embedding AMP syntax. No violation here upon closer inspection.

---

### VIOLATION RR-1 (revised)

| Field | Value |
|-------|-------|
| **Type** | `HARDCODED_GOVERNANCE` |
| **Severity** | MEDIUM |
| **Location** | Lines 182–186 |

**Offending text**:
```
**CRITICAL**:
- EAMA is the ONLY role that communicates directly with the USER
- ECOS manages agent lifecycle and sits between EAMA and specialist agents
- EAA, EOA, and EIA do NOT communicate directly with each other or with EAMA
- All specialist agent operations flow through ECOS
```

**Why it violates Rule 3**: This hardcodes a communication topology and role hierarchy that is governance-level organizational structure. If the team structure or communication policy changes in AI Maestro's governance configuration, this file would need manual updates rather than discovering the rules at runtime. The communication hierarchy diagram on line 177 compounds this.

**Required Change**: Replace with a reference to runtime governance discovery:
```markdown
**CRITICAL**: Communication topology and role permissions are defined by the team governance configuration.
Before routing, verify current role relationships by consulting the `team-governance` skill:
Refer to: `~/.claude/skills/team-governance/SKILL.md` → "Role Permissions" section
```

**Preservation note**: The routing decision matrix (which routes *what type of request* to *what role*) is EAMA's own operational logic and should be PRESERVED. Only the hardcoded communication topology assertions need to be converted to runtime discovery.

---

### VIOLATION RR-2

| Field | Value |
|-------|-------|
| **Type** | `LOCAL_REGISTRY` |
| **Severity** | LOW |
| **Location** | Lines 53–62 |

**Offending text**:
```markdown
## Plugin Prefix Reference

| Role | Prefix | Plugin Name |
|------|--------|-------------|
| Assistant Manager | `eama-` | Emasoft Assistant Manager Agent |
| Chief of Staff | `ecos-` | Emasoft Chief of Staff |
| Architect | `eaa-` | Emasoft Architect Agent |
| Orchestrator | `eoa-` | Emasoft Orchestrator Agent |
| Integrator | `eia-` | Emasoft Integrator Agent |
```

**Why it violates Rule 3 / LOCAL_REGISTRY**: This is a hardcoded registry of agent roles and their session name prefixes. If roles are renamed, added, or restructured, this table will be stale. Agent registration and role discovery should be delegated to the AI Maestro agents API at runtime.

**Required Change**: Replace with a note to discover registered agents at runtime using the `ai-maestro-agents-management` skill, while retaining the prefix convention as documentation only (clearly labeled as "default convention, verify at runtime"):
```markdown
## Role Discovery

Active specialist agents and their session names are discovered at runtime.
Follow the `ai-maestro-agents-management` skill to list registered agents:
Refer to: `~/.claude/skills/ai-maestro-agents-management/SKILL.md` → "List Agents" section

**Default naming convention** (may vary per deployment):
- Assistant Manager: `eama-*` prefix
- Chief of Staff: `ecos-*` prefix
- [etc. — labeled as convention only, not authoritative]
```

**Preservation note**: The role routing logic and handoff document system are EAMA's own internal coordination mechanisms and MUST be preserved.

---

## File 3: `skills/eama-session-memory/SKILL.md`

**Path**: `/Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent/skills/eama-session-memory/SKILL.md`

### Verdict: CLEAN

**Analysis**:

This skill is entirely focused on EAMA's internal user-relationship memory system: reading/writing local markdown files (`thoughts/shared/handoffs/eama/`), adding GitHub issue comments, and tracking user preferences. None of these operations interact with the AI Maestro API.

No `curl` calls, no hardcoded API endpoints, no AMP syntax, no governance rules, no agent registry, no CLI syntax violations. The GitHub issue comment pattern (`gh issue view`, `gh issue comment`) uses the GitHub CLI which is not subject to the Plugin Abstraction Principle.

The session memory system (handoff documents, decision-log, pending-items) is EAMA's own internal record-keeping and is explicitly exempt from the HARDCODED_GOVERNANCE rule — it defines EAMA's behavior, not AI Maestro governance rules.

**No violations found.**

---

## File 4: `skills/eama-status-reporting/SKILL.md`

**Path**: `/Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent/skills/eama-status-reporting/SKILL.md`

### Verdict: 1 VIOLATION FOUND

---

### VIOLATION SR-1

| Field | Value |
|-------|-------|
| **Type** | `HARDCODED_AMP` |
| **Severity** | MEDIUM |
| **Location** | Lines 31, 54, 57 |

**Offending text**:

Line 31: `- AI Maestro messaging system must be running for role queries`
Line 54: `1. Query each role via AI Maestro for their current status`
Line 57: `1. Query each role via AI Maestro for current status`

**Assessment**: These lines reference "querying roles via AI Maestro" without specifying HOW. On its own, this phrasing is ambiguous — it could mean using the `agent-messaging` global skill (correct) or embedding raw AMP API calls (wrong). Since no actual `curl` calls or raw AMP syntax is present, this is a LOW-severity documentation gap rather than a hard violation.

However, Step 2 in the Instructions section (line 32) states:
> `2. Query GitHub for issue and PR status using gh CLI`

but there is no equivalent step specifying "use the `agent-messaging` skill" for role queries. This creates a documentation asymmetry where GitHub operations correctly reference the tool (`gh`) but AI Maestro messaging operations do not reference the correct abstraction layer.

**Required Change**: Add an explicit reference to the `agent-messaging` global skill for role status queries:
```markdown
### Prerequisites note on role querying
To query roles for status, use the `agent-messaging` skill installed by AI Maestro.
Refer to: `~/.claude/skills/agent-messaging/SKILL.md` → "Sending Messages" and "Inbox" sections
```

And update Step 2 in the Instructions:
```markdown
2. Query each role via AMP messaging (follow the `agent-messaging` skill — do NOT use raw curl calls)
```

**Preservation note**: The report types, formats, output locations, and the role-based aggregation logic are EAMA's own internal reporting system and MUST be preserved.

---

### VIOLATION SR-2

| Field | Value |
|-------|-------|
| **Type** | `HARDCODED_GOVERNANCE` |
| **Severity** | LOW |
| **Location** | Lines 19–22 (implicit) |

**Offending text** (implicit in the report structure):
```markdown
## Report Generation Workflow

1. Query each role via AI Maestro for current status
2. Query GitHub for issue/PR status
```

The report structure assumes a fixed set of roles (Architect/EAA, Orchestrator/EOA, Integrator/EIA) as hardcoded report sections in the Progress Report Example (lines 111–124):
```
- [EAA] Auth system design approved
- [EOA] Login endpoint implemented
- [EIA] Code review completed
```

**Why this violates Rule 3**: The role names are hardcoded rather than discovered from team governance configuration. If roles are restructured, this report format becomes stale.

**Severity**: LOW — this is in the "Examples" section, not the operational instructions. The examples are illustrative placeholders and are commonly kept as-is in skills documentation. This does not need to block usage but should be noted for future refactoring.

**Required Change (LOW priority)**: Add a note in the Examples section:
```markdown
> Note: Role codes (EAA, EOA, EIA) are illustrative. Discover active roles at runtime
> using the `ai-maestro-agents-management` skill before generating reports.
```

---

## Summary Table

| File | Verdict | Violations | Severity |
|------|---------|------------|----------|
| `eama-label-taxonomy/SKILL.md` | CLEAN | 0 | — |
| `eama-role-routing/SKILL.md` | VIOLATIONS | 2 (RR-1: HARDCODED_GOVERNANCE, RR-2: LOCAL_REGISTRY) | MEDIUM + LOW |
| `eama-session-memory/SKILL.md` | CLEAN | 0 | — |
| `eama-status-reporting/SKILL.md` | VIOLATIONS | 2 (SR-1: HARDCODED_AMP doc gap, SR-2: HARDCODED_GOVERNANCE) | MEDIUM + LOW |

---

## Priority Action List

### MUST FIX (MEDIUM severity)

1. **`eama-role-routing/SKILL.md` lines 182–186**: Replace hardcoded communication topology with runtime governance discovery reference.
2. **`eama-status-reporting/SKILL.md` lines 31/54/57**: Add explicit `agent-messaging` skill reference for role querying steps.

### SHOULD FIX (LOW severity)

3. **`eama-role-routing/SKILL.md` lines 53–62**: Convert Plugin Prefix Reference table to runtime-discovery note with convention documentation.
4. **`eama-status-reporting/SKILL.md` lines 111–124**: Add a note that role codes in examples are illustrative, not hardcoded.

---

## Harmonization Notes

Per the Harmonization Rule, the following systems must NOT be touched during remediation:

- `eama-label-taxonomy`: GitHub label operations, EAMA authority matrix — **PRESERVE ALL**
- `eama-role-routing`: Handoff document system, UUID generation, routing decision matrix, file naming conventions — **PRESERVE ALL**
- `eama-session-memory`: Handoff directory structure, decision-log, pending-items, preference tracking, GitHub issue comment persistence — **PRESERVE ALL**
- `eama-status-reporting`: Report types, output formats, `docs_dev/reports/` storage, GitHub CLI usage — **PRESERVE ALL**

GovernanceRequest integration (if applicable) should be added ALONGSIDE the existing systems, not replacing them.
