# Step 7: CLI Governance Enforcement Report

**Date:** 2026-02-22
**Status:** DONE

## Summary

Added governance RBAC enforcement to CLI scripts (`agent-skill.sh`, `agent-plugin.sh`) using a centralized helper in `agent-helper.sh`.

## Changes Made

### 1. `agent-helper.sh` — New governance functions (after line 125)

**`check_config_governance(scope, target_agent_id)`**
- Resolves caller's agent ID from `$AIMAESTRO_AGENT` / `$SESSION_NAME`
- Queries `/api/governance` to get the manager ID
- If no manager set (governance inactive), allows the operation (Phase 1 backward compat)
- For `user`/`project` scope: only MANAGER allowed
- For `local` scope: MANAGER always allowed; also allows COS of a closed team containing the target agent
- COS check queries `/api/teams` and uses jq to check `.chiefOfStaffId` match + target in `.members[]`

**`_resolve_caller_agent_id()`**
- Helper that resolves the current agent's UUID from session name via `/api/messages?action=resolve`
- Returns empty string if no identity available (graceful Phase 1 fallback)
- Used by `cmd_skill_add` and `cmd_skill_remove` to build the `X-Agent-Id` header

### 2. `agent-skill.sh` — 4 functions updated

| Function | Change |
|----------|--------|
| `cmd_skill_add` | Added `_resolve_caller_agent_id()` call; conditionally adds `-H "X-Agent-Id: ..."` to curl POST; added 403/governance error detection |
| `cmd_skill_remove` | Same pattern: resolves caller ID, adds `X-Agent-Id` header to curl DELETE, handles 403 |
| `cmd_skill_install` | Added `check_config_governance "$scope" "$RESOLVED_AGENT_ID" || return 1` before filesystem operations |
| `cmd_skill_uninstall` | Added `check_config_governance "$scope" "$RESOLVED_AGENT_ID" || return 1` after `resolve_agent` |

### 3. `agent-plugin.sh` — 2 functions updated

| Function | Change |
|----------|--------|
| `cmd_plugin_install` | Added `check_config_governance "$scope" "$RESOLVED_AGENT_ID" || return 1` after `resolve_agent` (line 161) |
| `cmd_plugin_uninstall` | Added `check_config_governance "$scope" "$RESOLVED_AGENT_ID" || return 1` after `resolve_agent` (line 289) |

## Design Decisions

1. **Centralized governance function** — All scripts call `check_config_governance()` instead of duplicating logic
2. **Phase 1 backward compatibility** — When no `SESSION_NAME`/`AIMAESTRO_AGENT` is set, or no manager is configured, all operations are allowed
3. **API-based commands use headers** — `cmd_skill_add` and `cmd_skill_remove` pass `X-Agent-Id` header so the server can enforce governance server-side
4. **Filesystem commands use client-side check** — `cmd_skill_install`, `cmd_skill_uninstall`, `cmd_plugin_install`, `cmd_plugin_uninstall` call the governance API client-side before performing filesystem operations
5. **Graceful failures** — If API calls fail (network down, etc.), governance check returns 0 (allow) to avoid blocking operations when the server is unreachable

## Files Modified

- `plugin/plugins/ai-maestro/scripts/agent-helper.sh` — Added ~80 lines (two new functions)
- `plugin/plugins/ai-maestro/scripts/agent-skill.sh` — Modified 4 functions
- `plugin/plugins/ai-maestro/scripts/agent-plugin.sh` — Modified 2 functions
