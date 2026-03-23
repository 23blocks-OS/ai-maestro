# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:41:23.409Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/research-governance-multihost-20260220.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/research-governance-multihost-20260220.md
Line 19: The governance system is **entirely localhost-scoped** and has **zero host-awareness**. Every governance component (password, manager role, teams, ACL, message filter, transfers) operates on local files with no concept of host identity. The agent registry *does* have host-awareness (`hostId`, `hostName`, `hostUrl`), but none of the governance modules consume or check these fields. In a multi-host mesh, governance rules would be **silently unenforced** for cross-host interactions, creating security bypasses and data inconsistency.
Line 81: - Line 81: `"Phase 1: No lock on read. Minor TOCTOU with setPassword(). Acceptable for single-user localhost."`
Line 88: - Line 88-89: `"Phase 1 (localhost-only): timing difference between 'no password' and 'wrong password' is accepted risk. No remote attackers can observe timing in this deployment model."`
Line 95: - Lines 95, 120, 129, 140, 149, 160: All repeat `"Phase 1: Re-reads governance.json per call. Acceptable for localhost."`
Line 100: - **CRITICAL:** Each host has its own `governance.json`. If Host A sets Agent X as MANAGER, Host B has no knowledge of this. Host B's `isManager(agentId)` returns `false` for Agent X.
Line 103: - **CRITICAL:** Each host has its own password. There is no mechanism to sync governance passwords across hosts.
Line 104: - **CRITICAL:** The `isChiefOfStaff()` function delegates to `getTeam()` from team-registry (also local file). COS status is invisible to other hosts.
Line 120: - Lines 37-41: `"KNOWN LIMITATION (Phase 1, localhost-only): Any local process that omits X-Agent-Id gets full access, not just the web UI."`
Line 123: - **CRITICAL:** `checkTeamAccess` calls `isManager()` which reads local `governance.json`. A MANAGER appointed on Host A is not recognized on Host B. The ACL check on Host B would deny the MANAGER.
Line 126: - **CRITICAL:** `getTeam()` reads local `teams.json`. If Host B does not have the same teams file, all team-based ACL checks fail or return incorrect results.
Line 149: - **CRITICAL:** Non-null sender checks call `loadGovernance()` and `loadTeams()` which read local files. If Host B routes a message where the sender is the MANAGER (according to Host A's governance.json), Host B does not know this and applies normal-agent rules, potentially blocking the message.
Line 152: - **CRITICAL:** The COS-to-COS bridge (`agentIsCOS(senderAgentId)`) checks `closedTeams.some(t => t.chiefOfStaffId === id)` against local teams. A COS on Host A sending to a COS on Host B would not be recognized if teams are not replicated.
Line 165: - **CRITICAL:** Teams are stored locally per host. Host A's teams are invisible to Host B.
Line 170: - **CRITICAL:** There is no mechanism to sync team state across hosts. If Agent X is added to a closed team on Host A, Host B does not know this and will not enforce messaging isolation for that agent.
Line 173: - **MODERATE:** The `validateTeamMutation()` function checks multi-closed-team constraints against local teams only. An agent could be in closed teams on multiple hosts without either host detecting the violation.
Line 196: - **CRITICAL:** The agent registry knows about hosts, but governance ignores this entirely. When `governance.ts` stores `managerId: string`, it stores a bare UUID with no host qualifier. If the MANAGER agent is on Host A, Host B cannot determine which host the MANAGER lives on.
Line 199: - **CRITICAL:** Team `agentIds[]` are bare UUIDs. The team registry does not know which host each agent belongs to. A team could theoretically reference agents from multiple hosts, but no governance check validates or handles this.
Line 202: - The `loadAgents()` function returns all agents including remote ones cached in the local registry. But governance functions only check `governance.json` and `teams.json` which are local-only.
Line 216: Uses `getAgent(id)` which searches the local registry (including cached remote agents). But `setManager()` writes to local `governance.json` only.
Line 227: This includes remote agents from `loadAgents()`, but `checkMessageAllowed()` only checks local governance state. A remote agent in a closed team on Host B would not be blocked by Host A's message filter (because Host A's `loadTeams()` does not have Host B's teams).
Line 231: - **CRITICAL:** Setting a MANAGER on Host A does not propagate to Host B. Each host has independent governance state.
Line 233: - **CRITICAL:** Reachable agents computation mixes local and remote agents but applies only local governance rules.
Line 235: - **CRITICAL:** Transfer requests are purely local — there is no mechanism to transfer an agent between teams on different hosts.
Line 244:   fromName: 'AI Maestro',
Line 253: - **MODERATE:** Team notifications silently skip remote agents. If a closed team contains agents from multiple hosts, only local agents receive notifications.
Line 255: - **CRITICAL:** All team CRUD operations (create, update, delete) operate on local `teams.json` only. No sync with other hosts.
Line 257: - `createNewTeam()` calls `loadAgents().map(a => a.name)` for name collision checks, which includes cached remote agents. But the created team is stored locally only.
Line 274: - **CRITICAL:** Transfer requests are local-only. There is no mechanism to request or approve a transfer involving teams or agents on other hosts.
Line 276: - **CRITICAL:** When a transfer is approved, `resolveTransferReq()` in governance-service.ts modifies local `teams.json`. If the source or destination team is on another host, the transfer silently fails or produces inconsistent state.
Line 296: | `governance.json` (password, managerId) | NO | Each host has independent password and MANAGER. No sync. | CRITICAL |
Line 297: | `teams.json` (teams, COS, membership) | NO | Each host has independent teams. No replication. | CRITICAL |
Line 300: | `lib/governance.ts` (isManager, isChiefOfStaff) | NO | Role checks use local files. Remote roles invisible. | CRITICAL |
Line 301: | `lib/team-acl.ts` (checkTeamAccess) | NO | ACL checks use local governance + teams. Remote state invisible. | CRITICAL |
Line 302: | `lib/message-filter.ts` (checkMessageAllowed) | PARTIAL | Mesh-forwarded messages (null sender) blanket-denied for closed teams. Non-null sender checks use local state only. | CRITICAL |
Line 303: | `lib/team-registry.ts` (CRUD) | NO | All operations read/write local files. No cross-host sync. | CRITICAL |
Line 305: | `services/governance-service.ts` | NO | All governance API logic reads local state. `getReachableAgents` mixes local/remote agents with local-only rules. | CRITICAL |
Line 317: 3. **Governance config replication** — On governance changes (password set, manager assigned), broadcast via AMP to all peer hosts. Receiving hosts update their local `governance.json`.
Line 330: 2. **File-based state with no replication** — All governance state (`governance.json`, `teams.json`, `governance-transfers.json`) is stored in local files read synchronously. There is no pub/sub, no event bus, and no replication. Adding multi-host support requires either (a) centralizing state on one host, (b) adding a replication layer, or (c) replacing file storage with a distributed store.
Line 342: 5. **Timing-safe password verification** — The code explicitly accepts timing leaks as safe because "no remote attackers can observe timing in this deployment model." In a multi-host mesh (especially over Tailscale/WireGuard), remote attackers on the VPN could theoretically observe timing differences.
Line 348: 2. **Medium term