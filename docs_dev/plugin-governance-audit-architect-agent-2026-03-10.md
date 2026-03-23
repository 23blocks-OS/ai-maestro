# Plugin Governance Audit: ai-maestro-architect-agent
**Date:** 2026-03-10
**Repo:** https://github.com/Emasoft/ai-maestro-architect-agent
**Version Audited:** 2.1.3 (plugin.json), 2.1.0 (README.md — mismatch)
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Summary

The `ai-maestro-architect-agent` plugin is **substantially compliant** with the Plugin Abstraction Principle, with a few violations that need correction. The most significant issues are:

1. Two skill files contain a hardcoded API endpoint in their error-handling tables (`/api/messages`) — a Rule 1 violation.
2. The `plugin.json` manifest does not declare the required global AI Maestro skills as dependencies.
3. README version (2.1.0) does not match plugin.json version (2.1.3).
4. The `plugin.json` description does not list which specific global AI Maestro skills are required.
5. Some skill Prerequisites sections say "AI Maestro running and API accessible" but reference the endpoint pattern `/api/messages` directly, coupling the skill to an internal API detail.

No Rule 2 violations were found: scripts correctly delegate to `amp-send` and `amp-inbox` CLI tools, not direct API calls. No hardcoded governance rules (Rule 3) were found. The Stop hook is clean.

---

## Violations Found

### Rule 1 Violations: Plugin Skills Embedding API Syntax

**Severity: Medium**

Two skill files contain a hardcoded API endpoint reference in their Error Handling tables:

| File | Line | Violation |
|------|------|-----------|
| `skills/amaa-design-communication-patterns/references/op-send-ai-maestro-message.md` | 135 | `\| \`404 Not Found\` \| Wrong endpoint \| Use \`/api/messages\` \|` |
| `skills/amaa-design-communication-patterns-ops/references/op-send-ai-maestro-message.md` | 135 | `\| \`404 Not Found\` \| Wrong endpoint \| Use \`/api/messages\` \|` |

These files are reference docs for the `amaa-design-communication-patterns` and `amaa-design-communication-patterns-ops` skills. They are near-identical duplicates (the `-ops` variant is a copy). Both contain an error table where the resolution for a 404 is to hardcode the endpoint path `/api/messages`. If the AI Maestro API endpoint changes, this guidance becomes incorrect and cannot be updated from the global `agent-messaging` skill without updating these plugin files too.

**No other API syntax (curl commands, `http://localhost:23000`, HTTP headers specific to AI Maestro) was found in any skill file.** All message-sending instructions correctly delegate to the `agent-messaging` skill by name without embedding curl syntax.

---

### Rule 4 Violations: Dependencies Not Declared

**Severity: Medium**

**4.1 — plugin.json missing dependency declarations**

File: `.claude-plugin/plugin.json`

```json
{
  "name": "ai-maestro-architect-agent",
  "version": "2.1.3",
  "description": "Design documents, requirements analysis, architecture decisions - creates specifications. Requires AI Maestro for inter-agent messaging.",
  "author": { ... },
  "repository": "...",
  "license": "MIT"
}
```

The description mentions "Requires AI Maestro for inter-agent messaging" but does not enumerate the specific global skills required. There is no `dependencies`, `requiredSkills`, or `requires` field. The following global AI Maestro skills are referenced throughout the plugin but not declared as dependencies:

- `agent-messaging` (referenced in all message-sending operations across all skills and agents)
- `ai-maestro-agents-management` (referenced in `docs/AGENT_OPERATIONS.md` line 32, 40)
- `team-governance` is NOT referenced (no team governance operations found — appropriate for this plugin's scope)

**4.2 — Version mismatch between plugin.json and README**

- `plugin.json`: version `2.1.3`
- `README.md`: version `2.1.0`

These must be kept in sync.

**4.3 — Some skill SKILL.md files have incomplete Prerequisites sections**

The `amaa-design-communication-patterns/SKILL.md` Prerequisites section (line 15-19) states:
```
- AI Maestro running and API accessible
- Reference documents present in `references/` directory
- Proper agent naming convention (domain-subdomain-name)
```

It correctly identifies the AI Maestro dependency but does not name the specific global skill (`agent-messaging`) that must be installed. By contrast, `op-send-ai-maestro-message.md` does correctly say "The `agent-messaging` skill available" in its own prerequisites — but that granularity should also be at the SKILL.md level.

---

## Items NOT Violations (Correctly Implemented)

### Rule 2 (Scripts/Hooks — PASS)

All scripts that send or receive messages delegate to global CLI tools:

- `scripts/amaa_send_message.py`: Calls `amp-send` via `subprocess.run` — correct
- `scripts/amaa_check_inbox.py`: Calls `amp-inbox` via `subprocess.run` — correct
- `hooks/hooks.json` Stop hook: Calls `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amaa_stop_check.py` — the stop check script uses `gh` CLI and local file checks only, no direct API calls
- No script calls `curl http://localhost:23000`, `requests.get`, `fetch(`, or any direct HTTP client against the AI Maestro API

The two `curl` references in scripts are:
- `scripts/amaa_download.py:296`: Downloads from GitHub releases — not an AI Maestro API call
- `scripts/lint_files.py:382-383`: Downloads Rust toolchain — not an AI Maestro API call

### Rule 3 (Governance Rules Discovered at Runtime — PASS)

No hardcoded governance rules, permission matrices, or role restrictions were found in any skill or hook that would lock in current AI Maestro governance behavior. The `docs/ROLE_BOUNDARIES.md` file documents the organizational role hierarchy but this is documentation of the system design (which role does what), not embedded permission checks in conditionals. The role boundary document is appropriate context documentation.

### Rule 1 (Skills Reference Global Skills by Name — MOSTLY PASS)

All message-sending instructions in skill files correctly reference the `agent-messaging` skill by name without embedding curl syntax. For example, all instances of sending messages follow the pattern:

> "Send a message using the `agent-messaging` skill with: **Recipient**: `...` **Subject**: `...` **Priority**: `...` **Content**: `{...}`"

This is the correct abstraction pattern.

### Manifest Presence — PASS

The `.claude-plugin/plugin.json` manifest exists.

### README Presence — PASS

The `README.md` is comprehensive (not a stub). It documents components, installation, workflow, validation, and platform requirements.

---

## Missing Items

| Item | Location | Severity |
|------|----------|----------|
| `dependencies` or `requiredSkills` field in plugin.json | `.claude-plugin/plugin.json` | Medium |
| `agent-messaging` skill listed as prerequisite in SKILL.md files that use it | `skills/amaa-design-communication-patterns/SKILL.md`, `skills/amaa-design-communication-patterns-ops/SKILL.md` | Low |
| Version sync between plugin.json (2.1.3) and README (2.1.0) | `README.md` | Low |

---

## Alignment Instructions

### Fix 1: Remove hardcoded `/api/messages` from error tables (Rule 1)

In both of these files:
- `skills/amaa-design-communication-patterns/references/op-send-ai-maestro-message.md`
- `skills/amaa-design-communication-patterns-ops/references/op-send-ai-maestro-message.md`

Replace line 135:
```
| `404 Not Found` | Wrong endpoint | Use `/api/messages` |
```
With:
```
| `404 Not Found` | Wrong endpoint or AI Maestro API changed | Consult the `agent-messaging` skill for current endpoint |
```

This removes the hardcoded endpoint reference while still being useful guidance.

### Fix 2: Add `requiredSkills` to plugin.json (Rule 4)

Update `.claude-plugin/plugin.json` to declare required global skills:
```json
{
  "name": "ai-maestro-architect-agent",
  "version": "2.1.3",
  "description": "Design documents, requirements analysis, architecture decisions - creates specifications. Requires AI Maestro for inter-agent messaging.",
  "author": {
    "name": "Emasoft",
    "email": "713559+Emasoft@users.noreply.github.com"
  },
  "repository": "https://github.com/Emasoft/ai-maestro-architect-agent",
  "license": "MIT",
  "requiredSkills": [
    "agent-messaging",
    "ai-maestro-agents-management"
  ]
}
```

Note: If the plugin manifest schema does not yet support `requiredSkills`, the description field should at minimum enumerate them: "Requires: agent-messaging, ai-maestro-agents-management global AI Maestro skills."

### Fix 3: Sync version between README and plugin.json (Rule 4)

Update `README.md` line 4 from `**Version**: 2.1.0` to `**Version**: 2.1.3` (or use a single source of truth and derive the README version from plugin.json during CI).

### Fix 4: Add named skill to SKILL.md Prerequisites (Rule 4)

In `skills/amaa-design-communication-patterns/SKILL.md` and `skills/amaa-design-communication-patterns-ops/SKILL.md`, update the Prerequisites section from:
```
- AI Maestro running and API accessible
```
To:
```
- AI Maestro running with `agent-messaging` global skill installed
```

---

## Appendix: Files Inspected

| File | Status |
|------|--------|
| `.claude-plugin/plugin.json` | Inspected — missing dependency declarations |
| `README.md` | Inspected — version mismatch |
| `hooks/hooks.json` | Inspected — clean |
| `scripts/amaa_send_message.py` | Inspected — correct (uses amp-send) |
| `scripts/amaa_check_inbox.py` | Inspected — correct (uses amp-inbox) |
| `scripts/amaa_stop_check.py` | Inspected — correct (uses gh CLI, no AI Maestro API calls) |
| `agents/amaa-architect-main-agent.md` | Inspected — correct |
| `docs/ROLE_BOUNDARIES.md` | Inspected — documentation only, no hardcoded checks |
| `skills/amaa-design-communication-patterns/SKILL.md` | Inspected — minor |
| `skills/amaa-design-communication-patterns/references/op-send-ai-maestro-message.md` | Inspected — Rule 1 violation at line 135 |
| `skills/amaa-design-communication-patterns/references/ai-maestro-message-templates.md` | Inspected — correct |
| `skills/amaa-design-communication-patterns-ops/references/op-send-ai-maestro-message.md` | Inspected — Rule 1 violation at line 135 |
| `skills/amaa-documentation-writing/SKILL.md` | Inspected — correct |
| `skills/amaa-session-memory/references/record-keeping-formats.md` | Inspected — note at line 330 explicitly warns against direct curl usage |
| All skills `**/*.md` — curl/API search | Searched — only technical/example references found, no AI Maestro API calls |
| All scripts `**/*.py` — API call search | Searched — no direct AI Maestro HTTP calls found |
