# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:11.996Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-compliance-assistant-manager.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-compliance-assistant-manager.md
Line 4: **Audited Against**: AI Maestro `feature/team-governance` branch (v0.26.0)
Line 10: AI Maestro governance implements a **flat role-based** model with 3 roles: `manager`, `chief-of-staff`, `member`. The MANAGER role in AI Maestro largely aligns with EAMA's authority, but the interaction patterns, approval workflows, and team management differ significantly.
Line 22: **Required**: In AI Maestro, this IS the `manager` role agent (AgentRole = `'manager'`). There is exactly ONE manager per host. The agent registry must have `role: 'manager'` set.
Line 25: - The agent's entry in AI Maestro registry must have `role: 'manager'`
Line 33: **Required**: In AI Maestro, the MANAGER **assigns** the COS role to an existing agent via:
Line 45: **Required**: AI Maestro doesn't have a "project" concept in governance. It has **teams**:
Line 50: Teams are stored globally in `~/.aimaestro/teams/registry.json`
Line 60: **Required**: AI Maestro uses structured `GovernanceRequest` objects with a status machine:
Line 76: **Required**: As MANAGER, this agent CAN message anyone (R6.3). However, MANAGER must understand:
Line 82: - AMP protocol is the messaging standard
Line 97: 3. Understand that the password is bcrypt-hashed and stored in `~/.aimaestro/governance.json`
Line 109: **Required**: AI Maestro supports a mesh of hosts. MANAGER must understand:
Line 113: - Governance state is replicated via GovernanceSyncMessages
Line 114: - Peer governance state is cached in `~/.aimaestro/governance-peers/`
Line 115: - `shouldAutoApprove()` in `lib/manager-trust.ts` can auto-approve requests from trusted peers
Line 125: **Required**: AI Maestro has 3 governance roles only: `manager`, `chief-of-staff`, `member`. Plugin-level specializations (architect, orchestrator, integrator) are expressed through:
Line 140: **Required**: Team creation uses AI Maestro API:
Line 149: **Required**: Agent creation via AI Maestro:
Line 159: **Required**: Use AI Maestro's API for real-time status:
Line 167: **Required**: AI Maestro has its own task system:
Line 168: - Tasks stored per-team in `~/.aimaestro/teams/tasks-{teamId}.json`
Line 172: MANAGER can also use GitHub Projects, but the AI Maestro task system should be the primary tracking.
Line 175: **Changes**: Add awareness of AI Maestro task system to status reporting and work routing.
Line 184: **Required**: This is fine as a plugin-level feature, but:
Line 187: - Kanban operations should sync with AI Maestro's task system
Line 194: **Required**: AI Maestro has built-in agent memory:
Line 195: - Agent database (CozoDB) at `~/.aimaestro/agents/<id>/`
Line 203: Consider renaming from "assistant-manager" to just "manager" to align with AI Maestro's `manager` role name.
Line 206: All message templates in `references/` should use AMP format consistently.
Line 209: **Suggested**: Use AI Maestro's agent metadata or a standardized location under `~/.aimaestro/`.
Line 212: Add `minMaestroVersion: "0.26.0"` to plugin.json.
Line 234: `skills/eama-session-memory/SKILL.md` | Major — AI Maestro memory integration | Medium |
Line 235: `skills/eama-status-reporting/SKILL.md` | Major — AI Maestro API queries | Medium |
Line 254: | Plugin Concept | AI Maestro Equivalent |
Line 256: | EAMA (Assistant Manager) | MANAGER role (`role: 'manager'`) |
Line 257: | ECOS (Chief of Staff) | COS role (`role: 'chief-of-staff'`) per team |
Line 263: | Project creation | Team creation (`POST /api/teams { type: 'closed' }`) |
Line 265: | Approval message | GovernanceRequest (`POST /api/v1/governance/requests`) |
Line 266: | Approve response | Approve API (`POST /api/v1/governance/requests/[id]/approve`) |
Line 267: | Custom team registry | AI Maestro team registry (`~/.aimaestro/teams/registry.json`) |
Line 268: | AI Maestro messages | AMP protocol (`amp-send.sh`, `amp-inbox.sh`) |
Line 274: ### MANAGER Authority (from `lib/governance.ts` + `lib/team-acl.ts`)
```