# Plugin Cross-Reference Audit Report
**Date:** 2026-03-06
**Scope:** AI Maestro plugin at `plugin/plugins/ai-maestro/` vs server routes, install paths, env vars

---

## 1. API Endpoints: Plugin Scripts vs Server Route Table

### Endpoints called by plugin scripts (extracted from curl calls)

| Endpoint | Script(s) | Exists in Server? |
|----------|-----------|-------------------|
| `GET /api/agents` | agent-commands.sh, list-agents.sh | YES |
| `POST /api/agents` | agent-commands.sh | YES |
| `GET /api/agents/:id` | agent-commands.sh, agent-core.sh, agent-helper.sh | YES |
| `DELETE /api/agents/:id` | agent-commands.sh | YES |
| `PATCH /api/agents/:id` | agent-commands.sh (x3) | YES |
| `POST /api/agents/:id/hibernate` | agent-core.sh, agent-session.sh | YES |
| `POST /api/agents/:id/wake` | agent-core.sh, agent-session.sh | YES |
| `POST /api/agents/:id/session` | agent-session.sh | YES |
| `DELETE /api/agents/:id/session` | agent-session.sh | YES |
| `PATCH /api/agents/:id/session` | agent-session.sh | YES |
| `GET /api/agents/:id/skills` | agent-skill.sh | YES |
| `POST /api/agents/:id/skills` | agent-skill.sh | YES |
| `DELETE /api/agents/:id/skills/:skillId` | agent-skill.sh | YES |
| `POST /api/agents/:id/amp/addresses` | amp-register.sh | YES |
| `GET /api/agents/:id/export` | export-agent.sh | YES |
| `POST /api/agents/import` | import-agent.sh | YES |
| `POST /api/agents/:id/graph/code` (index-delta) | graph-index-delta.sh | YES |
| `GET /api/messages` | agent-helper.sh (resolve action) | YES |
| `GET /api/governance` | agent-helper.sh | YES |
| `GET /api/teams` | agent-helper.sh | YES |
| `GET /api/sessions` | agent-helper.sh (check_api_running) | YES |
| `GET /api/hosts/identity` | export-agent.sh, import-agent.sh, list-agents.sh | YES |
| `GET /api/organization` | amp-helper.sh | YES |
| `POST /api/v1/register` | amp-init.sh, amp-register.sh, amp-send.sh, amp-helper.sh | YES |
| `POST /api/v1/route` | amp-send.sh | YES |
| `GET /api/v1/messages/pending` | amp-fetch.sh (for AI Maestro provider) | YES |
| `DELETE /api/v1/messages/pending` | amp-fetch.sh (for AI Maestro provider) | YES |

### External provider endpoints (NOT AI Maestro server)

| Endpoint | Script | Notes |
|----------|--------|-------|
| `GET /v1/inbox` | amp-fetch.sh | External providers only (CrabMail etc.) |
| `POST /v1/inbox/:id/ack` | amp-fetch.sh | External providers only (CrabMail etc.) |

These are NOT bugs -- amp-fetch.sh correctly distinguishes AI Maestro local endpoints from external provider endpoints.

### FINDING F1: All plugin script API calls have matching server routes
No orphan API calls found. All endpoints called by plugin scripts exist in the headless router.

---

## 2. API Endpoints: Skills vs Server

### team-governance SKILL.md references

| Endpoint | Exists in Server? |
|----------|-------------------|
| `GET/POST /api/teams` | YES |
| `GET/PUT/DELETE /api/teams/:id` | YES |
| `POST /api/teams/:id/chief-of-staff` | YES |
| `GET /api/governance` | YES |
| `POST /api/governance/manager` | YES |
| `POST /api/governance/password` | YES |
| `GET /api/governance/reachable` | YES |
| `GET/POST /api/governance/transfers` | YES |
| `POST /api/governance/transfers/:id/resolve` | YES |
| `GET/POST/DELETE /api/governance/trust` | YES |
| `GET/POST /api/v1/governance/requests` | YES |
| `POST /api/v1/governance/requests/:id/approve` | YES |
| `POST /api/v1/governance/requests/:id/reject` | YES |
| `GET /api/agents` | YES |
| `GET /api/agents/:id` | YES |

### agent-messaging SKILL.md references

| Endpoint | Exists? | Notes |
|----------|---------|-------|
| `GET /api/governance` | YES | For determining role |
| `GET /api/teams` | YES | For team membership |

### ai-maestro-agents-management SKILL.md references

| Endpoint | Exists? |
|----------|---------|
| `GET /api/agents` | YES |
| `GET /api/governance` | YES |
| `GET /api/hosts/identity` | YES |

### docs-search, graph-query SKILL.md references

| Endpoint | Exists? |
|----------|---------|
| `GET /api/hosts/identity` | YES |

### FINDING F2: All skill-documented endpoints exist in the server
No orphan skill references found.

---

## 3. Headless Router vs Next.js Route Parity

### FINDING F3: `/api/teams/names` route is MISSING from headless-router.ts

The Next.js route `app/api/teams/names/route.ts` exists and serves `GET /api/teams/names` (returns team and agent names for collision checking in the Create Team dialog). This route is NOT present in `services/headless-router.ts`, meaning headless mode cannot serve this endpoint.

**Impact:** Low -- this is a UI-only endpoint used by the dashboard's Create Team dialog. Headless mode is API-only, so this endpoint is unlikely to be needed. But for parity, it should be added.

No other route parity issues were found between Next.js routes and the headless router for plugin-relevant endpoints.

---

## 4. Install Paths

### How scripts are installed

The `install-messaging.sh` script:
1. Copies ALL `amp-*.sh` scripts from `plugin/plugins/ai-maestro/scripts/` to `~/.local/bin/` (glob pattern, not explicit list)
2. Copies ALL other `*.sh` scripts from the same directory (except legacy messaging scripts)
3. Installs `shell-helpers/common.sh` from `scripts/shell-helpers/` to `~/.local/share/aimaestro/shell-helpers/`
4. Creates symlinks without `.sh` extension for convenience

### Scripts in plugin source vs installed

| Script | In Plugin Source | Installed to ~/.local/bin | Notes |
|--------|:---:|:---:|-------|
| aimaestro-agent.sh | YES (108 lines, modular) | YES (3877 lines, bundled) | **MISMATCH** - see F4 |
| agent-commands.sh | YES | NO | Module sourced by aimaestro-agent.sh |
| agent-core.sh | YES | NO | Module sourced by aimaestro-agent.sh |
| agent-helper.sh | YES | YES | MATCH |
| agent-plugin.sh | YES | NO | Module sourced by aimaestro-agent.sh |
| agent-session.sh | YES | NO | Module sourced by aimaestro-agent.sh |
| agent-skill.sh | YES | NO | Module sourced by aimaestro-agent.sh |
| ai-maestro-hook.cjs | YES | NO | Hook file, not a CLI script |
| amp-send.sh | YES | YES | **MISMATCH** - see F5 |
| amp-inbox.sh | YES | YES | **MISMATCH** - see F5 |
| amp-read.sh | YES | YES | MATCH |
| amp-reply.sh | YES | YES | MATCH |
| amp-delete.sh | YES | YES | Not checked |
| amp-download.sh | YES | YES | Not checked |
| amp-fetch.sh | YES | YES | Not checked |
| amp-helper.sh | YES | YES | Not checked |
| amp-identity.sh | YES | YES | Not checked |
| amp-init.sh | YES | YES | Not checked |
| amp-register.sh | YES | YES | Not checked |
| amp-security.sh | YES | YES | Not checked |
| amp-status.sh | YES | YES | Not checked |
| docs-*.sh (7 files) | YES | YES | Not individually checked |
| graph-*.sh (9 files) | YES | YES | Not individually checked |
| export-agent.sh | YES | YES | Not checked |
| import-agent.sh | YES | YES | Not checked |
| list-agents.sh | YES | YES | Not checked |
| memory-helper.sh | YES | YES | Not checked |
| memory-search.sh | YES | YES | Not checked |

### FINDING F4: aimaestro-agent.sh source vs installed are fundamentally different architectures

- **Source** (108 lines): Modular design that sources `agent-helper.sh`, `agent-core.sh`, `agent-commands.sh`, `agent-session.sh`, `agent-skill.sh`, `agent-plugin.sh` via `_source_module()` function
- **Installed** (3877 lines): Single bundled file containing all modules inline

The modular source version tries to find modules in `SCRIPT_DIR` first, then falls back to `~/.local/bin/`. However, agent-commands.sh, agent-core.sh, agent-session.sh, agent-skill.sh, agent-plugin.sh are **NOT installed to ~/.local/bin/**, so:

- If running from plugin source directory: works (finds modules in SCRIPT_DIR)
- If running from ~/.local/bin: the installed version is the bundled monolith, so it works differently
- **Problem**: The plugin source and installed copies are fundamentally different files. The source modular version would FAIL if copied as-is to ~/.local/bin because its module dependencies are not installed.

This indicates the install script was likely updated to copy a pre-bundled version instead of the modular source. The two versions may have diverged in functionality.

### FINDING F5: amp-send.sh and amp-inbox.sh installed copies differ from plugin source

**amp-send.sh** (source: 706 lines, installed: 707 lines):
- Source uses `if ! att_meta=$(upload_attachment ...)` pattern
- Installed uses `att_meta=$(...); if [ $? -ne 0 ]` pattern
- One-line difference, minor style divergence

**amp-inbox.sh** (source: 178 lines, installed: 174 lines):
- Source uses `jq @base64d` for base64 decoding (portable)
- Installed uses `base64 -d` (GNU-specific, fails on older macOS)
- Source has extra safety in `jq 'length'` with `|| echo "0"` fallback
- Source has additional comment lines explaining base64 encoding
- **The source version is NEWER and has portability fixes not present in the installed copy**

### FINDING F6: Module scripts not installed individually

The following module scripts are in the plugin but NOT installed to `~/.local/bin/`:
- `agent-commands.sh`
- `agent-core.sh`
- `agent-plugin.sh`
- `agent-session.sh`
- `agent-skill.sh`
- `ai-maestro-hook.cjs`

This is intentional for the bundled install model, but means running the modular `aimaestro-agent.sh` from plugin source directory won't find these modules at the fallback path.

---

## 5. Environment Variables

### Consistent defaults across scripts

| Variable | Default | Used In | Notes |
|----------|---------|---------|-------|
| `AMP_MAESTRO_URL` | `http://localhost:23000` | amp-helper.sh, amp-init.sh, amp-register.sh, amp-send.sh | CONSISTENT |
| `AIMAESTRO_API_BASE` | `""` (empty) | agent-helper.sh | Falls back to `get_api_base()` which calls `get_self_host_url()` from common.sh |
| `AIMAESTRO_AGENT` | N/A (no default) | agent-helper.sh | Falls back to `SESSION_NAME` |
| `SESSION_NAME` | N/A (no default) | agent-helper.sh | Fallback for AIMAESTRO_AGENT |

### FINDING F7: Two different API base URL resolution mechanisms

- **AMP scripts** use `AMP_MAESTRO_URL` (default: `http://localhost:23000`) directly
- **Agent management scripts** use `get_api_base()` from `common.sh` which checks `AIMAESTRO_API_BASE` then falls back to `get_self_host_url()` (reads `~/.aimaestro/hosts.json`)

These two mechanisms can produce different values:
- AMP scripts always default to `http://localhost:23000`
- Agent scripts discover the host URL dynamically from hosts.json
- If a user has a custom URL in hosts.json, AMP scripts won't use it unless `AMP_MAESTRO_URL` is explicitly set

This is a **design inconsistency** but not necessarily a bug since AMP scripts are designed for the local messaging protocol while agent scripts need to work across hosts.

### FINDING F8: get_api_base() defined in common.sh but NOT in plugin source tree

The function `get_api_base()` is defined in `scripts/shell-helpers/common.sh` (main ai-maestro project), NOT in the plugin submodule. The plugin's `agent-helper.sh` depends on it via:
```
source "${HOME}/.local/share/aimaestro/shell-helpers/common.sh"
```

This means:
- Plugin scripts have an external dependency on AI Maestro's `common.sh`
- If common.sh is not installed, agent management scripts will fail
- The plugin is not self-contained for agent management functionality

### Environment variables documentation

| Variable | Documented in CLAUDE.md? | Documented in Skills? |
|----------|:---:|:---:|
| `AIMAESTRO_API` | YES (deprecated reference) | NO |
| `AIMAESTRO_AGENT` | YES | NO |
| `AIMAESTRO_POLL_INTERVAL` | YES | NO |
| `AMP_MAESTRO_URL` | NO | NO |
| `AIMAESTRO_API_BASE` | NO | NO |
| `SESSION_NAME` | YES | NO |
| `AMP_MAESTRO_CALLBACK` | NO | NO |
| `AMP_LOCAL_DOMAIN` | NO | NO |
| `AMP_PROVIDER_DOMAIN` | NO | NO |

### FINDING F9: Several env vars undocumented

`AMP_MAESTRO_URL`, `AIMAESTRO_API_BASE`, `AMP_MAESTRO_CALLBACK`, `AMP_LOCAL_DOMAIN`, and `AMP_PROVIDER_DOMAIN` are used in scripts but not documented in CLAUDE.md or any skill file.

### No typos found in env var names
All environment variable references across scripts are consistent in spelling.

---

## 6. Summary of Findings

| ID | Severity | Finding |
|----|----------|---------|
| F1 | OK | All plugin script API calls have matching server routes |
| F2 | OK | All skill-documented endpoints exist in the server |
| F3 | LOW | `/api/teams/names` Next.js route missing from headless-router.ts |
| F4 | MEDIUM | aimaestro-agent.sh source (modular, 108 lines) vs installed (bundled, 3877 lines) are completely different architectures; possible functionality drift |
| F5 | MEDIUM | amp-send.sh and amp-inbox.sh installed copies are outdated vs plugin source (source has portability fixes for base64 decoding) |
| F6 | INFO | Agent module scripts (agent-commands.sh etc.) not individually installed; intentional for bundled model |
| F7 | LOW | Two different API base URL resolution mechanisms (AMP_MAESTRO_URL vs get_api_base()) could produce different values |
| F8 | MEDIUM | get_api_base() defined in common.sh outside the plugin submodule; plugin is not self-contained for agent management |
| F9 | LOW | Several env vars (AMP_MAESTRO_URL, AIMAESTRO_API_BASE, AMP_MAESTRO_CALLBACK, AMP_LOCAL_DOMAIN, AMP_PROVIDER_DOMAIN) undocumented |

### Recommended Actions

1. **F5**: Re-run `install-messaging.sh` to update installed scripts from plugin source (amp-inbox.sh portability fix is important for macOS)
2. **F4**: Verify bundled aimaestro-agent.sh at ~/.local/bin has all the same functionality as the modular source version; establish a build/bundle process to keep them in sync
3. **F3**: Add `/api/teams/names` to headless-router.ts for parity
4. **F7/F8**: Consider unifying the API base URL resolution mechanism, or at minimum document the difference
5. **F9**: Document all env vars in a single reference location (CLAUDE.md or a dedicated doc)
