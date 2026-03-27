# Mixed-Client Team Governance Spec

**Date:** 2026-03-27
**Status:** Design phase — complex problem requiring careful thought

## The Problem

A closed team can have a mix of Claude, Codex, and Gemini agents. The governance rules apply to ALL agents regardless of client, but the enforcement mechanisms differ:

- **Claude agents** have plugins, hooks, rules, commands — the governance system enforces rules at the plugin level
- **Codex/Gemini agents** only have skills — governance must be enforced via skill instructions alone
- **MANAGER and COS MUST be Claude** — they need role-plugins which are Claude-only
- **MEMBER agents can be any client** — they only need skills to learn the governance rules

## Hard Constraints

### 1. MANAGER and COS are always Claude
- MANAGER title requires `ai-maestro-assistant-manager-agent` plugin → Claude-only
- COS title requires `ai-maestro-chief-of-staff` plugin → Claude-only
- This is enforced by `autoAssignRolePluginForTitle()` — if the agent isn't Claude, plugin install will fail
- **API must REJECT assigning MANAGER/COS title to non-Claude agents**

### 2. MEMBER agents can be any client
- They only need to know the governance rules (messaging restrictions, team boundaries)
- Skills are the universal teaching mechanism
- The ai-maestro skills (governance, messaging, kanban) work via REST API calls — client-agnostic

### 3. Plugin management is Claude-only
- Skills must NOT instruct Codex/Gemini agents to use `claude plugin install`
- Skills must NOT reference `.claude/settings.local.json` for non-Claude agents
- The profile panel already hides plugin-related tabs for non-Claude clients

## What Skills Need to Teach Non-Claude Agents

### Governance awareness skill (for ALL clients)
Every agent needs to know:
- Their title (MEMBER) and what it means
- Their team and messaging boundaries
- Who they can message (own team + COS + MANAGER)
- Who they can't message (other closed teams)
- How to request help from COS (not direct to other teams)
- That they CANNOT create teams, assign COS, or manage other agents

### What to EXCLUDE from non-Claude agent skills
- Plugin install/uninstall instructions
- Hook configuration
- Rule file management
- Command file creation
- Role-plugin switching
- `.claude/` directory references

## Codex Subagents — Special Case

### The problem
Codex agents can spawn subagents (explorer, worker, default + custom). When a Codex MEMBER agent in a closed team spawns a subagent:
- Does the subagent inherit the team membership?
- Can the subagent message outside the team?
- How does AI Maestro track subagents?

### Proposed rules
1. **Subagents inherit the parent's governance scope** — if parent is in a closed team, subagents are too
2. **Subagents are NOT registered in AI Maestro** — they're ephemeral, managed by Codex
3. **Subagents CANNOT use AMP messaging** — they don't have agent identity
4. **The parent agent is responsible** for ensuring subagent actions comply with governance
5. **AI Maestro's message filter applies to the PARENT** — if the parent can't message someone, neither can its subagents

### How to enforce
- The governance skill for Codex agents must include: "Your subagents inherit your team scope. Do not instruct subagents to communicate with agents outside your team."
- The message filter in AI Maestro checks the parent agent's identity, not the subagent's

## Mixed Team Dynamics

### Scenario: Closed team with Claude COS + Codex programmers + Gemini architect

```
Team "backend-core" (closed)
├── COS: Alice (Claude) — ai-maestro-chief-of-staff plugin
├── Member: Bob (Codex) — programmer skills only
├── Member: Carol (Gemini) — architect skills only
└── Member: Dave (Claude) — ai-maestro-programmer-agent plugin
```

**Communication flow:**
- Bob (Codex) can message Alice (COS) and Dave (same team) via AMP scripts
- Carol (Gemini) can message Alice and Bob and Dave via AMP scripts
- Bob CANNOT message agents in other closed teams
- Alice (COS) can message MANAGER and other COS agents

**Skill installation:**
- Bob: `~/.codex/skills/` has ai-maestro skills (installed by cross-client-skill-service)
- Carol: `~/.gemini/skills/` has ai-maestro skills
- Dave: Claude plugin system has ai-maestro plugin

**The COS (Alice) creates a new Codex agent:**
1. Alice uses `aimaestro-agent.sh create Eve --program codex --dir ~/projects/api`
2. AI Maestro API creates the agent, detects program=codex
3. `cross-client-skill-service.ts` auto-installs skills to `~/projects/api/.codex/skills/`
4. Alice assigns Eve to the team via governance API
5. Eve's skills teach her the team boundaries

### How does COS know an agent is compatible?

The COS needs to know:
- What client the agent runs (program field)
- What capabilities the client has (from ClientCapabilities)
- Whether the agent can receive role-plugins (Claude only)
- Whether the agent has skills installed

**Proposed: agent list shows client type badge**

The `aimaestro-agent.sh list` output and the API response should include:
```json
{
  "id": "...",
  "name": "Bob",
  "program": "codex",
  "clientType": "codex",
  "capabilities": ["skills", "agents", "mcp"],
  "hasAiMaestroSkills": true,
  "rolePlugin": null  // non-Claude can't have role-plugins
}
```

This lets the COS (or MANAGER) make informed decisions about team composition.

## Implementation Plan

### Phase 1: Enforce MANAGER/COS = Claude only
- In `autoAssignRolePluginForTitle()`: check agent.program, reject if not Claude
- In COS assignment API: validate agent is Claude before assigning
- In MANAGER assignment API: same validation

### Phase 2: Client-aware governance skills
- Create a universal governance skill (without plugin references) for Codex/Gemini
- The cross-client installer should install this governance skill
- The skill teaches team boundaries, messaging rules, COS routing

### Phase 3: Agent list with client type
- Add `clientType` to agent API responses
- Add `hasAiMaestroSkills` field
- Show client type badge in UI (already done in profile panel)

### Phase 4: Subagent governance documentation
- Add governance rules for Codex subagents in the governance skill
- Document that subagents inherit parent's team scope

### Phase 5: Mixed team creation guard
- When COS adds a non-Claude agent to a closed team, verify skills are installed
- If skills not installed, auto-install before confirming team addition
- Warn COS if the agent's client doesn't support certain features

## Open Questions

1. Should non-Claude agents be allowed in closed teams at all? (They can't enforce governance at the plugin level)
2. How do we verify a Codex/Gemini agent actually follows the governance rules? (Skills are advisory, not enforced)
3. Should there be a "verified compatible" flag for non-Claude agents?
4. How do we handle Codex agent TOML files vs Claude agent .md files when transferring between teams?
