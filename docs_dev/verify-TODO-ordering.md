# TODO Ordering Verification
**Generated:** 2026-02-27
**Files checked:**
1. `docs_dev/TODO-aimaestro-server-changes.md` (Server)
2. `docs_dev/TODO-aimaestro-plugin-changes.md` (Plugin)
3. `docs_dev/TODO-AMCOS-changes.md` (AMCOS)
4. `docs_dev/TODO-AMAMA-changes.md` (AMAMA)
5. `docs_dev/TODO-PSS-changes.md` (PSS)

---

## Summary

- **Total TODOs across all files: 93**
  - Server (TODO-S*): 6
  - Plugin (TODO-P*): 4
  - AMCOS (TODO-C*, TODO-PRE*): 54 (50 TODO-C* + 4 TODO-PRE*)
  - AMAMA (TODO-A*): 17
  - PSS (TODO-PSS*): 2
- **Dependency violations found: 2 (MINOR — see below)**

---

## TODO Counts by File

### Server (TODO-aimaestro-server-changes.md)
| ID | Title | Priority |
|----|-------|----------|
| TODO-S1 | Add Team-by-Name Lookup API Endpoint | P1 |
| TODO-S2 | Add `role` Subcommand to `agent-helper.sh` | P1 |
| TODO-S3 | Update `ai-maestro-agents-management` Skill to Use `aimaestro-agent.sh role` | P2 |
| TODO-S4 | GovernanceRequest AMP Notification on Status Change | P3 (Phase 2+) |
| TODO-S5 | Agent Registration Event System | P3 (Phase 2+) |
| TODO-S6 | Document Hook Fetch Exception in `ai-maestro-hook.cjs` | P2 |
**Subtotal: 6 TODOs**

### Plugin (TODO-aimaestro-plugin-changes.md)
| ID | Title | Priority |
|----|-------|----------|
| TODO-P1 | Add `role` Subcommand to `agent-helper.sh` | P1 |
| TODO-P2 | Replace Direct `curl` Example in `ai-maestro-agents-management/SKILL.md` | P1 |
| TODO-P3 | Add JSDoc Exception Comment to `ai-maestro-hook.cjs` | P3 |
| TODO-P4 | Extract Agent-by-CWD Lookup Helper (DEFERRED) | P3 |
**Subtotal: 4 TODOs**

### AMCOS (TODO-AMCOS-changes.md)
Pre-requisite bugs (TODO-PRE*): 4 items (PRE1–PRE4)
Group 1–11 TODOs (TODO-C*): 50 items (C1–C50)
**Subtotal: 54 TODOs**

### AMAMA (TODO-AMAMA-changes.md)
Fix TODOs (TODO-A*): 17 items (A1–A17, where A16 and A17 are harmonization items)
**Subtotal: 17 TODOs**

### PSS (TODO-PSS-changes.md)
| ID | Title | Priority |
|----|-------|----------|
| TODO-PSS1 | Replace Inline Index-Parsing Python Block with PSS Binary Search Flag | P1 |
| TODO-PSS2 | Replace Explicit gh API Endpoint Paths with Prose Instructions | P2 |
**Subtotal: 2 TODOs**

---

## Dependency Analysis

### Server → Plugin Dependencies (CORRECT)

The Plugin file explicitly acknowledges that TODO-S2 (server) is a prerequisite:
- `TODO-P1` (agent-helper.sh role function) → stated as "this is the prerequisite; server-side TODO-S2 mirrors this change"
- `TODO-P2` depends on "TODO-P1 (and TODO-S2 from server changes — the `role` subcommand must exist before the skill can teach it)"

The dependency graph in `TODO-aimaestro-plugin-changes.md` shows:
```
TODO-S2 (server: add role subcommand to aimaestro-agent.sh main CLI)
    └── TODO-P1 (plugin: add get_governance_role() to agent-helper.sh)
            └── TODO-P2 (skill: replace curl example with aimaestro-agent.sh role)
```

**Verdict: CORRECT — Plugin changes depend on Server changes as expected.**

### Server → AMCOS Dependencies

- `TODO-C1` (amcos-request-approval.md) depends on `team-governance` global skill gaining PATCH support (TODO-C49 upstream request). This is a global skill dependency, not a server TODO — **no direct dependency on a server TODO**.
- `TODO-C35`, `TODO-C36`, `TODO-C37` all depend on `TODO-C49` (PATCH support in team-governance skill).
- `TODO-C8` references `GET /api/teams` but no direct server TODO is listed as a dependency. **No violation** — the server already provides `GET /api/teams`; only the new `GET /api/teams/by-name/{name}` (TODO-S1) is new.

**MINOR ISSUE 1:** `TODO-C1` (AMCOS) notes it can use `GET /api/teams/by-name/{name}` but does NOT explicitly list `TODO-S1` as a dependency. This is an implicit dependency that should be explicit. AMCOS command `amcos-request-approval.md` is expected to call `GET /api/teams/by-name/{name}` (enabled by TODO-S1), but TODO-C1 lists its dependencies as only `TODO-PRE1`, `TODO-PRE2`.

### Server → AMAMA Dependencies

- None of the TODO-A* items reference any TODO-S* items explicitly.
- `TODO-A17` adds a conditional GovernanceRequest step referencing the `team-governance` skill with `POST /api/v1/governance/requests`. This call goes through the `team-governance` skill — correct abstraction.
- `TODO-A11` recommends using the `team-governance` skill to verify communication topology at runtime. No direct server TODO dependency.

**MINOR ISSUE 2:** `TODO-A17` (AMAMA harmonization) and `TODO-C35`/`TODO-C37` (AMCOS) both depend on the `team-governance` skill having PATCH support (captured as `TODO-C49`). However, TODO-A17 does NOT reference `TODO-C49` as a prerequisite. Since TODO-A17 is labeled P3 (harmonization, additive), this is low-severity — but the dependency should be noted.

### PSS Dependencies

Per the PSS file itself: "PSS has no server dependencies (zero curl calls to localhost, zero AI Maestro API calls)."
- `TODO-PSS1` depends on the PSS Rust binary gaining a `--search` flag (a PSS maintainer task, completely external to AI Maestro server).
- `TODO-PSS2` has no dependencies.

**Verdict: PSS correctly has no server or plugin dependencies.**

---

## Dependency Issues

### Issue 1: TODO-C1 (AMCOS) has implicit dependency on TODO-S1 not stated
- **Severity:** LOW
- **Detail:** `TODO-C1` in `TODO-AMCOS-changes.md` will eventually call `GET /api/teams/by-name/{name}`, which is created by `TODO-S1` in the server TODO file. The dependency is not listed in the `Depends on:` field of `TODO-C1`.
- **Impact:** If TODO-C1 is implemented before TODO-S1, the new endpoint is unavailable. However, since TODO-C1 currently just replaces API calls with `team-governance` skill references (prose), there is no immediate functional breakage — the actual endpoint call happens when the skill is invoked at runtime. Low impact.
- **Recommendation:** Add "TODO-S1 (for team-by-name lookup)" to the Depends-on field of TODO-C1.

### Issue 2: TODO-A17 (AMAMA) has implicit dependency on TODO-C49 not stated
- **Severity:** LOW
- **Detail:** `TODO-A17` adds a conditional step that references `POST /api/v1/governance/requests`. The AMCOS TODO file identifies `TODO-C49` as the blocker for full PATCH governance support. `TODO-A17` does not reference `TODO-C49`.
- **Impact:** TODO-A17 only adds a POST step (creating a request), not a PATCH step (resolving it). POST is already documented in the `team-governance` skill. Therefore the missing PATCH support (TODO-C49) does not block TODO-A17. Impact is minimal.
- **Recommendation:** Add a note to TODO-A17 that full bidirectional governance lifecycle (including resolution notification) also depends on PATCH support becoming available (tracked in TODO-C49 of AMCOS).

### No Critical Violations Found
No external plugin TODO depends on a non-existent server TODO. The only dependencies between files are correctly ordered:
- Plugin changes (TODO-P*) correctly list server changes (TODO-S*) as prerequisites.
- AMCOS and AMAMA changes use the `team-governance` and `ai-maestro-agents-management` skills as abstraction layers, not raw server TODOs.
- PSS changes are fully independent.

---

## Implementation Order

### Correct ordering as documented across the 5 files:

**Phase 1 (Server First — unblock everything else):**
1. `TODO-S2` — Add `role` subcommand to `agent-helper.sh` (no deps)
2. `TODO-S3` — Update skill to use `aimaestro-agent.sh role` (depends on S2)
3. `TODO-S1` — Create `GET /api/teams/by-name/{name}` endpoint (no deps)
4. `TODO-S6` — Document hook fetch exception (no deps, documentation only)

**Phase 2 (Plugin Second — depends on server S2/S3):**
5. `TODO-P1` — Add `get_governance_role()` to `agent-helper.sh` (depends on S2)
6. `TODO-P2` — Replace curl example in SKILL.md (depends on P1/S2)
7. `TODO-P3` — Add JSDoc exception comment to hook (independent)
8. `TODO-P4` — Extract agent-by-CWD helper (deferred, depends on P3)

**Phase 3 (External plugins — parallelizable with each other, after server is done):**

AMCOS pre-requisite bugs first (parallelizable):
9. `TODO-PRE1` — Fix EAMA recipient name inconsistency
10. `TODO-PRE2` — Unify approval type code schema
11. `TODO-PRE3` — Resolve recovery log path inconsistency
12. `TODO-PRE4` — Resolve approval timeout contradiction (depends on PRE2)

Then AMCOS P1 TODOs in parallel with AMAMA P1/P2 TODOs and PSS TODOs.

**Phase 4 (Future — Phase 2+):**
- `TODO-S4` — GovernanceRequest AMP notification (deferred)
- `TODO-S5` — Agent lifecycle event system (deferred)

---

## Harmonization Check

### AMCOS Harmonization
- **Harmonization TODOs in AMCOS file:** YES — multiple items explicitly labeled "Harmonization note" throughout the file. Specifically:
  - `TODO-C39` (P1): "Document approval-tracking.md YAML state as harmonized dual-write PRESERVE item" — this IS an explicit harmonization TODO.
  - `TODO-C35` has harmonization note: "This is an ADDITIVE change, not a replacement — see dual-write flow diagram."
  - All Group 7 (Permission Management) TODOs focus on harmonizing AMCOS approval system with AI Maestro GovernanceRequest API.
- **Result: AMCOS harmonization TODOs EXIST (embedded throughout Group 7 as harmonization notes and in TODO-C39).**

### AMAMA Harmonization
- **Harmonization TODOs in AMAMA file:** YES — explicitly listed as Priority 4 section:
  - `TODO-A16` (P3): "Add optional AI Maestro Request ID field to Approval Log format" — approval log harmonization.
  - `TODO-A17` (P3): "Add conditional GovernanceRequest step to approval-response-workflow" — workflow harmonization with AI Maestro governance.
- **Result: AMAMA harmonization TODOs EXIST (TODO-A16 and TODO-A17).**

**Harmonization check result:**
- [x] AMCOS approval harmonization TODO exists (TODO-C39, Group 7 harmonization notes)
- [x] AMAMA approval harmonization TODO exists (TODO-A16, TODO-A17)

---

## Cross-File Consistency Check

### Duplicate TODOs (TODO-S2 vs TODO-P1)
The server file (TODO-S2) and the plugin file (TODO-P1) both describe adding `get_governance_role()` to `agent-helper.sh`. This is intentional — they describe the SAME change from two different perspectives (the server TODO describes the behavioral contract; the plugin TODO describes the implementation detail). The plugin file's dependency graph explicitly says "TODO-S2 (server: add role subcommand) → TODO-P1 (plugin: add get_governance_role())". These are not duplicate TODOs but rather two TODO files that track the same change at different levels of abstraction.

**No conflict here — both files agree on what needs to happen. Implementer should treat S2 and P1 as the same task.**

### TODO-P3 vs TODO-S6 (JSDoc comment on ai-maestro-hook.cjs)
Same situation as above: both files describe adding a JSDoc exception comment to `ai-maestro-hook.cjs`. TODO-S6 (server file) and TODO-P3 (plugin file) are the same change described twice.

**No conflict — same task, same file. Implementer should treat S6 and P3 as the same task.**

---

## Verdict: PASS (with minor advisory notes)

The dependency ordering across all 5 TODO files is **CORRECT** with no critical violations:

1. Server TODOs (TODO-S*) have no external dependencies and are correctly placed first.
2. Plugin TODOs (TODO-P*) correctly depend on server TODOs (TODO-S2, TODO-S3) and are placed second.
3. External plugin TODOs (TODO-C*, TODO-A*, TODO-PSS*) correctly use skill abstraction layers (not raw server TODOs) as their dependencies, making them parallelizable after server work.
4. AMCOS pre-requisite bugs (TODO-PRE*) are correctly identified as internal bugs that must be fixed before abstraction work begins.
5. Harmonization entries exist for BOTH AMCOS (TODO-C39 + Group 7 harmonization notes) and AMAMA (TODO-A16, TODO-A17).
6. PSS TODOs are correctly identified as fully independent with no AI Maestro server dependencies.

**Advisory fixes recommended (not blockers):**
- Add `TODO-S1` to the `Depends on` field of `TODO-C1` (AMCOS).
- Add a note to `TODO-A17` (AMAMA) cross-referencing `TODO-C49` (AMCOS) for PATCH governance support.
- Implementers should be aware that `TODO-S2/TODO-P1` and `TODO-S6/TODO-P3` are duplicate descriptions of the same tasks across server and plugin TODO files.
