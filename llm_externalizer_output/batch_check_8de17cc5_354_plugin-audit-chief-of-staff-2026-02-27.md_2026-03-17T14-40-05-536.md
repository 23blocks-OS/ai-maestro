# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:05.536Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-audit-chief-of-staff-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-audit-chief-of-staff-2026-02-27.md
L21: **Distribution**: Independent GitHub repo (NOT part of emasoft-plugins marketplace)
L26: IMPORTANT**: This plugin is an **independent** AI Maestro plugin distributed via its own GitHub repo. It is NOT related to any `emasoft-chief-of-staff` plugin in the emasoft-plugins marketplace. However, the codebase contains **massive legacy naming contamination** (548 references to EAMA/EOA/EAA/EIA/emasoft prefixes) that needs to be cleaned up — see Finding C3.
L206: **Independence from emasoft-plugins Marketplace**
L208: IMPORTANT**: This plugin (`ai-maestro-chief-of-staff`) is an **independent** AI Maestro plugin. It is NOT related to the `emasoft-chief-of-staff` plugin in the emasoft-plugins marketplace. They are separate projects with separate codebases. Any references to emasoft-* naming inside this repo are bugs that need to be fixed.
L211: CRITICAL: Emasoft Naming Contamination (548 References)
L213: Emasoft naming contamination check**: **HEAVILY CONTAMINATED** — grep found **548 references** to legacy emasoft naming across the entire repo. This is a CRITICAL issue — the plugin was forked/adapted from the emasoft version but legacy naming was never fully cleaned up.
L215: Contaminated naming patterns found:
L217: `EAMA` (emasoft assistant manager) | ~80+ | `agents/amcos-chief-of-staff-main-agent.md`, `docs/FULL_PROJECT_WORKFLOW.md`, `docs/ROLE_BOUNDARIES.md`, multiple skills |
L218: `EOA` (emasoft orchestrator agent) | ~60+ | Same files — should be "Orchestrator" or project-neutral |
L219: `EAA` (emasoft architect agent) | ~50+ | Same files — should be "Architect" or project-neutral |
L220: `EIA` (emasoft integrator agent) | ~40+ | Same files — should be "Integrator" or project-neutral |
L221: `EPA` (emasoft performance agent) | ~10+ | Performance reporting docs |
L222: `emasoft` (direct references) | ~20+ | `shared/handoff_template.md`, scripts, agent personas |
L229: Required fix**: All `EAMA` references should be replaced with `AMAMA` (AI Maestro Assistant Manager Agent). `EOA`, `EAA`, `EIA`, `EPA` should be replaced with their AI Maestro equivalents or made role-generic (e.g., "Orchestrator", "Architect", "Integrator"). All `emasoft` references should be removed entirely.
L231: Marketplace Attribution
L233: This plugin does NOT belong to the emasoft-plugins marketplace. It needs its own marketplace registration (an `ai-maestro-plugins` marketplace or direct GitHub repo installation) before it can be installed via `claude plugin install`. The plugin.json does not specify a marketplace source. Any documentation referencing emasoft-plugins marketplace installation should be corrected.
L262: Reports to MANAGER (referred to as "EAMA" in the source — **legacy emasoft naming, should be AMAMA**)
L263: Coordinates with "EOA", "EAA", "EIA" (**legacy emasoft naming, should be Orchestrator/Architect/Integrator**)
L288: C3 | **MASSIVE emasoft naming contamination (548 references)** | The codebase contains 548 references to legacy emasoft naming (EAMA, EOA, EAA, EIA, EPA, emasoft) across agents, docs, scripts, commands, and shared templates. The plugin claims to be independent from the emasoft-plugins version but the naming has never been cleaned up. This creates confusion about plugin identity and affiliations. See Section 7 for full breakdown.
L330: RC-3 | CRITICAL | Fix 548 emasoft naming references | Multiple (see Sec 7) | ALL |
L368: Why:** The naming inconsistency creates identity confusion. The LLM may use `EAMA` instead of `AMAMA` in AMP messages, causing delivery failures (AMP resolves by session name, and there is no agent named `EAMA`).
L376: The legacy `eoa-*`, `eaa-*`, `eia-*` names from the emasoft era must be replaced everywhere. And the `amcos-orchestrator-main-agent` variant in AGENT_OPERATIONS.md is also wrong -- that implies the orchestrator is a sub-agent of AMCOS, when it is actually a separate plugin.
L505: Problem:** AMCOS maintains team composition in `.emasoft/team-registry.json` (used by ecos-label-taxonomy, ecos-agent-lifecycle, ecos-team-coordination skills). The PR introduces server-side teams at `/api/teams` with ACL, types, and COS tracking.
L507: Current plugin behavior:
L508: `ecos-label-taxonomy`: reads/writes `.emasoft/team-registry.json` via `jq` commands
L509: `ecos-agent-lifecycle`: updates `.emasoft/team-registry.json` on spawn/terminate
L510: `ecos-team-coordination`: references `.emasoft/team-registry.json` for team awareness
L512: Required change:** Replace ALL `.emasoft/team-registry.json` usage with AI Maestro's `team-governance` skill patterns. The skill teaches team listing, membership updates, and team detail queries with proper authentication headers. Update `ecos-team-coordination`, `ecos-label-taxonomy`, and `ecos-agent-lifecycle` skill descriptions to instruct agents to follow the `team-governance` skill for team operations.
L529: Current plugin behavior:** `ecos-agent-lifecycle` skill → spawns tmux session → registers in AI Maestro. No GovernanceRequest.
L536: Problem:** AMCOS `ecos-permission-management` skill sends AMP `approval-request` messages to manager. The PR introduces GovernanceRequest system with formal state machine and governance password.
L538: Current plugin behavior:** AMP-based approvals (send request message → wait for reply message). No state persistence beyond AMP inbox.
L546: Problem:** The PR introduces `POST /api/governance/transfers` for formal agent transfers between teams. AMCOS's `ecos-failure-recovery` skill handles work handoff via AMP `emergency-handoff` messages without creating transfer requests.
```