# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:03.274Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/deep-audit-AMCOS-comms-recovery-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/deep-audit-AMCOS-comms-recovery-2026-02-27.md
Line 10: | ai-maestro-local-marketplace | 5 | 13 |
Line 10: | LOCAL_REGISTRY | 5 | 13 |
Line 19: - **LOCAL_REGISTRY**: Direct file reads/writes of internal registries (task-tracking.json, recovery-log.json, roster markdown) bypassing skill abstractions
Line 29: ### 2. `ai-maestro-message-templates.md`
Line 104: | §1.2 AI Maestro Unavailable | Direct bash log write | `echo "$(date -Iseconds) | AIMAESTRO_UNAVAILABLE | AI Maestro unreachable" >> .claude/logs/maestro-failures.log` |
Line 106: > **Note**: This offline fallback is ONLY for when AI Maestro is completely unreachable. Under normal conditions, always use the agent-messaging skill`. The fallback behaviour is architecturally intentional but the bash implementation bypasses skill abstraction.
Line 110: | §1.2 Failure Log | `echo "... AIMAESTRO_UNAVAILABLE ..." >> .claude/logs/maestro-failures.log` — operational log must be preserved |
Line 124: | §4.3.1 Error Details Template | Full JSON error capture object with `error_code`, `error_message`, `operation`, `target_agent`, `stack_trace`, `operation_context` embedded as a hardcoded JSON template |
Line 126: | §4.3.2 Message Template | Full JSON message envelope with `to`, `subject`, `priority`, `content` keys embedded as a template at §4.3.2 |
Line 127: | §4.4 Standard Format | Full AMP envelope structure embedded at §4.4 including all optional fields |
Line 129: **Note:** The file does include the `> **Note**: Use the agent-messaging skill...` disclaimer before §4.4. However, the JSON structures themselves still constitute HARDCODED_AMP because they embed the full envelope schema which couples reference files to AMP protocol internals.
Line 132: | HARDCODED_API — 1 instance |
Line 134: | §4.3.1 Capture Implementation | Bash function `capture_error()` with `$()` command substitution — directly embeds bash script logic |
Line 136: | HARDCODED_API — 1 instance (log path) |
Line 140: | §4.3.5 Failure Log | Failure log entry schema with `timestamp`, `event_type`, `operation`, `target_agent`, `error`, `notification_sent`, `recovery_action_planned`, `retry_scheduled` — must be preserved |
Line 144: ### 6. `message-response-decision-tree.md`
Line 148: ### 7. `op-acknowledgment-protocol.md`
Line 152: ### 8. `op-failure-notification.md`
Line 156: ### 9. `op-post-operation-notification.md`
Line 160: ### 10. `op-pre-operation-notification.md`
Line 164: ### 11. `post-operation-notifications.md`
Line 172: ### 12. `pre-operation-notifications.md`
Line 176: ### 13. `proactive-handoff-protocol.md`
Line 180: | HARDCODED_API — 3 instances |
Line 182: | §8.3 UUID Registry | Direct bash jq read | `cat docs_dev/.uuid-registry.json | jq '.designs | keys'` |
Line 184: | §UUID Lookup | Direct Python script call | `python scripts/amcos_design_search.py --keyword "feature-name" --json` |
Line 186: | §Handoff Location | Hardcoded relative path | Write handoffs to: `$CLAUDE_PROJECT_DIR/docs_dev/handoffs/` — direct path coupling |
Line 188: | LOCAL_REGISTRY — 2 instances |
Line 190: | §8.3 UUID Registry Location | Registry at `$CLAUDE_PROJECT_DIR/docs_dev/.uuid-registry.json` — direct path reference with example JSON structure showing how to read it |
Line 192: | §Pre-Handoff Search | `amcos_design_search.py` called directly, bypassing skill abstraction |
Line 194: | RECORD_KEEPING — PRESERVE — 2 instances |
Line 196: | §8 UUID Registry | UUID registry format and UUID propagation rules — the UUID chain concept is a core design pattern and must be preserved |
Line 198: | §Handoff Document | Mandatory handoff YAML frontmatter schema (`uuid`, `from`, `to`, `timestamp`, `priority`, `requires_ack`, sections) — must be preserved |
Line 200: ### 14. `task-completion-checklist.md`
Line 204: ## SKILL CATEGORY 2: amcos-failure-recovery (14 files)
Line 206: ### 15. `agent-replacement-protocol.md`
Line 210: | HARDCODED_GOVERNANCE — 4 instances |
Line 212: | Phase 2 | "Request Manager Approval" from `eama-assistant-manager` — hardcoded approval requirement |
Line 214: | Phase 2 | "Wait for approval (max 15 minutes)" — hardcoded timeout for governance workflow |
Line 216: | Phase 2 | "CRITICAL: Never proceed with replacement without manager approval" — absolute rule embedded in reference |
Line 218: | Phase 5 Handoff | "CRITICAL: The replacement agent has NO MEMORY of the old agent" — architectural constraint hardcoded as rule |
Line 220: | HARDCODED_AMP — 3 instances |
Line 222: | Phase 1 | JSON envelope to `eoa-orchestrator` with `type: replacement-request` fields hardcoded |
Line 224: | Phase 2 | JSON envelope to `eama-assistant-manager` with approval-request content structure |
Line 226: | Phase 5 | JSON envelope to new agent with handoff content fields hardcoded |
Line 228: **Note on HARDCODED_GOVERNANCE:** The approval requirement for agent replacement is a meaningful governance boundary. If it must be preserved, it should be expressed as a reference to the governance skill's approval workflow rather than an absolute `CRITICAL: Never` inline rule.
Line 231: ### 16. `examples.md`
Line 235: | HARDCODED_AMP — 2 instances |
Line 237: | Example 1 | Full JSON emergency handoff envelope with hardcoded agent names (e.g., `libs-svg-svgbbox`) embedded as example |
Line 239: | Example 2 | Full JSON replacement request with hardcoded agent name and task details |
Line 241: **Note:** Examples with hardcoded agent names (`libs-svg-svgbbox`) are particularly harmful — they embed specific project topology into reference documentation.
Line 243: ### 17. `failure-classification.md`
Line 247: ### 18. `failure-detection.md`
Line 251: ### 19. `op-classify-failure-severity.md`
Line 255: ### 20. `op-detect-agent-failure.md`
Line 259: ### 21. `op-emergency-handoff.md`
Line 263: | HARDCODED_API — 3 instances |
Line 265: | Step 1 bash block | Direct jq read of internal task tracking file | `cat $CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json \| jq '.tasks[] \| select(.agent == "FAILED_AGENT")'` |
Line 267: | Step 3 bash block | Direct mkdir for handoff directory | `mkdir -p $CLAUDE_PROJECT_DIR/thoughts/shared/handoffs/emergency/` |
Line 269: | Step 3 path | Hardcoded handoff directory path | `$CLAUDE_PROJECT_DIR/thoughts/shared/handoffs/emergency/` |
Line 271: | HARDCODED_AMP — 2 instances |
Line 273: | Step 2 Notify