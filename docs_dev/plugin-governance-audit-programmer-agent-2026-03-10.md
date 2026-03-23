# Plugin Governance Audit: ai-maestro-programmer-agent
**Date**: 2026-03-10
**Repo**: https://github.com/Emasoft/ai-maestro-programmer-agent
**Version audited**: 1.0.16
**Audited against**: AI Maestro Plugin Abstraction Principle (docs/PLUGIN-ABSTRACTION-PRINCIPLE.md)

---

## Summary

The plugin is **substantially compliant** with the Plugin Abstraction Principle but has **3 concrete violations** that must be fixed before the plugin can be considered fully aligned. Additionally, the plugin.json manifest is missing two fields required for proper dependency declaration.

| Rule | Status | Details |
|------|--------|---------|
| Rule 1: No API syntax in skills | PARTIAL VIOLATION | 2 violations in skill files |
| Rule 2: No direct API calls in hooks/scripts | PASS | Hooks are empty; scripts contain only validation tooling with localhost strings in string literals used for security checks, not actual API calls |
| Rule 3: Governance rules discovered at runtime | PASS (with caveat) | Role boundaries are documented in a shared doc but not hardcoded as enforcement logic |
| Rule 4: Dependencies declared in plugin.json | VIOLATION | plugin.json missing `dependencies` and skill requirement fields |

---

## Violations Found

### VIOLATION 1 (Rule 1) — Hardcoded localhost URL + curl command in skill file

**File**: `skills/ampa-handoff-management/SKILL.md`
**Lines**: 24, 56

**Line 24** (Prerequisites section):
```
- **AI Maestro running** on `localhost:23000` for inter-agent messaging notifications.
```

**Line 56** (Error Handling table):
```
| AI Maestro notification fails | Verify running with `curl -s "http://localhost:23000/api/health"`, start if needed |
```

**Why it is a violation**: Skill files must NOT embed API syntax, endpoint URLs, or specific host:port addresses. The hardcoded `localhost:23000` and the `curl` diagnostic command directly reference the AI Maestro API endpoint. If the port or host changes in AI Maestro, this skill breaks silently. The skill should instead instruct the agent to use the `agent-messaging` skill's built-in health check or status check, rather than calling the API directly with curl.

**Severity**: Medium

---

### VIOLATION 2 (Rule 1) — Curl command for MCP server health check in README

**File**: `README.md`
**Line**: 188

```
2. Check MCP server is running: `curl http://localhost:PORT/health`
```

**Why it is a violation**: While README files are not skills, this diagnostic instruction teaches users to call service APIs directly with curl using hardcoded patterns. This conflicts with the Plugin Abstraction Principle's intent that all API interactions go through abstraction scripts. If a dedicated `check-mcp-status.sh` script existed in AI Maestro's global scripts, the README should reference that instead.

**Severity**: Low (README only, not in skill/hook/script that an agent would execute)

---

### VIOLATION 3 (Rule 4) — plugin.json missing dependency declarations

**File**: `.claude-plugin/plugin.json`

Current content:
```json
{
  "name": "ai-maestro-programmer-agent",
  "version": "1.0.16",
  "description": "General-purpose programmer agent that writes code, runs tests, and creates PRs. Works standalone or as part of the AI Maestro ecosystem. Ships 5 bundled skills and uses SERENA MCP for code navigation.",
  "author": { ... },
  "repository": "...",
  "license": "MIT"
}
```

**Missing fields**:
1. `dependencies.skills` — the plugin REQUIRES the globally installed `agent-messaging` skill (referenced pervasively in all 5 skills and the main agent definition). This dependency is never declared in plugin.json, so marketplace installers cannot verify it is present.
2. `mcpServers` — the plugin requires `serena-mcp` (declared only in the agent .md file frontmatter, not in the top-level manifest).
3. `dependencies.aiMaestroVersion` or `minVersion` — the plugin targets the AI Maestro ecosystem but declares no minimum version requirement.

**Why it is a violation**: Per Rule 4, the manifest description mentions "AI Maestro ecosystem" but does not formally declare the `agent-messaging` skill as a required dependency. Any installer or validator will not know to check for the prerequisite. The agent definition at `agents/ampa-programmer-main-agent.md` line 27 explicitly says `agent-messaging` skill MUST be globally installed, but this constraint is invisible at the manifest level.

**Severity**: Medium

---

## Missing Items

### 1. plugin.json — no `dependencies` block

The `plugin.json` should include:
```json
{
  "dependencies": {
    "skills": ["agent-messaging"],
    "mcpServers": ["serena-mcp"]
  }
}
```
(Exact field names should conform to whatever schema AI Maestro's marketplace validator uses; the key point is the dependency on `agent-messaging` must be declared.)

### 2. No `team-governance` skill reference in plugin.json description

The description does not mention that the plugin requires the `team-governance` skill to be globally installed for governance rule discovery. The main agent `.md` mentions governance indirectly through role boundary docs embedded locally (`docs/ROLE_BOUNDARIES.md`), but this is a static copy — it is NOT discovered at runtime from the `team-governance` skill. See "Governance Rule Concern" section below.

### 3. `/api/health` endpoint used for diagnostics — not routed through AI Maestro scripts

In `skills/ampa-handoff-management/SKILL.md:56`, the error handler instructs a direct `curl` health check against the AI Maestro API. No globally installed script wraps this operation (unlike `amp-inbox.sh`, `amp-send.sh`, etc.). A `aimaestro-status.sh` or similar script should be added to AI Maestro's global scripts, and the skill should reference that instead.

---

## Governance Rule Concern (Rule 3)

### Status: BORDERLINE — Not a hard violation, but requires attention

The plugin ships `docs/ROLE_BOUNDARIES.md` (v1.2.0, updated 2026-03-08) as a **static copy** of governance rules. The document itself states at the top:

> *"This is a shared cross-plugin document defining role boundaries for all agents in the AI Maestro ecosystem. It is distributed with each agent plugin for reference."*

This is NOT a violation of Rule 3 by itself, because the document is read-only reference material and the agent is explicitly instructed to use the globally installed `agent-messaging` skill for all actual messaging operations (not to enforce its own permission matrix).

However, the concern is: **if governance rules change in AI Maestro's `team-governance` skill, this static copy becomes stale**. The plugin would then contain outdated role boundary information. Per Rule 3, governance rules should be discovered at runtime from the `team-governance` skill.

**Recommendation**: Remove `docs/ROLE_BOUNDARIES.md` from the plugin and replace the reference in the main agent with an instruction to read the globally installed `team-governance` skill for role boundary information. Or, at minimum, add a note that this document is informational only and the authoritative source is the `team-governance` skill.

Similarly, `docs/TEAM_REGISTRY_SPECIFICATION.md` (v1.3.0) is another static copy of what could be considered governance/protocol rules. Same concern applies.

---

## What Is Correct and Well-Aligned

The following aspects are correctly implemented:

1. **All 5 skill SKILL.md files do NOT embed curl commands, API URLs, or HTTP headers** (except the one violation in `ampa-handoff-management/SKILL.md`). Skills correctly defer to the globally installed `agent-messaging` skill using natural language references like "use the `agent-messaging` skill to send a message."

2. **Reference files in skills use natural language instructions**, not curl patterns. For example, `skills/ampa-orchestrator-communication/references/op-notify-completion.md` includes a JSON block showing message content but explicitly notes: *"The structure below shows the conceptual message content. Use the `agent-messaging` skill to send messages - it handles the exact API format automatically."*

3. **hooks/hooks.json is empty** — no direct API calls in hooks. The comment confirms: *"AMPA uses globally installed hooks and skills, minimal local hooks needed."*

4. **scripts/ directory contains only validation tooling** (CPV scripts, linters, validators). The two `localhost` string literals found in `validate_mcp.py` are used as URL prefix patterns for a security classification check (local vs. remote MCP servers), not as actual API calls. The `curl` commands in `lint_files.py` are for installing toolchain packages (rustup), not for calling AI Maestro APIs.

5. **The main agent definition** (`agents/ampa-programmer-main-agent.md`) consistently references `agent-messaging` skill by name for all inter-agent communication and explicitly forbids direct contact with other agents.

6. **All communication examples across all reference files** use the pattern "Send using the `agent-messaging` skill" rather than embedding curl commands.

7. **README is substantive** — not a stub. It covers installation, modes, dependencies, troubleshooting, and workflow.

8. **No hardcoded governance enforcement logic** found in any script or hook. The ROLE_BOUNDARIES.md is reference material, not code.

---

## Alignment Instructions

### Fix 1 (REQUIRED — Rule 1 violation): Remove curl/localhost from skill file

**File**: `skills/ampa-handoff-management/SKILL.md`

**Line 24** — Change:
```
- **AI Maestro running** on `localhost:23000` for inter-agent messaging notifications.
```
To:
```
- **AI Maestro running** and reachable (verify using the `agent-messaging` skill's status check feature).
```

**Line 56** — Change:
```
| AI Maestro notification fails | Verify running with `curl -s "http://localhost:23000/api/health"`, start if needed |
```
To:
```
| AI Maestro notification fails | Check service status using the `agent-messaging` skill's health check; restart AI Maestro if needed |
```

---

### Fix 2 (REQUIRED — Rule 4 violation): Add dependency declarations to plugin.json

**File**: `.claude-plugin/plugin.json`

Add a `dependencies` block:
```json
{
  "name": "ai-maestro-programmer-agent",
  "version": "1.0.16",
  "description": "General-purpose programmer agent that writes code, runs tests, and creates PRs. Works standalone or as part of the AI Maestro ecosystem. Ships 5 bundled skills and uses SERENA MCP for code navigation. In orchestrated mode, requires the globally installed 'agent-messaging' skill.",
  "author": { ... },
  "repository": "...",
  "license": "MIT",
  "dependencies": {
    "globalSkills": ["agent-messaging"],
    "mcpServers": ["serena-mcp"]
  }
}
```

The field names `globalSkills` and `mcpServers` should be adjusted to match whatever schema the AI Maestro marketplace validator expects. The key requirement is that `agent-messaging` must be declared as a dependency.

---

### Fix 3 (RECOMMENDED — Rule 3 concern): Replace static governance docs with runtime skill references

**Files**: `docs/ROLE_BOUNDARIES.md`, `docs/TEAM_REGISTRY_SPECIFICATION.md`

These files are static copies of governance rules. To fully comply with Rule 3:

1. Remove these files from the plugin distribution (or move them to an `archive/` directory).
2. In `agents/ampa-programmer-main-agent.md`, replace the current "See `docs/ROLE_BOUNDARIES.md` for full role descriptions" reference with: "See the globally installed `team-governance` skill for role boundary information."
3. Instruct the agent to read the `team-governance` skill at initialization time, rather than from a bundled static document.

If removal is not immediately feasible, at minimum add a banner to both files:
```
> **NOTE**: This document is a reference copy only. The authoritative source for governance rules
> is the globally installed `team-governance` skill. This copy may be outdated.
```

---

### Fix 4 (RECOMMENDED): Remove or re-route the README curl diagnostic

**File**: `README.md`, line 188

Change:
```
2. Check MCP server is running: `curl http://localhost:PORT/health`
```
To:
```
2. Verify SERENA MCP is configured and running per your Claude Code MCP settings.
```

---

## File Reference Index

| File | Status | Notes |
|------|--------|-------|
| `.claude-plugin/plugin.json` | VIOLATION | Missing dependency declarations |
| `agents/ampa-programmer-main-agent.md` | PASS | Correctly uses agent-messaging skill by reference |
| `skills/ampa-task-execution/SKILL.md` | PASS | No API syntax violations |
| `skills/ampa-orchestrator-communication/SKILL.md` | PASS | Correctly delegates all messaging to agent-messaging skill |
| `skills/ampa-github-operations/SKILL.md` | PASS | No API syntax violations |
| `skills/ampa-project-setup/SKILL.md` | PASS | No API syntax violations |
| `skills/ampa-handoff-management/SKILL.md` | VIOLATION | Lines 24, 56: hardcoded localhost:23000 and curl command |
| `skills/ampa-*/references/*.md` | PASS | All use natural language delegation to agent-messaging skill |
| `hooks/hooks.json` | PASS | Empty, correct |
| `scripts/validate_mcp.py` | PASS | localhost strings are security classification constants, not API calls |
| `scripts/lint_files.py` | PASS | curl commands are for toolchain installation (rustup), not AI Maestro API |
| `docs/ROLE_BOUNDARIES.md` | CONCERN | Static copy of governance rules; should be sourced from team-governance skill at runtime |
| `docs/TEAM_REGISTRY_SPECIFICATION.md` | CONCERN | Static copy of registry/protocol rules |
| `README.md` | LOW | Line 188: curl diagnostic for MCP health check |
