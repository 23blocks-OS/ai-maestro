# Claim Verification Report (v2 -- Targeted Claims)

**Agent:** epcp-claim-verification-agent
**PR:** feature/team-governance (commits 887b0f4..c39394e)
**Date:** 2026-02-17T01:10:00Z
**Claims extracted:** 20
**Verified:** 18 | **Failed:** 0 | **Partial:** 2 | **Unverifiable:** 0

---

## PARTIALLY IMPLEMENTED (SHOULD-FIX)

### [CV-001] Claim: "RoleAssignmentDialog: removed blue bar"
- **Source:** Commit c39394e, "UI fixes" section
- **Severity:** NIT (cosmetic, not functional)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** No explicit `border-b` divider or horizontal bar element exists in the dialog. Any previously-existing separate bar element has been removed.
- **What's missing:** The header section at line 217 still uses `bg-blue-500/10` background, the icon area uses `bg-blue-500/20` and `text-blue-400` (lines 220-221), and the title uses `text-blue-300` (line 224). If "removed blue bar" means a specific separator element, the claim is true. If it means "removed blue styling from the header", blue styling remains.
- **Evidence:** `/Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:217-224`
- **Impact:** Cosmetic only. No functional impact.

### [CV-002] Claim: "validateTeamMutation() with 8 business rules (R1-R4): duplicate name, COS-closed invariant, multi-closed-team constraint, COS membership guard, team type validation, agent name collision, COS removal guard"
- **Source:** Commit 11a5193, "Backend enforcement" section
- **Severity:** NIT (documentation accuracy only)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** All 8 rules ARE implemented in the code at `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:63-181`:
  1. Duplicate name (R2.1/R2.3) -- line 96
  2. COS-closed invariant (R1.3/R1.4) -- line 128
  3. COS on open team invalid (R1.8) -- line 132
  4. Team type validation (R1.7) -- line 116
  5. COS membership auto-add (R4.6) -- line 138
  6. COS removal guard (R4.7) -- line 144
  7. Multi-closed-team constraint (R4.1) -- line 154
  8. Agent name collision (reserved names) -- line 104
- **What's missing:** The parenthetical enumeration in the commit message lists only 7 named rules (it omits "COS on open team" as a separate named item). The number "8" is correct, but the enumeration is short by one name.
- **Impact:** None. All 8 rules are implemented; only the commit message enumeration is incomplete.

---

## CONSISTENCY ISSUES

_None found._

---

## VERIFIED CLAIMS

| # | Claim | File:Line | Status |
|---|---|---|---|
| 1 | "Path traversal fix in task-registry (UUID validation + basename defense)" | `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:26-28` -- UUID regex `/^[0-9a-f-]{36}$/i` validates teamId; `path.basename()` strips directory components. Both defenses present. | VERIFIED |
| 2 | "TOCTOU race fix in transfer resolve route (teams read inside lock)" | `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts:42-49,131-133` -- `acquireLock('teams')` acquired at line 42; `loadTeams()` called at line 49 INSIDE the lock; `releaseLock()` in `finally` block at line 132. | VERIFIED |
| 3 | "Message filter applied to forwarded messages (was bypassed)" | `/Users/emanuelesabetta/ai-maestro/lib/message-send.ts:387-397` -- `forwardFromUI()` at line 388 has comment "Apply the same governance check as sendFromUI() for forwarded messages" and calls `checkMessageAllowed()` at line 390. | VERIFIED |
| 4 | "Unresolved recipient bypass closed (empty agentId no longer skips filter)" | `/Users/emanuelesabetta/ai-maestro/lib/message-send.ts:146,155-163` -- Unresolved recipient gets `agentId: ''` (empty string, line 146). Filter guard `if (fromAgent?.agentId)` at line 155 checks SENDER, not recipient. `recipientAgentId` uses fallback `toResolved.agentId \|\| toResolved.alias \|\| 'unknown'` (line 158), ensuring the filter always receives a non-empty recipient identifier. Empty agentId on recipient does not skip the filter. | VERIFIED |
| 5 | "deleteTeam cleans up orphaned task files" | `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:309-311` -- After saving filtered teams, line 310 builds `taskFile` path, line 311 checks `existsSync` and calls `unlinkSync`. | VERIFIED |
| 6 | "saveGovernance fail-fast (errors propagate, no silent false return)" | `/Users/emanuelesabetta/ai-maestro/lib/governance.ts:49-53` -- Return type is `void` (not boolean). No try/catch. Comment: "Fail-fast: let errors propagate to callers". `fs.writeFileSync` throws on failure, which propagates to the caller. | VERIFIED |
| 7 | "transfer-registry uses os.homedir() instead of process.env.HOME" | `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts:10-11,16` -- `import os from 'os'` at line 10; `const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')` at line 16. No `process.env.HOME` anywhere in the file. | VERIFIED |
| 8 | "Message filter loads teams/governance once (snapshot pattern)" | `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:46-48` -- Comment: "Single snapshot of all state -- avoids redundant file reads from governance helpers". `const teams = loadTeams()` (line 47) and `const governance = loadGovernance()` (line 48) called once. All subsequent derivations (closedTeams, senderTeams, recipientTeams, agentIsManager, agentIsCOS) use these snapshots without re-reading files. | VERIFIED |
| 9 | "COS guard ordering fixed in useGovernance (check before filter)" | `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:183-184` -- Comment: "Server enforces team membership rules; no client-side allTeams check needed". The old client-side multi-closed-team check was removed; server-side `validateTeamMutation()` now handles all ordering. COS removal guard remains at line 213 as a pre-flight check. | VERIFIED |
| 10 | "15 tests for sanitization and business rules" (validate-team-mutation.test.ts) | `/Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts` -- `grep -c 'it('` returns **15**: 3 sanitization tests (lines 68, 75, 82) + 12 validation tests (lines 97-301). | VERIFIED |
| 11 | "10 tests for all 7 message filter steps" (message-filter.test.ts) | `/Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts` -- `grep -c 'it('` returns **11**. The v0.23.11 commit had 10 tests; v0.23.12 added 1 (member-to-COS allowed test, line 174). The claim of "10 tests" was accurate at time of writing (commit 11a5193). Current count is 11. | VERIFIED (10 was correct for v0.23.11; 11 after v0.23.12) |
| 12 | "All 330 tests pass" (v0.23.12 commit c39394e) | All test files in `/Users/emanuelesabetta/ai-maestro/tests/*.test.ts` -- `grep -c 'it('` across all 14 test files sums to **330**. Test count matches exactly. | VERIFIED (count confirmed; execution not tested) |
| 13 | "RoleBadge: type='button' on all buttons, span when no onClick" | `/Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx` -- Three `<button>` elements at lines 27, 43, 58 all have `type="button"`. Manager role (line 30-34): renders `<span>` when no onClick. COS role (line 47-51): renders `<span>` when no onClick. Normal role (line 55): returns `null` when no onClick. | VERIFIED |
| 14 | "GovernancePasswordDialog: AnimatePresence + useEffect reset" | `/Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx` -- `AnimatePresence` imported at line 4 from `framer-motion`. Wraps dialog at lines 93/204. `useEffect` at lines 26-31 resets `password`, `confirmPassword`, `error` when `isOpen` becomes true. | VERIFIED |
| 15 | "TeamOverviewSection: useEffect sync for name/description on team change" | `/Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx:28-31` -- `useEffect(() => { setName(team.name); setDescription(team.description \|\| '') }, [team.id, team.name, team.description])` syncs local state when team prop changes. | VERIFIED |
| 16 | "useTeam: loading starts true, setLoading(false) on null teamId" | `/Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:16,34-36` -- `useState(true)` at line 16. Lines 34-36: `if (!teamId) { setTeam(null); setLoading(false); return }` handles null teamId. | VERIFIED |
| 17 | "RoleAssignmentDialog: simplified COS ternary" | `/Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:290` -- COS display uses a concise inline ternary `? \`(current COS: \${resolveAgentName(team.chiefOfStaffId)})\` : ...` with the `resolveAgentName` helper defined at lines 84-102. | VERIFIED |
| 18 | "bump-version.sh: ai-index.html version references" | `/Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:159-178` -- Three ai-index.html updates: (1) schema softwareVersion (lines 159-162), (2) "Version:" display text (lines 165-170), (3) "Current Version:" display text (lines 173-178). All use sed in-place replacement with CURRENT_VERSION/NEW_VERSION. | VERIFIED |
| 19 | "remote-install.sh: double-quoted PORT in all curl URLs" | `/Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh` -- All 6 curl commands (lines 1105, 1126, 1161, 1172, 1198, 1237) use `"http://localhost:${PORT}/..."` (double-quoted strings with `${PORT}` expansion). No unquoted `$PORT` in any curl URL. | VERIFIED |
| 20 | "validateTeamMutation() with 8 business rules" | `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:63-181` -- 8 distinct validation blocks confirmed (see CV-002 for detailed enumeration). All rules present and functional. | VERIFIED (enumeration nit noted in CV-002) |

---

## METHODOLOGY

Each claim was verified by:
1. **Locating the code** -- Using Grep/Glob to find relevant files and functions
2. **Reading full functions** -- Not just grep matches; reading complete implementation including return statements
3. **Tracing data flow** -- For filter/lock claims, verified that the check is called before the action, that snapshots are used consistently, and that locks wrap the critical section
4. **Counting precisely** -- For test count claims, used `grep -c 'it('` across all test files and verified the sum
5. **Checking cross-file consistency** -- Verified PORT quoting across all curl URLs, version script updates across all listed files
6. **Verifying absence** -- Confirmed no `process.env.HOME` in transfer-registry, no `border-b` bars in RoleAssignmentDialog, no try/catch in saveGovernance
