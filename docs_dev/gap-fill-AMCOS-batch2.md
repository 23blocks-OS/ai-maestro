# Plugin Abstraction Principle Audit — AMCOS Batch 2

**Auditor:** Claude Code (automated audit)
**Date:** 2026-02-27
**Reference Standard:** `/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
**Plugin Root:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/`

---

## Summary

| File | Violations Found | Severity |
|------|-----------------|----------|
| `skills/amcos-onboarding/references/op-conduct-project-handoff.md` | 2 | LOW / MEDIUM |
| `skills/amcos-onboarding/references/op-deliver-role-briefing.md` | 1 | LOW |
| `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md` | 1 | LOW |
| `skills/amcos-plugin-management/references/op-restart-agent-plugin.md` | 1 | LOW |

**Total violations: 5**

No `HARDCODED_API` (curl with raw endpoints), no `HARDCODED_AMP` (wire format envelopes), no `LOCAL_REGISTRY` (direct reads of internal AI Maestro registry files), and no `REDUNDANT_OPERATIONS` violations were found across all four files. All AMP messaging is routed through the `agent-messaging` skill reference, and agent lifecycle operations reference the `ai-maestro-agents-management` skill. The plugin's own internal registry (`amcos_team_registry.py`) is a PLUGIN-INTERNAL tracking system and is correctly preserved per the Harmonization Rule.

---

## File 1: `skills/amcos-onboarding/references/op-conduct-project-handoff.md`

**Full path:** `skills/amcos-onboarding/references/op-conduct-project-handoff.md`

### Violation 1 — CLI_SYNTAX (MEDIUM)

- **Lines:** 110–115 (Step 6: Log Handoff) and lines 182–188 (Example: Complete Onboarding)
- **Type:** `CLI_SYNTAX`
- **Severity:** MEDIUM
- **Evidence:**
  ```bash
  uv run python scripts/amcos_team_registry.py log \
    --event "project-handoff" \
    --agent "<agent-session-name>" \
    --reason "Handoff for <project> - <role>" \
    --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ```
- **Issue:** The CLI syntax for `amcos_team_registry.py` is hardcoded inline. If the script's argument interface changes (e.g., flag rename, positional args, subcommand restructuring), this file must be manually updated. It also locks the `uv run python` invocation pattern into the document.
- **What needs to change:** Replace the hardcoded invocation with a reference to the canonical script interface. Either: (a) document that the script is invoked via a wrapper command (if one exists), or (b) add a note that callers should refer to `scripts/amcos_team_registry.py --help` for current syntax. If a `amcos-registry` wrapper script is ever added to `~/.local/bin/`, this should defer to it. As a minimum fix, add an inline note:
  ```
  # Refer to scripts/amcos_team_registry.py --help for current argument syntax.
  ```
- **Harmonization Note:** The `amcos_team_registry.py log` call IS the plugin's internal approval/recording system. It must NOT be removed. Only the hardcoded CLI syntax pattern needs to be softened so it degrades gracefully if flags change.

---

### Violation 2 — LOCAL_REGISTRY (LOW)

- **Lines:** 151 (Example: Emergency Mid-Project Handoff, Step 1)
- **Type:** `LOCAL_REGISTRY`
- **Severity:** LOW
- **Evidence:**
  ```
  "Please save your current state to ~/.ai-maestro/agent-states/[agent-name]-emergency.json immediately."
  ```
- **Issue:** This hardcodes a specific internal file path under `~/.ai-maestro/agent-states/` as the emergency state dump location. This path is not defined by any AI Maestro API or skill abstraction — it is an assumed internal convention. If AI Maestro changes its data storage layout (e.g., moves to `~/.aimaestro/` without hyphen, as is the current actual layout per CLAUDE.md), this path silently breaks.
- **Note from CLAUDE.md:** The current AI Maestro data directory is `~/.aimaestro/` (no hyphen), while the path used here is `~/.ai-maestro/` (with hyphen). This is already diverged from the actual layout.
- **What needs to change:** Replace the hardcoded path with an instruction to use the `ai-maestro-agents-management` skill to request a state dump, or let the outgoing agent decide where to save state and reply with the location. Alternatively, keep a path but use a variable: `~/${AIMAESTRO_STATE_DIR}/agent-states/[agent-name]-emergency.json` and define `AIMAESTRO_STATE_DIR` in prerequisites.

---

## File 2: `skills/amcos-onboarding/references/op-deliver-role-briefing.md`

**Full path:** `skills/amcos-onboarding/references/op-deliver-role-briefing.md`

### Violation 1 — CLI_SYNTAX (LOW)

- **Lines:** 96–105 (Step 6: Log Role Assignment)
- **Type:** `CLI_SYNTAX`
- **Severity:** LOW
- **Evidence:**
  ```bash
  uv run python scripts/amcos_team_registry.py update-role \
    --name "<agent-session-name>" \
    --role "<role-name>" \
    --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  uv run python scripts/amcos_team_registry.py log \
    --event "role-briefing" \
    --agent "<agent-session-name>" \
    --reason "Assigned as <role> on <project>" \
    --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ```
- **Issue:** Same pattern as File 1 Violation 1. Both the `update-role` and `log` subcommand signatures are hardcoded inline. The `update-role` subcommand is distinct from `log` and its argument set (`--name` vs `--agent`) already shows inconsistency within the same script, which is a signal this interface is not yet stable.
- **What needs to change:** Add inline reference to `--help` for current syntax, or document that these commands are the plugin's internal registry calls and flag syntax may evolve. The calls themselves must be preserved (Harmonization Rule). Consider making a wrapper shell alias (e.g., `amcos-registry-log`) so the invocation pattern in documents is stable even if the underlying Python args change.

---

## File 3: `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md`

**Full path:** `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md`

### Violation 1 — CLI_SYNTAX (LOW)

- **Lines:** 111–115 (Step 5: Document Onboarding) and lines 183–188 (Example: Complete Onboarding)
- **Type:** `CLI_SYNTAX`
- **Severity:** LOW
- **Evidence:**
  ```bash
  uv run python scripts/amcos_team_registry.py log \
    --event "onboarding-complete" \
    --agent "<agent-session-name>" \
    --reason "Initial onboarding for [role] on [project]" \
    --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ```
- **Issue:** Same `CLI_SYNTAX` pattern as Files 1 and 2. The `amcos_team_registry.py log` invocation syntax is hardcoded.
- **What needs to change:** Same remedy as Files 1 and 2. Add `--help` deferral note. Calls must be preserved (Harmonization Rule).

---

## File 4: `skills/amcos-plugin-management/references/op-restart-agent-plugin.md`

**Full path:** `skills/amcos-plugin-management/references/op-restart-agent-plugin.md`

### Violation 1 — CLI_SYNTAX (LOW)

- **Lines:** 87–91 (Step 5: Update Registry Status)
- **Type:** `CLI_SYNTAX`
- **Severity:** LOW
- **Evidence:**
  ```bash
  uv run python scripts/amcos_team_registry.py log \
    --event "restart" \
    --agent "<agent-session-name>" \
    --reason "Plugin changes applied" \
    --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ```
- **Issue:** Same `CLI_SYNTAX` pattern. The `amcos_team_registry.py log` invocation is hardcoded.
- **What needs to change:** Same remedy as above files.

---

## What is NOT a violation (confirmed clean)

The following patterns were reviewed and found to be compliant:

1. **All AMP messaging** in all 4 files routes through `Use the \`agent-messaging\` skill to send` — no raw `curl` to AMP endpoints, no wire format envelopes embedded. COMPLIANT.

2. **All agent lifecycle operations** in `op-restart-agent-plugin.md` reference `Use the \`ai-maestro-agents-management\` skill` — no direct API calls, no hardcoded endpoints. COMPLIANT.

3. **`amcos_team_registry.py` calls** are the plugin's own internal tracking system. Per the Harmonization Rule, these must be PRESERVED. They are not reading AI Maestro's internal registry — they are writing to the plugin's own registry. PRESERVED (not a removal target).

4. **`uv run --with pyyaml python scripts/validate_plugin.py`** in `op-conduct-project-handoff.md` line 82 is the plugin's own validator script, not an AI Maestro internal. COMPLIANT.

5. **`git log --oneline -10`** in `op-conduct-project-handoff.md` lines 53–65 is standard git, not an AI Maestro API call. COMPLIANT.

6. **`ls /path/to/plugin/docs/roles/`** and `cat /path/to/plugin/docs/roles/<role-name>.md` in `op-deliver-role-briefing.md` lines 53–57 use placeholder paths, not hardcoded internal AI Maestro paths. COMPLIANT.

7. **No hardcoded governance rules** (role restriction matrices, permission tables) were found in any of the 4 files. COMPLIANT.

8. **No hardcoded HTTP headers or endpoint URLs** were found in any of the 4 files. COMPLIANT.

---

## Consolidated Remediation Plan

All 5 violations share the same root fix: **stabilize the `amcos_team_registry.py` CLI syntax contract**.

### Recommended approach (in order of preference):

**Option A — Create a stable wrapper script (best)**

Create `scripts/amcos-registry.sh` (or add to `~/.local/bin/amcos-registry` as part of plugin install) that wraps the Python calls. Then all operation docs reference the wrapper:

```bash
amcos-registry log --event "onboarding-complete" --agent "<name>" --reason "<reason>"
```

This isolates all documents from Python arg changes and the `uv run` invocation pattern.

**Option B — Add `--help` deferral notes (minimal, immediate)**

Add this comment block above every `amcos_team_registry.py` invocation in all 4 files:

```bash
# Syntax reference: uv run python scripts/amcos_team_registry.py --help
# The following invocation reflects the current argument interface:
```

**Option C — Fix the diverged path in File 1 (urgent for correctness)**

In `op-conduct-project-handoff.md` line 151, replace `~/.ai-maestro/agent-states/` with `~/.aimaestro/agent-states/` to match the actual AI Maestro data directory convention, OR replace the hardcoded path entirely with an instruction to let the agent choose its state dump location and reply with it.

---

## Files Requiring Changes

| File (relative to plugin root) | Lines | Change Required |
|-------------------------------|-------|----------------|
| `skills/amcos-onboarding/references/op-conduct-project-handoff.md` | 110–115, 151, 182–188 | Option B + Option C |
| `skills/amcos-onboarding/references/op-deliver-role-briefing.md` | 96–105 | Option B |
| `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md` | 111–115, 183–188 | Option B |
| `skills/amcos-plugin-management/references/op-restart-agent-plugin.md` | 87–91 | Option B |

---

*End of audit report.*
