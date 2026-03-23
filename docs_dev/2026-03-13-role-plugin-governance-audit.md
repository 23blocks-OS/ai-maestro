# Role-Plugin Governance Protocol Compliance Audit

**Date:** 2026-03-13
**Auditor:** Orchestrator (claude-opus-4-6)
**Scope:** 6 Emasoft role-plugin repos on GitHub

---

## Repo Name Corrections

The user-provided repo names differ from actual GitHub names:

| User-Provided | Actual GitHub Repo |
|---|---|
| ai-maestro-chief-of-staff | `Emasoft/ai-maestro-chief-of-staff` |
| ai-maestro-architect | `Emasoft/ai-maestro-architect-agent` |
| ai-maestro-orchestrator | `Emasoft/ai-maestro-orchestrator-agent` |
| ai-maestro-integrator | `Emasoft/ai-maestro-integrator-agent` |
| ai-maestro-programmer | `Emasoft/ai-maestro-programmer-agent` |
| ai-maestro-code-auditor | `Emasoft/code-auditor-agent` |

Note: `code-auditor-agent` does NOT follow the `ai-maestro-*` naming convention used by all other role plugins.

---

## 1. Quad-Match Rule Compliance

### Rule: All 4 must match:
- (a) `plugin.json` `name` field
- (b) `<plugin-name>.agent.toml` exists at plugin root with matching filename stem
- (c) `[agent].name` inside the TOML matches the plugin name
- (d) `agents/<plugin-name>-main-agent.md` exists with matching frontmatter `name`

### Results

| Repo | (a) plugin.json name | (b) .agent.toml exists | (c) TOML name matches | (d) main-agent.md matches |
|---|---|---|---|---|
| ai-maestro-chief-of-staff | `ai-maestro-chief-of-staff` | **MISSING** | N/A | **MISMATCH**: `amcos-chief-of-staff-main-agent.md` (name: `amcos-chief-of-staff-main-agent`) |
| ai-maestro-architect-agent | `ai-maestro-architect-agent` | **MISSING** | N/A | **MISMATCH**: `amaa-architect-main-agent.md` (name: `amaa-architect-main-agent`) |
| ai-maestro-orchestrator-agent | `ai-maestro-orchestrator-agent` | **MISSING** | N/A | **MISMATCH**: `amoa-orchestrator-main-agent.md` (name: `amoa-orchestrator-main-agent`) |
| ai-maestro-integrator-agent | `ai-maestro-integrator-agent` | **MISSING** | N/A | **MISMATCH**: `amia-integrator-main-agent.md` (name: `amia-integrator-main-agent`) |
| ai-maestro-programmer-agent | `ai-maestro-programmer-agent` | **MISSING** | N/A | **MISMATCH**: `ampa-programmer-main-agent.md` (name: `ampa-programmer-main-agent`) |
| code-auditor-agent | `code-auditor-agent` | **MISSING** | N/A | **MISSING**: No `*-main-agent.md` file exists at all |

### Summary

- **(b) CRITICAL**: 0/6 repos have a `.agent.toml` file. ALL fail this check.
- **(d) CRITICAL**: 0/6 repos have a correctly-named main-agent file:
  - 5/6 use abbreviated prefixes (`amcos-`, `amaa-`, `amoa-`, `amia-`, `ampa-`) instead of the full plugin name
  - 1/6 (`code-auditor-agent`) has NO main-agent file at all (only 11 specialized sub-agents)
- **Quad-match score: 0/6 repos pass any check beyond (a)**

### Additional Agent Name Inconsistency

The CoS `amcos-agent-spawning` skill references agent names with `eoa-`/`eaa-`/`eia-`/`epa-` prefixes:

| CoS Spawning Reference | Actual Agent Name in Repo |
|---|---|
| `eoa-orchestrator-main-agent` | `amoa-orchestrator-main-agent` |
| `eaa-architect-main-agent` | `amaa-architect-main-agent` |
| `eia-integrator-main-agent` | `amia-integrator-main-agent` |
| `epa-programmer-main-agent` | `ampa-programmer-main-agent` |

This means the CoS would fail to spawn agents using the `--agent` flag because the names don't match what the repos actually contain.

---

## 2. Plugin Abstraction Principle Compliance

### Rule: Skills/commands/agents must NOT embed API syntax (no curl, no endpoint URLs, no header patterns). Must reference global AI Maestro skills by name.

### Violations Found

| Repo | File | Violation |
|---|---|---|
| **ai-maestro-chief-of-staff** | `skills/amcos-permission-management/SKILL.md` | Embeds `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` endpoint URLs |
| **ai-maestro-chief-of-staff** | `skills/amcos-permission-management/references/governance-details-and-examples.md` | Embeds full GovernanceRequest JSON payload format, `POST /api/v1/governance/requests` URL |
| **ai-maestro-chief-of-staff** | `skills/amcos-transfer-management/references/transfer-procedures-and-examples.md` | **SEVERE**: Contains 6+ raw `curl` commands with full API URLs (`$AIMAESTRO_API/api/governance/transfers/`, `/approve`, `/execute`), headers, JSON payloads |
| **ai-maestro-chief-of-staff** | `skills/amcos-agent-spawning/SKILL.md` | Embeds `GET /api/teams` endpoint URL |
| **ai-maestro-chief-of-staff** | `skills/amcos-agent-termination/SKILL.md` | Embeds `DELETE /api/agents/{id}` endpoint URL |
| **ai-maestro-chief-of-staff** | `skills/amcos-agent-coordination/SKILL.md` | Embeds `GET /api/teams/{id}/agents` and `POST /api/teams/{id}/agents` endpoint URLs |
| **ai-maestro-orchestrator-agent** | `skills/amoa-orchestration-patterns/SKILL.md` | Embeds `http://localhost:23000` URL |
| **ai-maestro-integrator-agent** | `skills/amia-integration-protocols/SKILL.md` | References "AI Maestro curl command templates" in reference file |
| **ai-maestro-programmer-agent** | `skills/ampa-handoff-management/SKILL.md` | Embeds `curl -s "http://localhost:23000/api/health"` and `localhost:23000` URL |

### Compliant Repos

| Repo | Status |
|---|---|
| **ai-maestro-architect-agent** | COMPLIANT -- skills reference `agent-messaging` skill by name, no curl/API syntax found |
| **code-auditor-agent** | COMPLIANT -- skills are self-contained audit procedures, no AI Maestro API references |

### Summary
- **4/6 repos have API abstraction violations** (CoS is the worst offender with ~10+ violations)
- The CoS transfer-management reference file is the most severe case, containing full curl command blocks that should be behind `aimaestro-agent.sh` or a governance script wrapper
- Architect and Code Auditor are clean

---

## 3. Governance Operations Must Go Through Manager

### Rule: No agent should allow autonomous governance changes (creating/deleting teams, changing titles, transferring agents) without Manager approval.

### Results

| Repo | Status | Details |
|---|---|---|
| **ai-maestro-chief-of-staff** | **COMPLIANT** | All lifecycle operations (spawn, terminate, hibernate, wake, transfer) explicitly require GovernanceRequest approval from Manager. Main agent enforces: "GOVERNANCE ENFORCEMENT: All destructive operations require GovernanceRequest approval." |
| **ai-maestro-architect-agent** | **COMPLIANT** | No governance operations defined. Requests agents through AMCOS, cannot create/delete directly. |
| **ai-maestro-orchestrator-agent** | **COMPLIANT** | Explicitly states "Create agents directly -> request via AMCOS". No autonomous governance. |
| **ai-maestro-integrator-agent** | **COMPLIANT** | No governance operations. Quality gates only, no agent lifecycle management. |
| **ai-maestro-programmer-agent** | **COMPLIANT** | Pure implementer, no governance operations. |
| **code-auditor-agent** | **COMPLIANT** | Pure auditor, no governance operations. Has no governance awareness at all (which is correct for its role). |

### Summary
- **6/6 repos are compliant** -- no autonomous governance bypass detected

---

## 4. Title vs Role Distinction

### Rule: "role" = plugin name / agent specialization. "title" = manager/chief-of-staff/member governance level. These must not be confused.

### Results

| Repo | Status | Details |
|---|---|---|
| **ai-maestro-chief-of-staff** | **COMPLIANT** | Correctly distinguishes governance roles (`manager`, `chief-of-staff`, `member`) from plugin roles (Orchestrator/EOA, Architect/EAA, etc.) in ROLE_BOUNDARIES.md. Uses "governance role" vs "plugin role" terminology. |
| **ai-maestro-architect-agent** | **OUTDATED** | ROLE_BOUNDARIES.md uses old terminology: "AMAMA" instead of "EAMA", says AMCOS is "project-independent (one per org)" instead of "team-scoped (one per team)". Does NOT mention governance titles (`manager`/`chief-of-staff`/`member`) at all. |
| **ai-maestro-orchestrator-agent** | **OUTDATED** | Same outdated ROLE_BOUNDARIES.md as architect. Uses "AMAMA", "project-independent (one per org)". No governance title concept. |
| **ai-maestro-integrator-agent** | **OUTDATED** | Same outdated ROLE_BOUNDARIES.md. Uses "AMAMA", "project-independent (one per org)". No governance title concept. |
| **ai-maestro-programmer-agent** | **OUTDATED** | Same outdated ROLE_BOUNDARIES.md. Uses "AMAMA", "project-independent (one per org)". No governance title concept. |
| **code-auditor-agent** | **N/A** | No `docs/` directory. No ROLE_BOUNDARIES.md. No governance awareness (acceptable for pure auditor). |

### Key Discrepancies Between CoS (Updated) and Others (Outdated)

| Aspect | CoS Version (Updated) | Other 4 Repos (Outdated) |
|---|---|---|
| Manager Name | EAMA | AMAMA |
| CoS Scope | Team-scoped (one per team) | Project-independent (one per org) |
| Governance Titles | manager / chief-of-staff / member | Not mentioned |
| Team Model | Closed teams with per-team CoS | Flat hierarchy, single CoS |

### Summary
- **Only 1/6 repos (CoS) has the current governance model**
- **4/6 repos have stale ROLE_BOUNDARIES.md** with the pre-v0.26.0 governance model
- The stale version would cause agents to operate under incorrect assumptions about team scope and manager identity

---

## 5. Naming Conventions (kebab-case)

### Rule: All names must be kebab-case.

### Results

| Repo | plugin.json name | Agent filenames | Agent frontmatter names | Skills | Status |
|---|---|---|---|---|---|
| ai-maestro-chief-of-staff | `ai-maestro-chief-of-staff` | `amcos-chief-of-staff-main-agent.md` | `amcos-chief-of-staff-main-agent` | `amcos-*` (all kebab) | **PASS** |
| ai-maestro-architect-agent | `ai-maestro-architect-agent` | `amaa-architect-main-agent.md` | `amaa-architect-main-agent` | `amaa-*` (all kebab) | **PASS** |
| ai-maestro-orchestrator-agent | `ai-maestro-orchestrator-agent` | `amoa-orchestrator-main-agent.md` | `amoa-orchestrator-main-agent` | `amoa-*` (all kebab) | **PASS** |
| ai-maestro-integrator-agent | `ai-maestro-integrator-agent` | `amia-integrator-main-agent.md` | `amia-integrator-main-agent` | `amia-*` (all kebab) | **PASS** |
| ai-maestro-programmer-agent | `ai-maestro-programmer-agent` | `ampa-programmer-main-agent.md` | `ampa-programmer-main-agent` | `ampa-*` (all kebab) | **PASS** |
| code-auditor-agent | `code-auditor-agent` | `caa-*.md` (all kebab) | `caa-*` (all kebab) | `caa-*` (all kebab) | **PASS** (naming is kebab, but repo name breaks `ai-maestro-*` convention) |

### Summary
- **6/6 repos use kebab-case** -- all pass the kebab-case check
- **1/6 repos (`code-auditor-agent`) breaks the `ai-maestro-*` prefix convention** used by all other role plugins

---

## Overall Severity Summary

| Finding | Severity | Repos Affected |
|---|---|---|
| Missing `.agent.toml` in ALL repos | **CRITICAL** | 6/6 |
| Main-agent filename/name mismatch with plugin.json | **CRITICAL** | 5/6 |
| No main-agent file at all (code-auditor) | **CRITICAL** | 1/6 |
| CoS spawning skill references wrong agent names (eoa- vs amoa-) | **HIGH** | 1/6 (affects all spawns) |
| Stale ROLE_BOUNDARIES.md (AMAMA vs EAMA, flat vs team-scoped) | **HIGH** | 4/6 |
| API abstraction violations (curl, endpoint URLs) | **HIGH** | 4/6 |
| CoS transfer-management has raw curl commands | **HIGH** | 1/6 |
| code-auditor repo name breaks `ai-maestro-*` convention | **MEDIUM** | 1/6 |
| Governance bypass (autonomous operations) | NONE | 0/6 |
| Kebab-case violations | NONE | 0/6 |

---

## Recommended Actions

1. **Create `.agent.toml` files** for all 6 repos, with `[agent].name` matching `plugin.json` `name`
2. **Rename main-agent files** to `<plugin-name>-main-agent.md` and update frontmatter `name` to match
3. **Add a main-agent file** to `code-auditor-agent`
4. **Fix CoS spawning skill** agent name references (`eoa-` -> actual prefix or new canonical names)
5. **Update ROLE_BOUNDARIES.md** in architect, orchestrator, integrator, programmer repos to match the CoS version (team-scoped model, EAMA naming, governance titles)
6. **Remove all curl/API syntax** from CoS skills (especially `amcos-transfer-management/references/transfer-procedures-and-examples.md`). Replace with references to global scripts (`aimaestro-agent.sh`, governance wrapper scripts)
7. **Remove localhost URLs** from orchestrator and programmer skills
8. **Consider renaming** `code-auditor-agent` to `ai-maestro-code-auditor-agent` for consistency
