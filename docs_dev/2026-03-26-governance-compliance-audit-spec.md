# Governance Compliance Audit Specification

**Date:** 2026-03-26
**Branch:** feature/team-governance
**Purpose:** Deep semantic audit of all 6 role-plugin repos against governance_rules_v2.md
**Execution:** Deferred to dedicated session with full context budget

---

## Source of Truth

- **Governance rules:** `docs_dev/governance_rules_v2.md` (canonical)
- **Design rules:** `docs_dev/governance-design-rules.md` (detailed with rule IDs R1-R6)
- **Title-Plugin binding:** `services/role-plugin-service.ts` → `TITLE_PLUGIN_MAP`
- **Messaging filter:** `lib/message-filter.ts`

---

## Repos to Audit (in priority order)

| # | Repo | Role | Priority | Why |
|---|------|------|----------|-----|
| 1 | ai-maestro-chief-of-staff | COS | CRITICAL | Most governance power after MANAGER. 26 skills, complex workflows. |
| 2 | ai-maestro-assistant-manager-agent | MANAGER | CRITICAL | Highest privilege. Can create/delete agents, manage all teams. |
| 3 | ai-maestro-orchestrator-agent | MEMBER | HIGH | Orchestrates other agents — could inadvertently violate boundaries. |
| 4 | ai-maestro-integrator-agent | MEMBER | HIGH | Cross-project scope, GitHub integration — could cross team boundaries. |
| 5 | ai-maestro-architect-agent | MEMBER | MEDIUM | Design authority — less likely to violate but must respect boundaries. |
| 6 | ai-maestro-programmer-agent | MEMBER | LOW | Implementer — least governance surface. |

---

## Rules to Verify

### R1: Team Type Rules

| Rule | What to Check |
|------|---------------|
| R1.3 | No skill/agent instructs changing team to closed WITHOUT designating COS |
| R1.4 | No workflow allows a closed team to exist without COS |
| R1.5 | COS removal always triggers downgrade to open — no skill bypasses this |

### R2: Team Name Rules

| Rule | What to Check |
|------|---------------|
| R2.1 | No skill creates teams without checking uniqueness |

### R3: Role Hierarchy Rules

| Rule | What to Check |
|------|---------------|
| R3.1 | Agent persona files correctly identify their governance title |
| R3.2 | MANAGER skills don't allow creating a second MANAGER |
| R3.4 | COS skills don't assume COS can lead multiple closed teams |
| R3.6 | Only MANAGER skills claim unrestricted authority |
| R3.8 | COS skills correctly scope staff management to own team only |

### R4: Agent Membership Rules

| Rule | What to Check |
|------|---------------|
| R4.1 | No skill assigns a normal agent to multiple closed teams |
| R4.3 | MEMBER agent skills don't try to join/leave closed teams directly |
| R4.6 | COS always added to own team's agentIds |
| R4.7 | No skill removes COS from agentIds without removing COS role |

### R5: Transfer Rules

| Rule | What to Check |
|------|---------------|
| R5.1 | Moving agents FROM closed teams always uses transfer workflow |
| R5.2 | Only MANAGER/COS skills create transfer requests |
| R5.3 | Only source team COS/MANAGER approve transfers |
| R5.4 | No skill transfers COS out of their own team |

### R6: Messaging Rules

| Rule | What to Check |
|------|---------------|
| R6.1 | Normal closed-team agents don't message outside their team (except via COS routing) |
| R6.2 | COS only messages: own team + other COS + MANAGER (no direct to other teams' members) |
| R6.3 | Only MANAGER claims unrestricted messaging |
| R6.4 | No skill instructs an agent to bypass message filtering |

### Role-Plugin Specific Rules

| Rule | What to Check |
|------|---------------|
| RP1 | MANAGER agent uses ONLY ai-maestro-assistant-manager-agent plugin |
| RP2 | COS agent uses ONLY ai-maestro-chief-of-staff plugin |
| RP3 | MEMBER agents don't use amama- or amcos- plugins |
| RP4 | No skill instructs an agent to install a role-plugin reserved for another title |
| RP5 | Role-plugins installed with --scope local only |
| RP6 | All role-plugin references use marketplace (not ~/agents/role-plugins/ for defaults) |

---

## Simulation Scenarios

For each repo, simulate these scenarios and check for rule violations:

### Scenario 1: COS Creates a New Team Member
- COS reads a task, decides to create a new agent
- COS calls `aimaestro-agent.sh create <name> --dir <path>`
- COS assigns agent to own team
- COS installs a role-plugin on the new agent
- **CHECK:** Does COS ask MANAGER approval? (governance_rules_v2 line 25: "COS must ask permission to MANAGER")

### Scenario 2: COS Tries to Manage Another Team
- COS receives a request from another COS
- COS tries to add an agent from another closed team to own team
- **CHECK:** Does the skill correctly use the transfer workflow? Or does it try to directly add?

### Scenario 3: Normal Agent Tries to Message Outside Team
- Programmer agent in closed team needs info from another team's architect
- **CHECK:** Does the skill route the message via COS? Or does it try to send directly?

### Scenario 4: MANAGER Creates Closed Team
- MANAGER creates a closed team with chiefOfStaffId
- **CHECK:** Does the workflow auto-install COS plugin? Does it handle missing COS gracefully?

### Scenario 5: COS Gets Removed
- MANAGER removes COS from a team
- **CHECK:** Does the team auto-downgrade to open? Are pending requests auto-rejected?

### Scenario 6: Cross-Team Agent Transfer
- COS of Team A wants to transfer an agent to Team B
- **CHECK:** Does the flow use the transfer request API? Does Team B's COS approve?

---

## Audit Methodology

### Per-Repo Procedure

1. **Read the main agent .md file** (agents/<name>-main-agent.md)
   - Check governance title assertion
   - Check boundary declarations (what it CAN and CANNOT do)
   - Check messaging protocols
   - Check if it references team-governance skill as authoritative

2. **Read ROLE_BOUNDARIES.md** (docs/ROLE_BOUNDARIES.md)
   - Cross-check against governance_rules_v2.md
   - Flag any discrepancies

3. **Audit each skill SKILL.md** (most critical)
   - For each skill, trace the workflow step by step
   - At each step, ask: "Could this violate any governance rule?"
   - Check: Does the skill use the correct API endpoint with proper auth headers?
   - Check: Does the skill respect team boundaries?
   - Check: Does the skill handle the "ask MANAGER approval" flow for COS operations?

4. **Audit reference files** (references/*.md)
   - Check for outdated governance rules
   - Check for incorrect permission matrices
   - Check for examples that show rule violations

5. **Audit docs/ folder**
   - Check example workflows for governance compliance
   - Verify the "happy path" doesn't skip governance checks

### Token Budget Strategy

- Use LLM Externalizer (Opus-class via OpenRouter ensemble) for analysis
- Process ONE REPO at a time (not all 6 in parallel)
- Within each repo, batch skills into groups of 3-4 for `batch_check`
- Use `instructions_files_paths` pointing to governance_rules_v2.md as the reference standard
- Each batch: send governance rules + 3-4 skill files → get violation report
- Estimated: ~15 LLM calls per repo, ~90 total calls across 6 repos
- Main agent file + ROLE_BOUNDARIES.md: 1 call each (read + analyze)

### Fix Strategy

After audit identifies violations:
1. Categorize by severity: BLOCKING (directly violates rule) vs WARNING (implied violation)
2. Group fixes by file — minimize edit operations
3. For each fix: describe the violation, cite the rule, show the fix
4. Re-run the specific simulation scenario to verify the fix

---

## Output Format

Per-repo audit report saved to `docs_dev/governance-audit-<repo-name>-2026-03-27.md`:

```markdown
# Governance Audit: <repo-name>

## Summary
- Files audited: N
- Violations found: N (X blocking, Y warning)
- Files clean: N

## Violations

### [BLOCKING] <file>:<line> — Rule R3.4 violation
**Description:** COS skill assumes multi-team leadership
**Rule:** R3.4: COS can lead one closed team only
**Current:** "Manage agents across your teams"
**Fix:** "Manage agents in your assigned team"

### [WARNING] <file>:<line> — Rule R5.1 implied violation
**Description:** Skill moves agent without transfer workflow
...
```

---

## Pre-Audit Checklist

Before starting the audit session:
- [ ] Verify all 6 repos are cloned to /tmp/ (fresh `--depth=1` clone)
- [ ] Verify `governance_rules_v2.md` is the latest version
- [ ] Verify LLM Externalizer is running and has sufficient credits
- [ ] Verify `governance-design-rules.md` R3.4 is fixed (COS = 1 team only)
- [ ] Create a timestamped audit tracking file in docs_dev/
