# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:23.748Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:1: # Plugin Governance Audit: ai-maestro-chief-of-staff
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:21: Replace both examples with the `ai-maestro-agents-management` skill (for agent status queries) and `amp-send.sh` (for sending messages). Remove the raw `curl` calls entirely.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:28: **Required fix:** Replace with a reference to the `ai-maestro-agents-management` skill for status queries.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:41: **Required fix:** Replace both `curl` blocks with `amp-send.sh` invocations following the template in `skills/amcos-pre-op-notification/references/ai-maestro-message-templates.md`.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:59: **Required fix:** The SKILL.md should reference the global `team-governance` skill by name for governance request procedures. The procedural instructions ("Submit GovernanceRequest") should describe the operation, not the raw HTTP verb and path. Detailed API syntax (if needed at all) belongs only in `references/` subdocuments.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:68: **Required fix:** Replace with: "Submit a TransferRequest using the `team-governance` skill's transfer procedure."
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:80: **Required fix:** Replace with "Validate recipients using the `team-governance` skill" or "use `aimaestro-agent.sh` to list team members."
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:91: **Required fix:** Replace with references to the `team-governance` skill or `aimaestro-agent.sh` commands.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:100: **Required fix:** Replace with a reference to `aimaestro-agent.sh delete` or the `ai-maestro-agents-management` skill.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:144: **Required fix:** Replace the direct urllib call with: `subprocess.run(["aimaestro-agent.sh", "list", "--status", "active", "--json"], ...)` and parse the output.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:155: **Required fix:** Replace with `aimaestro-agent.sh show <agent_name>` to get agent details without a raw API call.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:169: **Required fix:** The team registry operations should be delegated to `aimaestro-agent.sh` subcommands (if they exist) or the team registry management script should be moved into the AI Maestro core and called via the global CLI. If `aimaestro-agent.sh` does not yet support team roster operations, this is a gap in the global scripts that should be filed as an AI Maestro issue. Until resolved, the team registry script is an acceptable interim solution, but it should be clearly marked as `TODO: migrate to aimaestro-agent.sh team subcommands`.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:172: **Note:** The script already has a comment stub: `# TODO: Migrate to AI Maestro REST API` in `amcos_hibernate_agent.py`, `amcos_spawn_agent.py`, `amcos_wake_agent.py`, and `amcos_terminate_agent.py` — suggesting awareness of this issue but not yet addressed in `amcos_team_registry.py`.
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:182: **Required fix:** Delegate to `aimaestro-agent.sh` or capture output of a team-listing global script.
/Users/emanuelesabetta/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:209: - External skills: `ai-maestro-agents-management` and `agent-messaging` (provided by AI Maestro core)
/Users/emanuelesabetta/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:212: `plugin.json` has a description field: "Per-team agent management - staff planning, lifecycle, governance workflows, failure recovery. Requires AI Maestro v0.26.0+."
/Users/emanuelesabetta/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:220:   // Missing: "requiredSkills": ["ai-maestro-agents-management", "agent-messaging", "team-governance"]
/Users/emanuelesabetta/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:223: **Required fix:** Add a `requiredSkills` array to `plugin.json` listing at minimum: `["ai-maestro-agents-management", "agent-messaging", "team-governance"]`.
/Users/emanuelesabetta/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:234: This would fail on non-default port configurations. **Required fix:** Replace `http://localhost:23000` with `$AIMAESTRO_API` and replace the `curl` with the `ai-maestro-agents-management` skill.
/Users/emanuelesabetta/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:252: - Replace with: "Use the `ai-maestro-agents-management` skill to query agent status."
/Users/emanuelesabetta/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:255: - Replace with: "Use `amp-send.sh` to send the health check ping (see `amcos-pre-op-notification` skill for message format)."
/Users/emanuelesabetta/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:260: - Replace with: "Use the `ai-maestro-agents-management` skill to verify agent status."
/Users/emanuelesabetta/docs_dev/plugin-governance-audit-chief-of-staff-2026-03-10.md:286: - Replace with `amp-send.sh` invocations:
/Users/emanuelesabetta/docs_dev/plugin-gover