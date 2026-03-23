# Plugin Abstraction Principle Audit — AMCOS Batch 7 (Gap-Fill Spot-Checks)

**Audit Date:** 2026-02-27
**Reference Standard:** `/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
**Scope:** 4 reference files that previously showed no grep hits for violation patterns.

---

## Violation Type Definitions

| ID | Type | Description |
|----|------|-------------|
| HARDCODED_API | Hardcoded API calls | Direct `curl`/`fetch` to `localhost:23000` or any AI Maestro endpoint |
| HARDCODED_GOVERNANCE | Hardcoded governance rules | Permission matrices, role restrictions, or governance rules embedded in plugin files |
| HARDCODED_AMP | Hardcoded AMP syntax | Direct `curl` to AMP endpoints instead of using `amp-*.sh` scripts |
| LOCAL_REGISTRY | Local registry access | Direct file reads of `~/.aimaestro/` or `~/.agent-messaging/` instead of using APIs/scripts |
| CLI_SYNTAX | Embedded CLI syntax | Embedding specific `aimaestro-agent.sh` flag syntax instead of delegating to the global skill |
| REDUNDANT_OPERATIONS | Redundant operations | Duplicating operations already covered by a global skill, causing divergence risk |

---

## File 1: performance-metrics.md

**Path:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/amcos-performance-tracking/references/performance-metrics.md`

**Lines reviewed:** 1–565

### Findings

No violations found.

**Detailed assessment:**

- **HARDCODED_API:** No `curl`, `fetch`, `http://localhost:23000`, or any HTTP endpoint calls present. The file is a conceptual reference describing metric categories, calculations, and thresholds. CLEAN.
- **HARDCODED_GOVERNANCE:** No role-permission matrices or governance rules. References to "agent" are generic. CLEAN.
- **HARDCODED_AMP:** No AMP references of any kind — no `amp-*.sh` calls or AMP endpoint URLs. CLEAN.
- **LOCAL_REGISTRY:** No direct filesystem references to `~/.aimaestro/` or `~/.agent-messaging/`. Data storage examples use relative paths like `design/memory/performance/` which are project-relative, not AI Maestro internal paths. CLEAN.
- **CLI_SYNTAX:** No `aimaestro-agent.sh` calls or CLI flags. CLEAN.
- **REDUNDANT_OPERATIONS:** File covers performance metric definitions and calculations — a domain entirely outside what any AI Maestro global skill covers. No duplication risk. CLEAN.

### Verdict: **CLEAN**

---

## File 2: onboarding-checklist.md

**Path:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/amcos-onboarding/references/onboarding-checklist.md`

**Lines reviewed:** 1–466

### Findings

No violations found.

**Detailed assessment:**

- **HARDCODED_API:** No `curl`, `fetch`, or HTTP endpoint calls. CLEAN.
- **HARDCODED_GOVERNANCE:** The checklist references "Chief of Staff role", "orchestrator role", and "reporting structure" as things to explain during onboarding, but does not hardcode permission matrices or role restriction rules. These are onboarding *topics*, not governance rule definitions. CLEAN.
- **HARDCODED_AMP:** Section 3.1 ("Verify AI Maestro connectivity") and 3.4 ("Test bidirectional messaging") refer to AI Maestro messaging conceptually, without embedding AMP API syntax, endpoint URLs, or direct `curl` calls. The references are process descriptions only. CLEAN.
- **LOCAL_REGISTRY:** Onboarding records are stored at `design/memory/onboarding/[session-name]-[date].md` — a project-relative path, not an AI Maestro internal path. CLEAN.
- **CLI_SYNTAX:** No CLI commands or script invocations of any kind. CLEAN.
- **REDUNDANT_OPERATIONS:** The onboarding checklist is a process template for Chief of Staff agent behavior. It does not duplicate any AI Maestro global skill content. CLEAN.

### Verdict: **CLEAN**

---

## File 3: op-handle-blocked-agent.md

**Path:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/amcos-label-taxonomy/references/op-handle-blocked-agent.md`

**Lines reviewed:** 1–131

### Findings

**CLEAN — with one observation noted below.**

**Detailed assessment:**

- **HARDCODED_API:** No `curl` calls to AI Maestro endpoints (`localhost:23000` or otherwise). CLEAN.
- **HARDCODED_GOVERNANCE:** No permission matrices or role restriction rules embedded. The escalation routing table (Step 3, lines 59–64) maps blocker *types* to *actions* (e.g., "Missing credentials → Escalate to human"), which is operational workflow logic, not governance permission rules. CLEAN.
- **HARDCODED_AMP:** Step 5 (lines 73–79) uses natural language to instruct the agent to use the `agent-messaging` skill:
  ```
  Use the `agent-messaging` skill to send:
  - Recipient: eama-main
  - Subject: ...
  - Priority: high
  - Content: type blocker-escalation, ...
  ```
  This correctly references the global `agent-messaging` skill by name and describes WHAT to send, not HOW to call AMP. **No raw `amp-*.sh` call or AMP endpoint URL is embedded.** CLEAN.
- **LOCAL_REGISTRY:** No direct filesystem reads of AI Maestro internal paths. CLEAN.
- **CLI_SYNTAX:** The file uses `gh` CLI commands (GitHub CLI) for issue management — lines 48, 54, 70, 83–84, 94–95, 100, 103, 112–118. These are GitHub CLI calls (`gh issue edit`, `gh issue comment`, `gh issue view`), not AI Maestro CLI calls. The Plugin Abstraction Principle governs AI Maestro API calls and AMP messaging; `gh` CLI usage for GitHub issue management is outside its scope. CLEAN under PAP rules.
- **REDUNDANT_OPERATIONS:** No duplication of AI Maestro global skill content. CLEAN.

**Observation (not a violation):** The hardcoded recipient `eama-main` in Step 5 is a specific agent name. This is an operational decision by the plugin (who to notify about a blocked agent), not an API syntax violation. It is consistent with PAP: the *address* is plugin-specific business logic, while the *mechanism* (using the `agent-messaging` skill) is correctly delegated. If `eama-main` ever changes name, this file would need updating — but that is a maintenance concern, not a PAP violation.

### Verdict: **CLEAN**

---

## File 4: op-generate-agent-prompt-xml.md

**Path:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/amcos-skill-management/references/op-generate-agent-prompt-xml.md`

**Lines reviewed:** 1–226

### Findings

No violations found.

**Detailed assessment:**

- **HARDCODED_API:** No `curl`, `fetch`, or AI Maestro HTTP endpoint calls. CLEAN.
- **HARDCODED_GOVERNANCE:** No permission matrices or role restriction rules. CLEAN.
- **HARDCODED_AMP:** No AMP references of any kind. CLEAN.
- **LOCAL_REGISTRY:** The file uses `/path/to/...` placeholder paths throughout (lines 53, 56, 62, 84, 127–130, 147–148, 154, 178–180, 196, 205). These are template placeholders, not hardcoded paths to `~/.aimaestro/` or `~/.agent-messaging/`. Line 148 uses `PLUGIN_SKILLS="/path/to/ai-maestro-chief-of-staff/skills"` which is a variable placeholder, not a hardcoded production path. CLEAN.
- **CLI_SYNTAX:** The `skills-ref to-prompt` CLI is a third-party tool (`pip install skills-ref`) used for XML generation — not an AI Maestro internal CLI. PAP governs `aimaestro-agent.sh` and `amp-*.sh` wrappers. `skills-ref` is infrastructure tooling outside PAP scope. CLEAN.
- **REDUNDANT_OPERATIONS:** This file teaches how to generate `<available_skills>` XML for agent system prompts using the `skills-ref` tool. This is a AMCOS-specific workflow not covered by any AI Maestro global skill (`team-governance`, `ai-maestro-agents-management`, or `agent-messaging`). No duplication. CLEAN.

**Note on the Python example (lines 172–189):** A programmatic Python example using `from skills_ref import to_prompt` is provided. This is code generation tooling, not a script used to edit files or bypass abstractions — it generates XML output that a human/agent integrates into prompts. This does not violate PAP.

### Verdict: **CLEAN**

---

## Summary

| File | HARDCODED_API | HARDCODED_GOVERNANCE | HARDCODED_AMP | LOCAL_REGISTRY | CLI_SYNTAX | REDUNDANT_OPERATIONS | Verdict |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| performance-metrics.md | — | — | — | — | — | — | **CLEAN** |
| onboarding-checklist.md | — | — | — | — | — | — | **CLEAN** |
| op-handle-blocked-agent.md | — | — | — | — | — | — | **CLEAN** |
| op-generate-agent-prompt-xml.md | — | — | — | — | — | — | **CLEAN** |

All 4 files are confirmed clean. The earlier grep finding of no violation patterns is verified as accurate. No remediation is required for any of these files.

---

**Auditor:** Claude Code (claude-sonnet-4-6)
**Method:** Full file read + line-by-line analysis against all 6 PAP violation types
