# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:57.504Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-AMAMA-changes.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-AMAMA-changes.md
Line 22: The `ai_maestro_address` field in `team-registry.json` IS the agent's AI Maestro session name. Use it directly with the `agent-messaging` skill. No lookup function is needed."
Line 35: Check the ECOS agent session via the `ai-maestro-agents-management` skill or the AI Maestro dashboard."
Line 46: Use the `ai-maestro-agents-management` skill to list all agent sessions and terminate orphaned ones."
Line 57: The message type field at lines ~172–175 says `health_check`, but all other AMAMA files (including `creating-ecos-procedure.md` line ~155 and `ai-maestro-message-templates.md`) use `ping` for the same purpose. This internal inconsistency creates ambiguity.
Line 70: Use the `ai-maestro-agents-management` skill to list all agent sessions and identify the relevant ECOS session."
Line 81: Check the ECOS agent session via the `ai-maestro-agents-management` skill or the AI Maestro dashboard."
Line 94: Use the `ai-maestro-agents-management` skill to prepare the agent working directory and install the required plugin. Note: If directory preparation is not yet exposed by the `ai-maestro-agents-management` skill, perform this step manually following the procedure below." Retain any manual procedure text below but label it clearly as: "**Manual fallback (only if ai-maestro-agents-management skill does not support this operation):**"
Line 95: Check the agent session via the `ai-maestro-agents-management` skill or the AI Maestro dashboard. **Manual fallback:** `tmux attach -t $SESSION_NAME`"
Line 96: Verify plugin installation via the `ai-maestro-agents-management` skill. **Manual fallback:** check the plugin directory directly."
Line 120: Identify pending approvals with `requested_at` timestamps more than 24 hours in the past using the approval tracking state file at `docs_dev/approvals/approval-state.yaml`. If automation is needed, use the `check-approval-expiry.sh` script (see `scripts/` directory)." Do NOT delete the `docs_dev/approvals/approval-state.yaml` file itself or any surrounding skill text — only the inline shell command block is removed.
Line 130: Use the `agent-messaging` skill to query roles for status. Refer to `~/.claude/skills/agent-messaging/SKILL.md` → 'Sending Messages' and 'Inbox' sections."
Line 131: Query each role via AMP messaging — follow the `agent-messaging` skill. Do NOT use raw curl calls or direct API endpoints."
Line 132: Role codes (EAA, EOA, EIA) shown here are illustrative defaults. Discover active roles at runtime using the `ai-maestro-agents-management` skill before generating reports."
Line 144: Communication topology and role permissions are defined by the team governance configuration. Before routing, verify current role relationships by consulting the `team-governance` skill. The routing decision matrix below reflects the default EAMA topology — confirm it remains current before applying." Preserve the routing decision matrix itself (which routes which request type to which role) — that is EAMA's own operational logic.
Line 145: Default naming convention — verify active agents at runtime." Add a note: "Active specialist agents and their current session names are discovered at runtime via the `ai-maestro-agents-management` skill. The prefixes below are the convention, not a fixed registry."
Line 160: If any direct AI Maestro API calls are found: Replace them with equivalent `aimaestro-agent.sh` CLI calls (shell subprocess) or restructure to use the appropriate AI Maestro skill instead.
Line 161: If no direct API calls are found: Document in a comment at the top of the script: "# Verified: no direct AI Maestro API calls — compliant with Plugin Abstraction Principle (2026-02-27)."
Line 175: If any direct AI Maestro API calls are found: Replace them with equivalent `aimaestro-agent.sh` CLI calls or restructure to use the appropriate skill.
Line 176: If no direct API calls are found: Document in a comment at the top: "# Verified: no direct AI Maestro API calls — compliant with Plugin Abstraction Principle (2026-02-27)."
Line 190: To find GitHub items linked by UUID, use `gh issue list` or `gh pr list` with the appropriate `--search` flag containing the UUID reference format. Consult the GitHub CLI documentation or the relevant specialist agent (EIA) for the exact search syntax." Alternatively, if exact syntax is essential for operational clarity, extract it to `scripts/find-by-uuid.sh` and reference the script name only.
Line 202: Agent identity, metadata, and registration are the responsibility of the `ai-maestro-agents-management` skill. This skill maintains LOCAL SESSION STATE for EAMA's operational purposes (spawn tracking, session logs, performance caching), but it is NOT the source of truth for agent identity or registration status. When agent identity data conflicts between local session memory and the `ai-maestro-agents-management` skill, the `ai-maestro-agents-management` skill takes precedence.
Line 216: AI Maestro Request ID**: <governance-request-uuid> (optional — only for governance-scoped operations: agent CRUD, team membership changes, cross-host operations)
Line 217: This field is only populated when EAMA submits a GovernanceRequest via the `team-governance` skill for governance-scoped operations. It is omitted for routine ECOS operational approvals."
Line 230: Follow the `team-governance` skill to submit a GovernanceRequest:
Line 231: Store this UUID in the approval log entry as the `AI Maestro Request ID` field (see record-keeping-formats.md).
```