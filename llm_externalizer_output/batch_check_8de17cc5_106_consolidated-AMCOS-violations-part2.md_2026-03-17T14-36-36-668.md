# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:36.668Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/consolidated-AMCOS-violations-part2.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/consolidated-AMCOS-violations-part2.md
- Line 1: | 1 | `skills/amcos-label-taxonomy/references/op-assign-agent-to-issue.md` | HARDCODED_API | HIGH | Step 5 and Example embed `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `current_issues_add`; must use `ai-maestro-agents-management` skill instead |
- Line 2: | 2 | `skills/amcos-label-taxonomy/references/op-sync-registry-with-labels.md` | HARDCODED_API | HIGH | Steps 1, 2, 4, 5 and Automated Sync Script contain 6+ curl calls to `$AIMAESTRO_API/api/agents/...` and `$AIMAESTRO_API/api/teams/default/agents`; must use `ai-maestro-agents-management` skill |
- Line 3: | 3 | `skills/amcos-label-taxonomy/references/op-terminate-agent-clear-assignments.md` | HARDCODED_API | HIGH | Step 3 and Example embed `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `status: "terminated"`; must use `ai-maestro-agents-management` skill |
- Line 4: | 4 | `skills/amcos-plugin-management/references/remote-plugin-management.md` | HARDCODED_AMP | MEDIUM | Sections 2.2 and 3.2 embed raw AMP message format JSON directly (`{"type": "plugin-install", ...}`, `{"type": "plugin-update", ...}`); must reference the `agent-messaging` skill by name instead |
- Line 5: | 5 | `skills/amcos-skill-management/references/op-configure-pss-integration.md` | LOCAL_REGISTRY | HIGH | Contains `cat ~/.claude/skills-index.json | jq '.skills["skill-name"]'`; must use PSS CLI commands (`/pss-status`, `/pss-suggest`) instead of direct file reads |
- Line 6: | 6 | `skills/amcos-skill-management/references/op-reindex-skills-pss.md` | LOCAL_REGISTRY | HIGH | Contains direct `jq` reads of `~/.claude/skills-index.json`; must use PSS CLI commands instead |
- Line 7: | 7 | `skills/amcos-skill-management/references/pss-integration.md` | LOCAL_REGISTRY | HIGH | Contains direct `jq` reads of `~/.claude/skills-index.json`; must use PSS CLI commands instead |
- Line 8: | 8 | `skills/amcos-skill-management/references/skill-reindexing.md` | LOCAL_REGISTRY | HIGH | Contains direct `jq` reads of `~/.claude/skills-index.json`; must use PSS CLI commands instead |
- Line 9: | 9 | `commands/amcos-request-approval.md` | HARDCODED_API | CRITICAL | Lines 3–4, 23–24: `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` hardcoded in Usage section and workflow steps; must use `team-governance` skill |
- Line 10: | 10 | `commands/amcos-request-approval.md` | HARDCODED_API | CRITICAL | Lines 155–162: HTTP 429 rate limiting details hardcoded (`Retry-After` header, max 10 GovernanceRequests/minute per COS, exponential backoff); implementation details belong in `team-governance` skill |
- Line 11: | 11 | `commands/amcos-request-approval.md` | HARDCODED_GOVERNANCE | MAJOR | Lines 29–40: Full operation-to-approver-to-password approval matrix hardcoded (spawn/terminate/hibernate/wake/install/replace/critical operations); must reference `team-governance` skill |
- Line 12: | 12 | `commands/amcos-request-approval.md` | HARDCODED_AMP | MAJOR | Lines 86–129: Two full GovernanceRequest JSON payload schemas embedded (local and cross-team payloads); must reference `team-governance` skill documentation |
- Line 13: | 13 | `commands/amcos-request-approval.md` | CLI_SYNTAX | MINOR | Line 57: `REQUEST_ID="GR-$(date +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"` — request ID generation via shell commands embedded directly; logic belongs in `team-governance` skill |
- Line 14: | 14 | `commands/amcos-transfer-agent.md` | HARDCODED_API | CRITICAL | Line 29: `POST /api/governance/transfers/` hardcoded in Steps section; uses inconsistent path format vs governance skill (`/api/governance/transfers/` vs `/api/v1/governance/requests`); must use `team-governance` skill |
- Line 15: | 15 | `commands/amcos-transfer-agent.md` | HARDCODED_GOVERNANCE | CRITICAL | Frontmatter lines 4–6: `allowed_agents: [amcos-chief-of-staff, amcos-team-manager]` hardcoded YAML; governance constraints must be resolved dynamically via `team-governance` skill |
- Line 16: | 16 | `agents/amcos-approval-coordinator.md` | HARDCODED_API | MAJOR | Lines 100, 105: `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` hardcoded in workflow steps; must use `team-governance` skill |
- Line 17: | 17 | `agents/amcos-approval-coordinator.md` | HARDCODED_GOVERNANCE | MAJOR | Lines 28–31: Governance constraint table re-declares no-self-approval policy and GovernanceRequest requirements that duplicate the `team-governance` skill |
- Line 18: | 18 | `commands/amcos-validate-skills.md` | CLI_SYNTAX | MAJOR | Lines 16–18, 63: `uv run --with pyyaml python scripts/validate_plugin.py` and `uv run --with pyyaml python scripts/validate_skill.py` embedded in body and `allowed-tools` frontmatter; must use `cpv-validate-plugin` / `cpv-validate-skill` skill references |
- Line 19: | 19 | `commands/amcos-notify-manager.md` | HARDCODED_AMP | MINOR | Lines 136–145: `notification_ack` response JSON format embedded inline (`{"type": "notification_ack", "original_message_id": ..., "acknowledged": true}`); must reference `agent-messaging` skill's acknowledgment format |
- Line 20: | 20 | `commands/amcos-notify-manager.md` | HARDCODED_API | MINOR | Lines 184–188: Message queue outbox path `~/.aimaestro/outbox/` and retry parameters (every 5 minutes, 24-hour expiry) hardcoded; implementation details belong in `agent-messaging` skill |
- Line 21: | 21 | `agents/amcos-chief-of-staff-main-agent.md` | HARDCODED_API | MINOR | Line 58 (approx.): `GET /api/teams` referenced directly for recipient validation; must use `team-governance` skill |
- Line 22: | 22 | `agents/amcos-team-coordinator.md` | HARDCODED_API | MINOR | Key constraints table: `GET /api/teams/{id}/agents` hardcoded as the way to get team state; must use `team-governance` skill |
- Line 23: | 23 | `agents/amcos-plugin-configurator.md` | HARDCODED_GOVERNANCE | MINOR | Lines 57–68: GovernanceRequest JSON format for remote config operations (`{"type": "configure-agent", "target": ..., "operation": ...}`) embedded inline; must reference `team-governance` skill |
- Line 24: | 24 | `commands/amcos-check