# TODO: AI Maestro Plugin Changes
**Generated:** 2026-02-27
**Source:** `docs_dev/consolidated-aimaestro-violations-2026-02-27.md` — Section 2 "AI MAESTRO PLUGIN CHANGES"
**Plugin submodule root:** `plugin/plugins/ai-maestro/`

---

## Summary

The AI Maestro plugin scores 9/10 for compliance with the Plugin Abstraction Principle. Three changes are needed:

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| TODO-P1 | Add `role` subcommand to `agent-helper.sh` | P1 (HIGH) | TODO |
| TODO-P2 | Update `ai-maestro-agents-management/SKILL.md` to use `aimaestro-agent.sh role` | P1 (HIGH) | TODO (depends on TODO-P1 / TODO-S2) |
| TODO-P3 | Document hook fetch exception in `ai-maestro-hook.cjs` | P3 (LOW) | TODO |
| TODO-P4 | Extract repeated agent-by-CWD lookup into helper (future refactor) | P3 (LOW) | DEFERRED |

---

### TODO-P1: Add `role` Subcommand to `agent-helper.sh`
- **File:** `plugins/ai-maestro/scripts/agent-helper.sh`
- **Lines:** After line 202 (end of `check_config_governance()` function), insert new `get_governance_role()` function; also update the main command dispatcher to expose it as the `role` subcommand
- **Priority:** P1
- **Depends on:** None (this is the prerequisite; server-side TODO-S2 mirrors this change for `aimaestro-agent.sh` main script)
- **Current:** `agent-helper.sh` provides governance utility functions (`check_config_governance`, `_resolve_caller_agent_id`) but does NOT expose a user-facing `role` subcommand. Any caller wanting to check the agent's governance role must call `curl -s "http://localhost:23000/api/governance" | jq .` directly — a Rule 1 violation.
- **Change:** Add a new public function `get_governance_role()` to `agent-helper.sh` that:
  1. Reads `AIMAESTRO_API_BASE` (with fallback to `http://localhost:23000`)
  2. Calls `curl -s "${api_base}/api/governance"` (internal, within the abstraction layer — this is permitted)
  3. Derives the caller's role by comparing `.managerId` against the calling agent's ID
  4. Outputs a JSON object: `{"role": "manager"|"member"|"unset", "hasPassword": bool, "managerId": string|null}`
  5. Is also wired as the `role` subcommand in `aimaestro-agent.sh` (the main CLI dispatcher, which sources this file)

  Implementation sketch (insert after line 202 of `agent-helper.sh`):
  ```bash
  # Get the governance role of the current agent.
  # Outputs JSON: { role, hasPassword, managerId }
  # role is one of: "manager", "member", "unset"
  get_governance_role() {
    local api_base
    api_base=$(get_api_base 2>/dev/null) || api_base="${AIMAESTRO_API_BASE:-http://localhost:23000}"

    local agent_id
    agent_id=$(_resolve_caller_agent_id 2>/dev/null) || agent_id=""

    local gov_resp
    gov_resp=$(curl -s --max-time 10 "${api_base}/api/governance" 2>/dev/null) || {
      echo '{"role":"unset","hasPassword":false,"managerId":null}'; return 0
    }

    local has_manager manager_id has_password
    has_manager=$(echo "$gov_resp" | jq -r '.hasManager // false')
    manager_id=$(echo "$gov_resp" | jq -r '.managerId // empty')
    has_password=$(echo "$gov_resp" | jq -r '.hasPassword // false')

    local role="unset"
    if [[ "$has_manager" == "true" && -n "$manager_id" ]]; then
      if [[ -n "$agent_id" && "$agent_id" == "$manager_id" ]]; then
        role="manager"
      else
        role="member"
      fi
    fi

    jq -n --arg role "$role" --argjson hp "$has_password" --arg mid "${manager_id:-}" \
      '{"role":$role,"hasPassword":$hp,"managerId":($mid | if . == "" then null else . end)}'
  }
  ```

  Then in `aimaestro-agent.sh` (the main CLI script that sources `agent-helper.sh`), add `role` to the command dispatcher:
  ```bash
  role) get_governance_role ;;
  ```

- **Verify:**
  1. Run `aimaestro-agent.sh role` with AI Maestro running — it must return valid JSON with `role`, `hasPassword`, `managerId` fields
  2. Run with `AIMAESTRO_API_BASE=http://localhost:23000 aimaestro-agent.sh role`
  3. Run without AI Maestro running — it must return `{"role":"unset","hasPassword":false,"managerId":null}` (graceful fallback), not an error
  4. Run `grep -r 'curl.*localhost:23000/api/governance' plugin/plugins/ai-maestro/skills/` — must return nothing after TODO-P2 is applied

---

### TODO-P2: Replace Direct `curl` Example in `ai-maestro-agents-management/SKILL.md`
- **File:** `plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`
- **Lines:** Line 48 (the line `- Check your governance role: \`curl -s "http://localhost:23000/api/governance" | jq .\``)
- **Priority:** P1
- **Depends on:** TODO-P1 (and TODO-S2 from server changes — the `role` subcommand must exist before the skill can teach it)
- **Current:** Line 48 teaches the user to call the API directly:
  ```
  - Check your governance role: `curl -s "http://localhost:23000/api/governance" | jq .`
  ```
  This is the **only** direct API curl example in any AI Maestro skill file. It violates Rule 1 of the Plugin Abstraction Principle (skills must not embed raw API endpoint syntax).
- **Change:** Replace line 48 with the CLI-based equivalent:
  ```
  - Check your governance role: `aimaestro-agent.sh role`
  ```
  The surrounding context (lines 44–48 of the "What this means for you" bullet list) should remain unchanged. Only line 48 is modified.
- **Verify:**
  1. Run `grep -rn 'curl.*localhost:23000' plugin/plugins/ai-maestro/skills/` — must return zero results
  2. Confirm the skill now reads: `- Check your governance role: \`aimaestro-agent.sh role\``
  3. Confirm `aimaestro-agent.sh role` (from TODO-P1) actually returns the governance role when run

---

### TODO-P3: Add JSDoc Exception Comment to `ai-maestro-hook.cjs`
- **File:** `plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
- **Lines:** Insert after line 14 (the closing `*/` of the existing file-level JSDoc block), before line 16 (`const fs = require('fs');`)
- **Priority:** P3
- **Depends on:** None
- **Current:** The hook makes 6 direct `fetch()` calls to `http://localhost:23000` (lines 50, 69, 127, 142–143, 169, 199–200) with no explanation of why this bypasses the Plugin Abstraction Principle. Future maintainers may flag these as violations and attempt to refactor them into shell subprocess calls, which would break the hook's 5-second timeout constraint.

  The 6 calls are:
  | Line | Endpoint | Purpose |
  |------|----------|---------|
  | ~50 | `GET /api/agents` | Find agent by working directory |
  | ~69 | `POST /api/sessions/activity/update` | Broadcast status update |
  | ~127 | `GET /api/agents` | Find agent matching CWD (in `sendMessageNotification`) |
  | ~142–143 | `POST /api/sessions/{name}/command` | Send message notification via tmux |
  | ~169 | `GET /api/agents` | Check unread messages (agent lookup) |
  | ~199–200 | `GET /api/messages?agent=...` | Fetch unread messages |

- **Change:** Add the following JSDoc block immediately after the existing file header comment block (after line 14, before `const fs = require('fs');`):

  ```javascript
  /**
   * PLUGIN ABSTRACTION EXCEPTION: This hook uses direct fetch() calls instead of
   * wrapping them in aimaestro-* scripts. This is an acceptable exception because:
   *
   * 1. Hooks run in Node.js context only (no CLI subprocess available during hook execution)
   * 2. Hooks have strict timeout constraints (~5s before git hangs the operation)
   * 3. No global abstraction layer exists yet for hook→API calls
   * 4. Subprocess overhead (spawning aimaestro-agent.sh via child_process) would exceed timeout
   *
   * Affected fetch calls:
   * - GET  /api/agents                       (broadcastStatusUpdate, sendMessageNotification, checkUnreadMessages)
   * - POST /api/sessions/activity/update     (broadcastStatusUpdate)
   * - POST /api/sessions/{name}/command      (sendMessageNotification)
   * - GET  /api/messages?agent=...           (checkUnreadMessages)
   *
   * When hook abstraction is added (Phase 2+), migrate these fetch calls
   * to use the hook-aware API wrapper instead.
   *
   * See: docs/PLUGIN-ABSTRACTION-PRINCIPLE.md, Section "Layer 0 Hook Exception"
   */
  ```

  No code changes are required. This is a documentation-only change.

- **Verify:**
  1. Confirm the JSDoc block appears at the top of the file, after the original header comment and before `const fs = require('fs');`
  2. Run `node --check plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` — must report no syntax errors
  3. Confirm the 6 existing `fetch()` calls are unchanged (lines should shift by the number of lines added, but code is identical)

---

### TODO-P4: Extract Agent-by-CWD Lookup Helper (DEFERRED — Future Sprint)
- **File:** `plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
- **Lines:** ~50, ~127, ~169 (three identical or near-identical agent-by-CWD lookup blocks)
- **Priority:** P3
- **Depends on:** TODO-P3 (document exception first; refactor second)
- **Current:** The same agent-lookup-by-working-directory pattern is repeated 3 times across `broadcastStatusUpdate()`, `sendMessageNotification()`, and `checkUnreadMessages()`. Each block fetches `/api/agents`, then `Array.find()` with identical CWD matching logic (exact match, subdirectory, parent-directory cases).
- **Change:** Extract into a shared async helper:
  ```javascript
  async function findAgentByCwd(cwd) {
      const resp = await fetch('http://localhost:23000/api/agents');
      if (!resp.ok) return null;
      const data = await resp.json();
      return (data.agents || []).find(a => {
          const agentWd = a.workingDirectory || a.session?.workingDirectory;
          if (!agentWd) return false;
          if (agentWd === cwd) return true;
          if (cwd.startsWith(agentWd + '/')) return true;
          if (agentWd.startsWith(cwd + '/')) return true;
          return false;
      }) || null;
  }
  ```
  Then replace the 3 duplicated blocks with `const agent = await findAgentByCwd(cwd);`.
- **Verify:**
  1. Run `node --check plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
  2. Manually trigger a Claude Code hook event and confirm status broadcast still works
  3. Confirm the 3 duplicated lookup blocks are replaced by `findAgentByCwd()` calls

---

## Dependency Graph

```
TODO-S2 (server: add role subcommand to aimaestro-agent.sh main CLI)
    └── TODO-P1 (plugin: add get_governance_role() to agent-helper.sh)
            └── TODO-P2 (skill: replace curl example with aimaestro-agent.sh role)

TODO-P3 (hook: document exception) ── independent
    └── TODO-P4 (hook: extract helper) ── deferred, no blocker
```

---

## Acceptance Criteria (All TODOs)

| Check | Command | Pass Condition |
|-------|---------|---------------|
| Zero curl in skills | `grep -r 'curl ' plugin/plugins/ai-maestro/skills/` | No output |
| `role` command works | `aimaestro-agent.sh role` | Returns JSON with `role`, `hasPassword`, `managerId` |
| Graceful fallback | Run `role` with AI Maestro stopped | Returns `{"role":"unset","hasPassword":false,"managerId":null}` |
| Hook syntax valid | `node --check plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` | Exit code 0 |
| Hook exception documented | Read top of `ai-maestro-hook.cjs` | JSDoc block present before `const fs = require` |
| Skill updated | `grep 'curl.*governance' plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` | No output |

---

*Source: Section 2 of `docs_dev/consolidated-aimaestro-violations-2026-02-27.md`*
