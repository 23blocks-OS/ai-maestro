# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:57.952Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-AMCOS-changes.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-AMCOS-changes.md
Line 140: - **File:** `commands/amcos-check-approval-status.md`
Line 141: - **Lines:** 140–145
Line 142: - **Priority:** P2
Line 143: - **Depends on:** None
Line 144: - **Current:** Hardcodes approval storage paths: `~/.aimaestro/approvals/pending/`, `/approved/`, `/rejected/`, `/expired/` for approval status query.
Line 145: - **Change:** Replace filesystem path references with "Use the `team-governance` skill to query GovernanceRequest status by request ID." The AMCOS-internal `approval-state.yaml` lookup (for AMCOS-local fields like escalation_count) may remain alongside the skill call.
Line 146: - **Verify:** No `~/.aimaestro/approvals/` path references remain in this file.
Line 147: - **Harmonization note:** The status value table (7 states: pending/approved/rejected/deferred/expired/completed/cancelled) is a PRESERVE item. Keep the table; only remove the directory path references.
Line 187: - **Current:** Lines 137–145 embed a `notification_ack` JSON response format without an `agent-messaging` skill disclaimer. Lines 187–189 hardcode `~/.aimaestro/outbox/` path, 5-minute retry interval, and 24-hour expiry.
Line 188: - **Change:** Add an `agent-messaging` skill reference before the ACK format (or move the format into the `agent-messaging` skill docs and reference it here). Replace outbox path and retry/expiry values with a reference to the `agent-messaging` skill's outbox/retry behavior documentation.
Line 189: - **Verify:** No raw outbox path or retry interval values remain without a skill reference. The 8 notification types taxonomy and rate-limiting rules (PRESERVE items) are not removed.
Line 461: - **Current:** Four different paths exist for hibernation state storage across four files: `design/memory/agents/<agent-id>/hibernate/` (hibernation-procedures.md), `~/.ai-maestro/agent-states/` (op-hibernate-agent.md), `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json` (success-criteria.md), `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/` (workflow-checklists.md). Note: `.ai-maestro/` (with hyphen) vs `.aimaestro/` (no hyphen) is also inconsistent.
Line 462: - **Change:** Choose one canonical hibernation storage path (consult AI Maestro documentation for the correct base directory — likely `~/.aimaestro/` without hyphen based on main project convention). Update all four files to use this single path. Document as a PRESERVE item with a canonical location comment.
Line 463: - **Verify:** Search for `agent-states`, `hibernated-agents`, `hibernate/` path suffixes; all should resolve to the same canonical directory.
Line 464: - **Harmonization note:** The hibernation state itself is a PRESERVE item. The goal is path harmonization, not removal.
Line 468: - **Current:** `~/.ai-maestro/agent-states/[agent-name]-emergency.json` uses `~/.ai-maestro/` (with hyphen) which is inconsistent with the main project convention of `~/.aimaestro/` (no hyphen).
Line 469: - **Change:** Correct to `~/.aimaestro/agent-states/` — or replace entirely with an `ai-maestro-agents-management` skill state-dump request reference.
Line 470: - **Verify:** No `~/.ai-maestro/` (with hyphen) paths remain in this file.
Line 471: - **Harmonization note:** None.
Line 475: - **Files:** `skills/amcos-agent-lifecycle/references/success-criteria.md` (lines 47, 72, 132, 156–159, 223–226), `skills/amcos-agent-lifecycle/references/workflow-checklists.md` (lines with curl for verify-after-create, before-update, pre-update snapshot), `skills/amcos-agent-lifecycle/references/op-hibernate-agent.md` (error handling table), `skills/amcos-agent-lifecycle/references/op-spawn-agent.md` (prerequisites), `skills/amcos-agent-lifecycle/references/op-update-team-registry.md` (prerequisites + step 5)
Line 476: - **Lines:** As noted above
Line 477: - **Priority:** P3
Line 478: - **Depends on:** None
Line 479: - **Current:** Multiple files use `curl "$AIMAESTRO_API/api/..."` for verification steps after lifecycle operations. All use `$AIMAESTRO_API` env var correctly, but still embed raw curl in agent-facing procedures.
Line 480: - **Change:** Replace each raw `curl "$AIMAESTRO_API/api/..."` verification call with "Use the `ai-maestro-agents-management` skill health-check or show-agent operation to verify."
Line 481: - **Verify:** No raw `curl "$AIMAESTRO_API` patterns remain in lifecycle reference files.
Line 482: - **Harmonization note:** The verification steps themselves should be preserved — only the curl mechanism changes.
Line 508: - **Current:** Lines 136–146 contain macOS-specific bash: `top -l 1 | grep ...`, `vm_stat | grep ...`, `df -h /` — platform-specific implementation embedded in the skill entry point. Lines 200–201 and 214 hardcode session limits (conservative 10, normal 15, max 20) and alert type enumeration.
Line 509: - **Change:** Replace bash block with prose deferring to `references/op-check-system-resources.md` for current resource-check commands. For session limits: replace hardcoded numbers with "Compare against limits defined in AI Maestro instance monitoring settings — discoverable at runtime."
Line 510: - **Verify:** No `top -l 1`, `vm_stat`, `df -h` commands remain in the SKILL.md entry point. Session limit numbers are presented as examples, not definitive constraints.
Line 511: - **Harmonization note:** None.
Line 515: - **Current:** `ps aux | grep ai-maestro` fallback in Section 7.2 Step 4 as a system health check bypass when the API is unavailable.
Line 516: - **Change:** Replace `ps aux | grep` with documentation reference: "If AI Maestro API is unreachable, refer to the `ai-maestro-agents-management` skill's offline-check guidance, or consult the OPERATIONS-GUIDE."
Line 517: - **Verify:** No `ps aux | grep` remains in this file.
Line 518: - **Harmonization note:** None.
Line 522: - **Current:** Two raw AMP message format JSON blocks embedded: `"type": "plugin-install"` and `"type": "plugin-update"`.
Line 523: - **Change:** Replace with references to the `agent-messaging` skill for plugin operation message format.
Line 524: - **Verify:** No JSON message format blocks with `"type": "plugin-install"` or `"type": "plugin-update"` remain as inline schemas.
Line 525: - **Harmonization note:** None.
Line 529: - **Current:** `~/.ai-maestro/agent-states/[agent-name]-emergency.json` uses `~/.ai-maestro/` with hyphen.
Line 530: - **Change:** Already covered by TODO-C15. Mark as resolved when TODO-C15 is done.
Line 531: - **Verify:** See TODO-C15.
Line 532: - **Harmonization note:** See TODO-C14.
Line 536: - **File:** Global skill — not in AMCOS plugin root (this is an upstream dependency)
Line 537: - **Lines:** N/