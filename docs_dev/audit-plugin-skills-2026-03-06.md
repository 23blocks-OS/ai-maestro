# AI Maestro Plugin Skills Audit Report
**Date:** 2026-03-06
**Scope:** All 7 skill files in `plugin/plugins/ai-maestro/skills/`

---

## Summary

| Skill | Issues Found |
|-------|-------------|
| agent-messaging | 4 |
| ai-maestro-agents-management | 5 |
| docs-search | 3 |
| graph-query | 3 |
| memory-search | 2 |
| planning | 1 |
| team-governance | 9 |
| **Total** | **27** |

---

## 1. agent-messaging (SKILL.md)

### F1.1 - YAML: Missing `user-invocable` field
- Only `planning` has `user-invocable: true`. The agent-messaging skill is clearly user-invocable (users say "check my inbox", "send a message"). Should have `user-invocable: true`.

### F1.2 - Command naming: `amp-identity` vs `amp-identity.sh`
- Line 22: Uses `amp-identity` (no .sh extension)
- Line 27: Uses `amp-init --auto` (no .sh extension)
- Lines 53, 59, etc.: Uses `amp-send`, `amp-inbox`, etc. (no .sh extension)
- The actual scripts in `scripts/` are named `amp-identity.sh`, `amp-init.sh`, `amp-send.sh`, etc.
- The SKILL drops the `.sh` extension throughout. This is **inconsistent with docs-search and graph-query skills** which use the `.sh` extension (e.g., `docs-search.sh`, `graph-describe.sh`).
- **However**, the installed scripts at `~/.local/bin/` exist both with and without `.sh` extension, so this may be intentional. Still inconsistent across skills.

### F1.3 - Missing `amp-security.sh` documentation
- The script `amp-security.sh` exists in the scripts directory but is not mentioned anywhere in the agent-messaging skill. If it's a user-facing script, it should be documented.

### F1.4 - Stale CLAUDE.md reference in "Persisting Identity"
- Lines 436-445: Suggests adding identity info to project CLAUDE.md. This pattern may be outdated now that AMP has per-agent `IDENTITY.md` files.

---

## 2. ai-maestro-agents-management (SKILL.md)

### F2.1 - YAML: Missing `user-invocable` field
- This skill is clearly user-invocable ("create agent", "list agents", etc.). Should have `user-invocable: true`.

### F2.2 - Script source path inconsistency
- Line 953: States modules are in `plugin/src/scripts/` (source). But actual source location is `plugin/plugins/ai-maestro/scripts/`. The `plugin/src/scripts/` path does not exist.

### F2.3 - Missing `export-agent.sh` and `import-agent.sh` cross-reference
- Scripts `export-agent.sh` and `import-agent.sh` exist in the scripts directory as standalone scripts, separate from `aimaestro-agent.sh`. The skill only documents the `aimaestro-agent.sh export/import` subcommands. It's unclear if both paths work or if the standalone scripts are legacy.

### F2.4 - Missing `list-agents.sh` cross-reference
- `list-agents.sh` exists as a standalone script but is not documented. Is this a legacy script or an alternative entry point?

### F2.5 - Version string: `2.0.0` vs `1.0.0`
- This is the only skill at version `2.0.0`. All others are at `1.0.0` (or `"1.0"` for team-governance). Not necessarily wrong, but worth noting the inconsistency.

---

## 3. docs-search (SKILL.md)

### F3.1 - YAML: Missing `user-invocable` field
- Users can explicitly ask to "search docs" or "find documentation". Should have `user-invocable: true`.

### F3.2 - Installer reference: `./install-doc-tools.sh`
- Lines 222 and 241: References `./install-doc-tools.sh` with relative path. The actual installer is at `/Users/emanuelesabetta/ai-maestro/install-doc-tools.sh` (project root). Relative path only works if CWD is the project root.

### F3.3 - Helper script location inconsistency
- Line 214: States helper is in `plugin/src/scripts/` (source). Actual source location is `plugin/plugins/ai-maestro/scripts/`. Same issue as F2.2.

---

## 4. graph-query (SKILL.md)

### F4.1 - YAML: Missing `user-invocable` field
- Users can ask to "find callers" or "check dependencies". Should have `user-invocable: true`.

### F4.2 - Installer reference path
- Line 145 and 153: References `~/ai-maestro/install-graph-tools.sh`. This hardcodes the AI Maestro install location. Should use a more portable reference or note it depends on the install location.

### F4.3 - Helper script location inconsistency
- Line 145: States helper is in `plugin/src/scripts/` (source). Actual source location is `plugin/plugins/ai-maestro/scripts/`. Same issue as F2.2 and F3.3.

---

## 5. memory-search (SKILL.md)

### F5.1 - YAML: Missing `user-invocable` field
- Users can ask to "search memory" or "what did we discuss". Should have `user-invocable: true`.

### F5.2 - Helper script location inconsistency
- Line 137: States helper is in `plugin/src/scripts/` (source). Actual source location is `plugin/plugins/ai-maestro/scripts/`. Same issue as F2.2, F3.3, F4.3.

---

## 6. planning (SKILL.md)

### F6.1 - Templates present and correct
- All 3 templates exist in `skills/planning/templates/`: `task_plan.md`, `findings.md`, `progress.md`. GOOD.
- `${CLAUDE_SKILL_DIR}` is correctly used for template paths. GOOD.
- `user-invocable: true` is correctly set. GOOD.
- `allowed-tools` includes Read, Write, Edit, Bash, Glob, Grep -- appropriate for a planning skill.

### F6.2 - Minor: allowed-tools broader than other skills
- This is the only skill with `allowed-tools: Read, Write, Edit, Bash, Glob, Grep`. All other skills use only `allowed-tools: Bash`. This is appropriate for the planning skill's file management nature, but worth noting the difference. NOT A BUG.

---

## 7. team-governance (SKILL.md)

### F7.1 - YAML: Version format inconsistency
- Uses `version: "1.0"` (quoted string, two-part). All other skills use `version: 1.0.0` or `version: 2.0.0` (three-part semver). Should be `version: "1.0.0"` for consistency.

### F7.2 - YAML: Missing `user-invocable` field
- Users can ask to "create a team" or "assign agent to team". Should have `user-invocable: true`.

### F7.3 - Permission matrix inconsistency: "Message any agent (AMP)"
- Line 213: First permission matrix shows "Message any agent (AMP)" as allowed for ALL roles including Normal Agent. But the Message Filtering Rules section (lines 441-483) clearly shows Normal closed-team agents CANNOT message agents outside their team. The first matrix is misleading -- it seems to show unrestricted AMP messaging for normal agents, which contradicts the detailed rules later.

### F7.4 - Duplicate Transfer Protocol section
- Lines 345-404: "Agent Transfers (Between Teams)" section with Bearer auth and `X-Agent-Id`
- Lines 486-552: "Transfer Protocol" section that duplicates much of the same info but with slightly different syntax
  - First section: Uses `Authorization: Bearer $API_KEY` + `X-Agent-Id: $AGENT_UUID`
  - Second section: Uses only `X-Agent-Id: <your-agent-id>` without Bearer auth
  - Second section: Includes `requestedBy` in the body (line 509) AND uses `X-Agent-Id` header
  - First section: States `requestedBy` is derived from headers (line 367)
  - This is contradictory and confusing. One approach should be canonical.

### F7.5 - Transfer create: inconsistent auth pattern
- Lines 355-364: Transfer create uses `Authorization: Bearer $API_KEY` + `X-Agent-Id`
- Lines 500-511: Transfer create uses only `X-Agent-Id` and puts `requestedBy` in body
- These two patterns cannot both be correct. The actual API should be checked to determine which is canonical.

### F7.6 - Transfer resolve: inconsistent body
- Lines 386-390: Approve uses `{"action": "approve"}` (no resolvedBy)
- Lines 531-533: Approve uses `{"action": "approve", "resolvedBy": "<your-agent-id>"}` (includes resolvedBy)
- Line 403 says "resolvedBy is derived from authenticated agent identity (headers)" which contradicts line 533.

### F7.7 - Governance requests: missing auth headers
- Lines 654-669: Cross-host governance request examples don't include `password` field in the submit example, but line 299 says `password` is required. The cross-host example at line 657 omits the `password` field entirely.

### F7.8 - Governance requests approve: inconsistent auth
- Lines 316-324: Approve uses body `{"approverAgentId": ..., "password": ...}`
- Lines 667-669: Cross-host approve uses header `X-Agent-Id` without password in body
- These are two different auth patterns for the same endpoint.

### F7.9 - Direct API calls violate Plugin Abstraction Principle
- The entire team-governance skill embeds raw `curl` commands with hardcoded `http://localhost:23000` URLs. Per the CLAUDE.md Plugin Abstraction Principle, this is the exception because this IS the AI Maestro plugin providing canonical syntax. However, the skill does not mention that other plugins should NOT copy these patterns -- they should reference this skill by name instead.

---

## Cross-Skill Issues

### CS1 - Script naming convention: `.sh` vs no extension
- **agent-messaging**: Uses commands WITHOUT `.sh` extension (e.g., `amp-send`, `amp-inbox`)
- **docs-search**: Uses commands WITH `.sh` extension (e.g., `docs-search.sh`, `docs-index.sh`)
- **graph-query**: Uses commands WITH `.sh` extension (e.g., `graph-describe.sh`)
- **memory-search**: Uses commands WITH `.sh` extension (e.g., `memory-search.sh`)
- **team-governance**: Uses `amp-send` without `.sh` extension in broadcast examples (lines 180, 191)
- The AMP commands consistently drop `.sh`; other skills keep it. This is inconsistent but may be intentional if the AMP installer creates extension-less symlinks.

### CS2 - Source path `plugin/src/scripts/` referenced in 4 skills
- docs-search, graph-query, memory-search, ai-maestro-agents-management all reference `plugin/src/scripts/` as the source location. The actual path is `plugin/plugins/ai-maestro/scripts/`. This is a systemic error across 4 skills.

### CS3 - Only `planning` has `user-invocable: true`
- All 7 skills appear user-invocable (users can trigger them with natural language). Only `planning` has the field set. The other 6 skills should either add `user-invocable: true` or document why they don't need it.

### CS4 - Messaging consistency between agent-messaging and team-governance
- agent-messaging correctly uses `amp-send` pattern for messaging
- team-governance broadcast section (lines 170-193) correctly uses the same `amp-send` pattern
- No inconsistency here. GOOD.

### CS5 - API endpoint cross-references
- `/api/teams` -- EXISTS (route.ts confirmed)
- `/api/teams/{id}` -- EXISTS
- `/api/teams/{id}/chief-of-staff` -- EXISTS
- `/api/governance` -- EXISTS
- `/api/governance/manager` -- EXISTS
- `/api/governance/password` -- EXISTS
- `/api/governance/reachable` -- EXISTS
- `/api/governance/trust` -- EXISTS
- `/api/governance/transfers` -- EXISTS
- `/api/governance/transfers/{id}/resolve` -- EXISTS
- `/api/v1/governance/requests` -- EXISTS
- `/api/v1/governance/requests/{id}/approve` -- EXISTS
- `/api/v1/governance/requests/{id}/reject` -- EXISTS
- `/api/agents` -- EXISTS
- All API endpoints referenced in skills have corresponding route files. GOOD.

---

## Priority Ranking

### HIGH (should fix before next release)
1. **F7.4/F7.5/F7.6** - Duplicate Transfer Protocol sections with contradictory auth patterns
2. **F7.3** - Misleading "Message any agent" in first permission matrix
3. **CS2** - Wrong source path `plugin/src/scripts/` in 4 skills (affects troubleshooting)

### MEDIUM (should fix soon)
4. **F7.7/F7.8** - Governance request auth inconsistencies
5. **CS3** - Missing `user-invocable: true` on 6 skills
6. **F7.1** - Version format inconsistency ("1.0" vs "1.0.0")
7. **CS1** - Script naming `.sh` vs no extension inconsistency across skills

### LOW (nice to fix)
8. **F1.3** - `amp-security.sh` undocumented
9. **F2.3/F2.4** - Standalone legacy scripts undocumented
10. **F1.4** - Stale CLAUDE.md persistence suggestion
11. **F3.2** - Relative installer path
12. **F4.2** - Hardcoded `~/ai-maestro/` install path
