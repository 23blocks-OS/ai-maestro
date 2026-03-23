# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:32.344Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/consolidated-AMCOS-violations-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/consolidated-AMCOS-violations-2026-02-27.md
Line 18: 13. `verify-AMCOS-comms-recovery.md` — Verification of comms/recovery audit (found additional violations in `ai-maestro-message-templates.md`)
Line 189: Replace with `ai-maestro-agents-management` skill reference for team membership query
Line 193: Replace with `ai-maestro-agents-management` skill reference
Line 205: Replace with `ai-maestro-agents-management` skill reference for graceful agent stop
Line 209: Consider dynamic lookup via `ai-maestro-agents-management` skill for EAMA/EOA resolution
Line 213: Replace with `ai-maestro-agents-management` skill reference for agent session creation
Line 221: Replace curl verification calls with `ai-maestro-agents-management` skill health-check references
Line 225: Replace with `ai-maestro-agents-management` skill error-path documentation reference
Line 245: Replace with `ai-maestro-agents-management` skill session-existence check
Line 249: Replace with `ai-maestro-agents-management` skill agent-status check
Line 253: Replace with `ai-maestro-agents-management` skill health check
Line 257: Replace with `ai-maestro-agents-management` skill graceful-stop operation
Line 289: Replace with `ai-maestro-agents-management` skill task-state query or document as PRESERVE item
Line 321: Replace with `ai-maestro-agents-management` skill diagnostic references
Line 333: Replace with `ai-maestro-agents-management` skill "Update Agent" operation
Line 337: Replace ALL curl calls with `ai-maestro-agents-management` skill references (most severe file in ops/planning scope)
Line 341: Replace with `ai-maestro-agents-management` skill "Terminate Agent" operation
Line 349: Replace with PSS CLI commands (`/pss-status`, `/pss-suggest`) or `ai-maestro-agents-management` skill
Line 353: Replace with PSS CLI commands; heavily relies on direct internal file reads
Line 357: Replace with PSS CLI abstraction commands
Line 361: Replace all direct reads with PSS CLI abstraction; most affected file in skill-management refs
Line 369: Replace with `ai-maestro-agents-management` skill "Update Agent" reference
Line 373: Replace with `ai-maestro-agents-management` skill "Update/Delete Agent" reference
Line 377: Replace with `ai-maestro-agents-management` skill "Show Agent" reference
Line 381: Replace with `ai-maestro-agents-management` skill "Show Agent" reference
Line 385: Reword: "Update team registry using the `ai-maestro-agents-management` skill"
Line 389: Reword: "Run sync check via the `ai-maestro-agents-management` skill"
Line 393: Add `## Prerequisites` section listing `ai-maestro-agents-management` skill
Line 405: Replace with documentation reference or `ai-maestro-agents-management` skill retry guidance
Line 417: Correct path to `~/.aimaestro/agent-states/` OR replace with `ai-maestro-agents-management` skill state-dump request
Line 482: On approval: AMCOS executes operation via `ai-maestro-agents-management` skill
Line 508: Use `team-governance` skill for status query; keep internal `approval-state.yaml` as supplemental tracking |
Line 512: Reference `team-governance` skill for all governance operations; keep agent-specific approval-tracking logic |
Line 516: Use `team-governance` skill transfer workflow; remove `allowed_agents` from frontmatter |
Line 550: Clean — correct skill delegation pattern throughout |
Line 554: Clean — exemplary PAP adherence; optional: clarify prerequisite wording at line 29 |
Line 605: 12 of 16 files in `amcos-agent-lifecycle/references/` were confirmed clean — they correctly use `ai-maestro-agents-management` and `agent-messaging` skill references for all lifecycle operations. (4 files had violations as noted in Section B.)
Line 661: `references/ai-maestro-integration.md` | Clean — all operations delegate to skills; no hardcoded endpoints |
Line 674: - No `AIMAESTRO_API` references
Line 678: **Assessment: High confidence of clean status based on automated scan.** The 5 integration reference files that WERE individually read (above) confirmed the pattern: this skill uses skill-delegation throughout.
Line 701: `REGISTERED=$(curl -s "$AIMAESTRO_API/api/agents/implementer-1" | jq ...)` in Sync Check section
Line 705: Checklist: "Update team registry via AI Maestro REST API" — normative reference to direct API use
Line 709: Error table: "Run sync check via REST API to reconcile"
Line 713: Missing Prerequisites section declaring `ai-maestro-agents-management` skill dependency
Line 717: `ps aux | grep ai-maestro` fallback in Section 7.2 Step 4 (system health check bypass)
Line 721: `~/.ai-maestro/agent-states/[agent-name]-emergency.json` — uses wrong directory (`~/.ai-maestro/` instead of `~/.aimaestro/`)
Line 725: `~/.ai-maestro/agent-states/` OR replace with `ai-maestro-agents-management` skill state-dump request
Line 733: AMCOS maintains a multi-layer local approval/governance system that is **distinct from and complementary to** AI Maestro's GovernanceRequest system. These systems track different things at different scopes.
Line 749: AI Maestro's governance system tracks:
Line 750: - `POST /api/v1/governance/requests` — Formal approval requests for cross-team or elevated operations
Line 751: - `GET /api/v1/governance/requests/{requestId}` — State tracking: `pending → local-approved → dual-approved → executed`
Line 752: - `POST /api/governance/transfers/` — Agent transfer requests (NOTE: inconsistent path vs `/v1/` prefix — see violation A7)
Line 753: - Audit trail of all governance decisions
Line 769: AI Maestro GovernanceRequest Layer (cross-system)
Line 770: ├── GovernanceRequest: create/terminate/hibernate/wake/install/replace operations
Line 771: ├── TransferRequest: agent ownership changes between teams
Line 772: ├── Audit trail: queryable by any authorized AI Maestro agent
Line 773: └── Cross-team approval: dual-approval for cross-boundary operations
Line 782: 1. **AMCOS submits request via `team-governance` skill** — gets `requestId` back
Line 788: 4. **AMCOS polls for approval via `team-governance` skill** — using the `requestId` from step 1
Line 789: 5. **On approval: AMCOS executes operation via `ai-maestro-agents-management` skill**
Line 800: `commands/amcos-wait-for-approval.md` | CLEAN — correctly delegates; only PRESERVE the adaptive polling strategy and timeout table | No integration change needed; verify `team-governance` skill provides equivalent polling |
Line 804: `agents/amcos-approval-coordinator.md` | Re-declares full governance policy and embeds API calls | Reference `team-governance` skill for all governance operations; keep agent-specific approval-tracking logic |
Line 808: `commands/amcos-transfer-agent.md` | Embeds transfer API endpoint + hardcodes allowed callers | Use `team-governance` skill transfer workflow; remove `allowed_agents` from frontmatter |
Line 840: Checklist: "Update team registry via AI Maestro REST API" — normative reference to direct API use