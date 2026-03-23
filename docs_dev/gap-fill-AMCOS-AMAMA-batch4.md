# Plugin Abstraction Principle Audit — Batch 4
## AMCOS + AMAMA Skills (4 files)

**Date**: 2026-02-27
**Auditor**: Claude Code (automated)
**Reference Standard**: `/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
**Harmonization Rule**: Plugin internal approval/recording systems must be PRESERVED and harmonized with AI Maestro's GovernanceRequest system.

---

## Summary Table

| File | Status | Violation Count | Severity |
|------|--------|-----------------|----------|
| `amcos-staff-planning/SKILL.md` | CLEAN | 0 | — |
| `eama-approval-workflows/SKILL.md` | VIOLATIONS | 2 | LOW / MEDIUM |
| `eama-ecos-coordination/SKILL.md` | CLEAN | 0 | — |
| `eama-github-routing/SKILL.md` | VIOLATIONS | 1 | LOW |

---

## FILE 1: amcos-staff-planning/SKILL.md

**Path**: `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/amcos-staff-planning/SKILL.md`

**Result: CLEAN**

No violations found. The skill is purely a planning and analysis guide covering role assessment, capacity planning, and staffing templates. It contains no API calls, no curl commands, no hardcoded governance rules, no registry reads, no CLI syntax, and no AMP wire formats. All operations are described at a conceptual level and deferred to reference documents. The skill correctly states its prerequisites (access to agent registry and project configuration) without embedding registry paths or API endpoints.

---

## FILE 2: eama-approval-workflows/SKILL.md

**Path**: `/Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent/skills/eama-approval-workflows/SKILL.md`

**Result: VIOLATIONS FOUND — 2**

### Violation 1

- **Type**: `LOCAL_REGISTRY`
- **Severity**: MEDIUM
- **Lines**: 212–217
- **Description**: The skill embeds a direct shell command that reads from a hardcoded local file path (`docs_dev/approvals/approval-state.yaml`) using `cat` piped into `yq`. This is a direct read of an internal file path that should either be abstracted behind a script or omitted from the skill entirely (since skills are for agent guidance, not shell scripts).

**Offending code** (lines 212–217):
```bash
cat docs_dev/approvals/approval-state.yaml | yq -r '
  .approvals[] |
  select(.status == "pending") |
  select((now - (.requested_at | fromdateiso8601)) > 86400) |
  .id
'
```

- **Required Change**: Remove the embedded shell command. Replace with a description instructing the agent to check the approval state file via the approval tracking mechanism (without embedding the file path and yq syntax inline). If the expiry check needs to be automated, extract it to a global script (e.g., `aimaestro-approvals-check.sh`) and reference that script by name.

**Harmonization Note**: The approval state tracking system described in this skill (lines 167–180) is an internal plugin tracking mechanism and must be **PRESERVED** per the Harmonization Rule. It is not a violation — the YAML schema at lines 167–180 is plugin-internal state management, which is correct and should remain. Only the inline shell command at lines 212–217 is the violation.

---

### Violation 2

- **Type**: `CLI_SYNTAX`
- **Severity**: LOW
- **Lines**: 209–217
- **Description**: The skill embeds specific CLI tool syntax for `yq` (a YAML processor) inline as an executable example, including `yq -r` flags, `fromdateiso8601`, `now`, and shell pipeline construction. Hardcoding third-party CLI tool invocation syntax in a skill violates the principle that skills describe WHAT to do, not HOW (the how belongs in scripts). If `yq` is not installed or changes its API, this embedded syntax becomes incorrect without any plugin update path.

- **Required Change**: Replace the `yq` command block with prose instructions: "Identify pending approvals with `requested_at` timestamps more than 24 hours in the past using the approval tracking state file." If the implementation is needed, place the shell logic in a script (e.g., in the plugin's `scripts/` directory) and reference it by name.

---

## FILE 3: eama-ecos-coordination/SKILL.md

**Path**: `/Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent/skills/eama-ecos-coordination/SKILL.md`

**Result: CLEAN**

No violations found. The skill describes coordination patterns between EAMA and ECOS at a conceptual level. Message formats are referenced via external reference documents (`references/message-formats.md`, `references/ai-maestro-message-templates.md`) rather than embedded inline. All messaging instructions correctly reference the `agent-messaging` skill by name (lines 253, 271). The ACK message format described at lines 251–261 is a protocol description, not a wire-format embedding — it describes the semantic fields ECOS must include, which is appropriate skill-level guidance. The audit log YAML schema at lines 215–222 is plugin-internal state tracking and is correct to preserve per the Harmonization Rule. No hardcoded governance rules, no curl commands, no registry file reads, no API endpoint URLs were found.

---

## FILE 4: eama-github-routing/SKILL.md

**Path**: `/Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent/skills/eama-github-routing/SKILL.md`

**Result: VIOLATIONS FOUND — 1**

### Violation 1

- **Type**: `CLI_SYNTAX`
- **Severity**: LOW
- **Lines**: 349–351
- **Description**: The skill embeds hardcoded `gh` CLI command syntax inline as executable examples:

```bash
gh issue list --search "EAMA-LINK: design-uuid=abc123"
gh pr list --search "Design UUID: abc123"
```

While `gh` is a globally-installed tool (not an AI Maestro internal API), embedding specific CLI syntax in a skill violates the principle that skills should describe WHAT to do rather than HOW. The correct approach is to reference the `ai-maestro-agents-management` skill or instruct the agent to use the `gh` CLI per the standard GitHub operations skill, without hardcoding specific flag syntax.

Additionally, the skill correctly requires `gh` in its Prerequisites section (line 18) — that prerequisite declaration is fine. The violation is specifically the inline embedded shell commands.

- **Required Change**: Replace the two `gh` command lines with a prose instruction: "To find GitHub items linked by UUID, use `gh issue list` or `gh pr list` with the appropriate `--search` flag containing the UUID reference format. Consult the GitHub CLI documentation or the relevant specialist agent (EIA) for the exact search syntax." Alternatively, if this is a commonly needed operation, extract it to a plugin script (e.g., `scripts/find-by-uuid.sh`) and reference that script by name.

---

## Detailed Findings by Violation Type

### HARDCODED_API
No violations found across any of the 4 files. No `curl` commands, no `http://localhost:23000` URLs, no HTTP headers embedded in any skill.

### HARDCODED_GOVERNANCE
No violations found. `eama-approval-workflows/SKILL.md` describes role categories and request types (lines 123–130 of `eama-ecos-coordination`) but these are EAMA's own internal coordination categories, not AI Maestro governance rules, permission matrices, or team type restrictions. They are preserved correctly per the Harmonization Rule.

### HARDCODED_AMP
No violations found. The `eama-ecos-coordination/SKILL.md` ACK message format (lines 251–261) describes semantic field names, not wire-format JSON envelopes. All AMP operations in all 4 files correctly reference the `agent-messaging` skill by name rather than embedding message wire formats.

### LOCAL_REGISTRY
One violation: `eama-approval-workflows/SKILL.md` lines 212–217 (direct `cat` read of `docs_dev/approvals/approval-state.yaml`). Details above.

### CLI_SYNTAX
Two violations:
1. `eama-approval-workflows/SKILL.md` lines 209–217 (`yq` invocation with specific flags and pipeline).
2. `eama-github-routing/SKILL.md` lines 349–351 (`gh issue list` and `gh pr list` with hardcoded search syntax).

### REDUNDANT_OPERATIONS
No violations found. The approval tracking state machines in `eama-approval-workflows/SKILL.md` and the audit logs in `eama-ecos-coordination/SKILL.md` are plugin-internal systems that complement (rather than duplicate) AI Maestro's GovernanceRequest system. Per the Harmonization Rule, these are correctly preserved.

---

## Required Changes Summary

| File | Line(s) | Type | Severity | Action Required |
|------|---------|------|----------|-----------------|
| `eama-approval-workflows/SKILL.md` | 212–217 | `LOCAL_REGISTRY` | MEDIUM | Remove inline `cat \| yq` shell command; replace with prose description or extract to a named script |
| `eama-approval-workflows/SKILL.md` | 209–217 | `CLI_SYNTAX` | LOW | Remove embedded `yq` flag syntax from skill body |
| `eama-github-routing/SKILL.md` | 349–351 | `CLI_SYNTAX` | LOW | Replace hardcoded `gh` command examples with prose instructions or a named script reference |

---

## Notes on Harmonization

The following internal systems were examined and found to be **correctly preserved** per the Harmonization Rule (plugin internal approval/recording systems must be harmonized with, not eliminated by, the AI Maestro GovernanceRequest system):

1. **`eama-approval-workflows` approval state YAML schema** (lines 167–180): Plugin-internal approval tracking. Preserving this is correct.
2. **`eama-ecos-coordination` audit log YAML schema** (lines 215–222): Plugin-internal audit trail for ECOS interactions. Preserving this is correct.
3. **`eama-ecos-coordination` ACK protocol** (lines 240–305): Plugin-internal reliability protocol for inter-agent communication. Preserving this is correct.
4. **`eama-approval-workflows` escalation and expiry rules** (lines 183–296): Plugin-internal workflow logic governing approval lifecycle. Preserving this is correct.

None of these constitute violations — they are the plugin's value-add on top of AI Maestro's messaging infrastructure.

---

*End of audit report.*
