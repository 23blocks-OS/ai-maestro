# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:48.768Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-role-plugin-governance-audit.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-role-plugin-governance-audit.md
Line 13: | ai-maestro-chief-of-staff | `Emasoft/ai-maestro-chief-of-staff` |
Line 14: | ai-maestro-architect | `Emasoft/ai-maestro-architect-agent` |
Line 15: | ai-maestro-orchestrator | `Emasoft/ai-maestro-orchestrator-agent` |
Line 16: | ai-maestro-integrator | `Emasoft/ai-maestro-integrator-agent` |
Line 17: | ai-maestro-programmer | `Emasoft/ai-maestro-programmer-agent` |
Line 20: Note: `code-auditor-agent` does NOT follow the `ai-maestro-*` naming convention used by all other role plugins.
Line 40: | ai-maestro-chief-of-staff | `ai-maestro-chief-of-staff` | **MISSING** | N/A | **MISMATCH**: `amcos-chief-of-staff-main-agent.md` (name: `amcos-chief-of-staff-main-agent`) |
Line 41: | ai-maestro-architect-agent | `ai-maestro-architect-agent` | **MISSING** | N/A | **MISMATCH**: `amaa-architect-main-agent.md` (name: `amaa-architect-main-agent`) |
Line 42: | ai-maestro-orchestrator-agent | `ai-maestro-orchestrator-agent` | **MISSING** | N/A | **MISMATCH**: `amoa-orchestrator-main-agent.md` (name: `amoa-orchestrator-main-agent`) |
Line 43: | ai-maestro-integrator-agent | `ai-maestro-integrator-agent` | **MISSING** | N/A | **MISMATCH**: `amia-integrator-main-agent.md` (name: `amia-integrator-main-agent`) |
Line 44: | ai-maestro-programmer-agent | `ai-maestro-programmer-agent` | **MISSING** | N/A | **MISMATCH**: `ampa-programmer-main-agent.md` (name: `ampa-programmer-main-agent`) |
Line 50:   - 1/6 (`code-auditor-agent`) has NO main-agent file at all (only 11 specialized sub-agents)
Line 70: | **ai-maestro-chief-of-staff** | `skills/amcos-permission-management/SKILL.md` | Embeds `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` endpoint URLs |
Line 71: | **ai-maestro-chief-of-staff** | `skills/amcos-permission-management/references/governance-details-and-examples.md` | Embeds full GovernanceRequest JSON payload format, `POST /api/v1/governance/requests` URL |
Line 72: | **ai-maestro-chief-of-staff** | `skills/amcos-transfer-management/references/transfer-procedures-and-examples.md` | **SEVERE**: Contains 6+ raw `curl` commands with full API URLs (`$AIMAESTRO_API/api/governance/transfers/`, `/approve`, `/execute`), headers, JSON payloads |
Line 73: | **ai-maestro-chief-of-staff** | `skills/amcos-agent-spawning/SKILL.md` | Embeds `GET /api/teams` endpoint URL |
Line 74: | **ai-maestro-chief-of-staff** | `skills/amcos-agent-termination/SKILL.md` | Embeds `DELETE /api/agents/{id}` endpoint URL |
Line 75: | **ai-maestro-chief-of-staff** | `skills/amcos-agent-coordination/SKILL.md` | Embeds `GET /api/teams/{id}/agents` and `POST /api/teams/{id}/agents` endpoint URLs |
Line 76: | **ai-maestro-orchestrator-agent** | `skills/amoa-orchestration-patterns/SKILL.md` | Embeds `http://localhost:23000` URL |
Line 77: | **ai-maestro-integrator-agent** | `skills/amia-integration-protocols/SKILL.md` | References "AI Maestro curl command templates" in reference file |
Line 78: | **ai-maestro-programmer-agent** | `skills/ampa-handoff-management/SKILL.md` | Embeds `curl -s "http://localhost:23000/api/health"` and `localhost:23000` URL |
Line 82: | **ai-maestro-architect-agent** | COMPLIANT -- skills reference `agent-messaging` skill by name, no curl/API syntax found |
Line 87: - The CoS transfer-management reference file is the most severe case, containing full curl command blocks that should be behind `aimaestro-agent.sh` or a governance script wrapper
Line 97: | **ai-maestro-chief-of-staff** | **COMPLIANT** | All lifecycle operations (spawn, terminate, hibernate, wake, transfer) explicitly require GovernanceRequest approval from Manager. Main agent enforces: "GOVERNANCE ENFORCEMENT: All destructive operations require GovernanceRequest approval." |
Line 98: | **ai-maestro-architect-agent** | **COMPLIANT** | No governance operations defined. Requests agents through AMCOS, cannot create/delete directly. |
Line 99: | **ai-maestro-orchestrator-agent** | **COMPLIANT** | Explicitly states "Create agents directly -> request via AMCOS". No autonomous governance. |
Line 100: | **ai-maestro-integrator-agent** | **COMPLIANT** | No governance operations. Quality gates only, no agent lifecycle management. |
Line 101: | **ai-maestro-programmer-agent** | **COMPLIANT** | Pure implementer, no governance operations. |
Line 113: | **ai-maestro-chief-of-staff** | **COMPLIANT** | Correctly distinguishes governance roles (`manager`, `chief-of-staff`, `member`) from plugin roles (Orchestrator/EOA, Architect/EAA, etc.) in ROLE_BOUNDARIES.md. Uses "governance role" vs "plugin role" terminology. |
Line 114: | **ai-maestro-architect-agent** | **OUTDATED** | ROLE_BOUNDARIES.md uses old terminology: "AMAMA" instead of "EAMA", says AMCOS is "project-independent (one per org)" instead of "team-scoped (one per team)". Does NOT mention governance titles (`manager`/`chief-of-staff`/`member`) at all. |
Line 115: | **ai-maestro-orchestrator-agent** | **OUTDATED** | Same outdated ROLE_BOUNDARIES.md as architect. Uses "AMAMA", "project-independent (one per org)". No governance title concept. |
Line 116: | **ai-maestro-integrator-agent** | **OUTDATED** | Same outdated ROLE_BOUNDARIES.md. Uses "AMAMA", "project-independent (one per org)". No governance title concept. |
Line 117: | **ai-maestro-programmer-agent** | **OUTDATED** | Same outdated ROLE_BOUNDARIES.md. Uses "AMAMA", "project-independent (one per org)". No governance title concept. |
Line 132: | ai-maestro-chief-of-staff | `ai-maestro-chief-of-staff` | `amcos-chief-of-staff-main-agent.md` | `amcos-chief-of-staff-main-agent` | `amcos-*` (all kebab) | **PASS** |
Line 133: | ai-maestro-architect-agent | `ai-maestro-architect-agent` | `amaa-architect-main-agent.md` | `amaa-architect-main-agent` | `amaa-*` (all kebab) | **PASS** |
Line 134: | ai-maestro-orchestrator-agent | `ai-