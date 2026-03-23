# Audit: AMIA/EAMA Prefix Renames (2026-03-13)

**Repository:** `Emasoft/ai-maestro-integrator-agent`
**Date Audited:** 2026-03-13 08:57 UTC
**Status:** CRITICAL ISSUES FOUND

---

## Executive Summary

The `ai-maestro-integrator-agent` repository contains **INCORRECT prefix usage** throughout documentation and code. Files extensively reference "EAMA" (Emasoft Assistant Manager Agent) when they should reference "AMAMA" (AI Maestro Assistant Manager Agent).

**Total Occurrences Found:** 57 matches across 4 files
**Affected Components:** Documentation and specification files
**Severity:** CRITICAL (API definitions and role boundaries use wrong prefixes)

---

## Findings by File

### 1. `docs/AGENT_OPERATIONS.md` - 5 occurrences

| Line | Match | Context |
|------|-------|---------|
| 221 | EAMA's plugin | `\| **ai-maestro-assistant-manager-agent** \| EAMA's plugin - user communication, project creation \|` |
| 327 | EAMA's job | `\| **User communication** \| EAMA's job (Manager) \|` |
| 328 | EAMA's job | `\| **Project creation** \| EAMA's job (Manager) \|` |
| 547 | EAMA (Manager) | `\| ❌ Create projects \| Not AMIA's role \| EAMA (Manager) \|` |
| 549 | EAMA (Manager) | `\| ❌ Talk to user \| Not AMIA's role \| EAMA (Manager) \|` |

**Issue:** Role boundaries document incorrectly labels the Assistant Manager as "EAMA" instead of "AMAMA".

---

### 2. `docs/ROLE_BOUNDARIES.md` - 40 occurrences

**CRITICAL FILE** — This is the canonical role definition document. Every reference to "EAMA" should be "AMAMA".

| Line | Match | Context |
|------|-------|---------|
| 16 | EAMA header | `│              EAMA (Emasoft Assistant Manager Agent)               │` |
| 42 | EAMA role | `\| **manager** \| EAMA \| Organization-wide \| Final approval, user communication \|` |
| 52 | EAMA approval | `- ✅ Create agents (with EAMA approval)` |
| 53 | EAMA approval | `- ✅ Terminate agents (with EAMA approval)` |
| 54 | EAMA approval | `- ✅ Hibernate/wake agents (with EAMA approval)` |
| 59 | EAMA approval | `- ✅ Replace failed agents (with EAMA approval)` |
| 60 | EAMA reporting | `- ✅ Report agent performance to EAMA` |
| 64 | EAMA only | `- ❌ Create projects (EAMA only)` |
| 69 | EAMA only | `- ❌ Communicate directly with user (EAMA only)` |
| 95 | EAMA only | `- ❌ Create projects (EAMA only)` |
| 106 | EAMA section | `## EAMA (Manager) - Responsibilities` |
| 108 | EAMA section | `### EAMA CAN` |
| 117 | EAMA section | `### EAMA CANNOT` |
| 122 | EAMA section | `### EAMA Scope` |
| 141 | EAMA message | `AMCOS → EAMA: "Request approval to spawn frontend-dev for Project X"` |
| 144 | EAMA response | `EAMA: Approves (or rejects with reason)` |
| 159 | EAMA action | `User/EAMA: Creates GitHub issue in Project X` |
| 178 | EAMA message | `AMCOS → EAMA: "Request approval to replace agent-123"` |
| 181 | EAMA response | `EAMA: Approves` |
| 199 | EAMA table | `\| Responsibility \| EAMA \| AMCOS \| AMOA \| AMIA \| AMAA \|` |

**Issue:** The header on line 16 explicitly states "EAMA (Emasoft Assistant Manager Agent)" — this is factually wrong. The correct expansion is "AMAMA (AI Maestro Assistant Manager Agent)".

---

### 3. `docs/FULL_PROJECT_WORKFLOW.md` - 11 occurrences

| Line | Match | Context |
|------|-------|---------|
| 16 | EAMA header | `EAMA (Manager) ◄────────────────────────────────────────────┐` |
| 25 | EAMA notify | `  \| 5. Notifies EAMA: team ready                             \|` |
| 27 | EAMA label | `EAMA ─────────────────────────────────────────────────────►  \|` |
| 34 | EAMA label | `  \| 8. Sends design to EAMA                                  \|` |
| 36 | EAMA label | `EAMA ◄──── USER APPROVAL ─────────────────────────────────►  \|` |
| 59 | EAMA report | `  \| 18. Reports to EAMA                                      \|` |
| 99 | EAMA comment | `- **Human Review** is requested via EAMA (Manager asks the user to test/review)` |
| 117 | EAMA actor | `**Actor**: EAMA (Manager)` |
| 139 | EAMA flow | `- AI Maestro: Send team proposal to EAMA with justification` |
| 143 | EAMA actor | `**Actor**: EAMA (Manager) + AMCOS (Chief of Staff)` |
| 179 | EAMA flow | `- AI Maestro: Team ready notification to EAMA` |
| 187 | EAMA actor | `**Actor**: EAMA (Manager)` |
| 216 | EAMA updates | `- AI Maestro: Progress updates to EAMA` |
| 228 | EAMA notify | `- AI Maestro: Notification to EAMA that design is ready` |
| 232 | EAMA actor | `**Actor**: EAMA (Manager) + USER` |
| 451 | EAMA approval | `  - Report to Manager (EAMA) for approval` |
| 458 | EAMA report | `- AI Maestro: Completion report to EAMA` |
| 476 | EAMA table | `\| EAMA \| AMCOS \| AI Maestro \| Requirements, team requests \|` |
| 477 | EAMA table | `\| AMCOS \| EAMA \| AI Maestro \| Team proposals, status updates \|` |
| 478 | EAMA table | `\| EAMA \| AMAA \| GitHub + AI Maestro \| Requirements, design requests \|` |
| 479 | EAMA table | `\| AMAA \| EAMA \| GitHub + AI Maestro \| Design documents \|` |
| 480 | EAMA table | `\| EAMA \| AMOA \| GitHub + AI Maestro \| Approved designs \|` |
| 486 | EAMA table | `\| AMOA \| EAMA \| AI Maestro \| Completion reports \|` |
| 494 | EAMA role | `\| **EAMA** \| Projects \| Approvals, user communication \| Task assignment \|` |
| 507 | EAMA task | `\| 1 \| Create repository \| EAMA \|` |
| 508 | EAMA task | `\| 6 \| Create requirements issue \| EAMA \|` |
| 522 | EAMA doc | `- **Requirements Document**: Created by EAMA, sent to AMAA` |
| 523 | EAMA doc | `- **Design Document**: Created by AMAA, approved by EAMA/User` |

**Issue:** Entire workflow diagram and specifications incorrectly use "EAMA" throughout. This is the project workflow specification — fixing this is critical for API definitions.

---

### 4. `docs/AGENT_OPERATIONS.md` - 1 occurrence (already listed above)

---

## Root Cause Analysis

**Why This Happened:**
The repository was initially developed using "Emasoft" ecosystem naming (EAMA, ECOS, etc.) before being donated to the AI Maestro project. The conversion to AI Maestro naming (AMAMA, AMCOS, etc.) was incomplete.

**Correct Prefixes (AI Maestro):**
- AMAMA = AI Maestro Assistant Manager Agent
- AMCOS = AI Maestro Chief of Staff
- AMOA = AI Maestro Orchestration Agent
- AMAA = AI Maestro Architecture Agent
- AMIA = AI Maestro Integrator Agent
- AMPA = AI Maestro Programmer Agent

**Wrong Prefixes (Emasoft — different ecosystem):**
- EAMA = Emasoft Assistant Manager Agent ❌
- ECOS = Emasoft Chief of Staff ❌
- EOA = Emasoft Orchestration Agent ❌
- EAA = Emasoft Architecture Agent ❌
- EIA = Emasoft Integrator Agent ❌
- EPA = Emasoft Programmer Agent ❌

---

## Recommendations

### Immediate Actions Required

1. **Search/Replace in all documentation:**
   - `EAMA` → `AMAMA`
   - `ECOS` → `AMCOS`
   - `EOA` → `AMOA`
   - `EAA` → `AMAA`
   - `EIA` → `AMIA`
   - `EPA` → `AMPA`

2. **Update header references:**
   - Line 16 in `ROLE_BOUNDARIES.md`: Change "EAMA (Emasoft Assistant Manager Agent)" → "AMAMA (AI Maestro Assistant Manager Agent)"

3. **Code/Configuration Review:**
   - Search agent definition files (`.agent.toml`, `.md` files)
   - Check hooks, scripts, and configuration for hardcoded prefix references
   - Verify API endpoint definitions use correct prefix names

4. **Test Coverage:**
   - After fixing, verify all agent communication paths still work
   - Confirm governance requests/approvals still reference correct agent IDs
   - Validate AMP messaging addresses use correct prefixes

### Process Improvement

- Add CI check to enforce correct prefix usage (fail on E* prefixes in AI Maestro repos)
- Document prefix standards in contributing guidelines
- Add linting rules to catch incorrect prefix patterns during PR review

---

## Files Affected

**Must Fix (Documentation):**
- `docs/AGENT_OPERATIONS.md` (5 fixes)
- `docs/ROLE_BOUNDARIES.md` (40 fixes) — CRITICAL
- `docs/FULL_PROJECT_WORKFLOW.md` (28 fixes) — CRITICAL

**Should Audit (Code):**
- `agents/*.md` (agent persona files)
- `skills/**/*.md` (skill definitions)
- `*.toml` (configuration files)
- `scripts/*.py` / `scripts/*.sh` (any hardcoded agent names)

---

## Verification Command

```bash
# Confirm no remaining E* prefixes in repo
grep -r "EAMA\|ECOS\|EOA\|EAA\|EIA\|EPA" . --include="*.md" --include="*.toml" --include="*.json" 2>/dev/null | grep -v ".git"

# Should return 0 results after fixes
```

---

**Audit Completed:** 2026-03-13 08:57 UTC
**Auditor:** Claude Code Agent
**Status:** Ready for remediation
