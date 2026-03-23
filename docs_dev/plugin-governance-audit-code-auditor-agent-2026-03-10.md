# Plugin Governance Audit: code-auditor-agent
**Date:** 2026-03-10
**Audited repo:** https://github.com/Emasoft/code-auditor-agent
**Plugin version:** 3.1.22
**AI Maestro version context:** feature/team-governance branch (port 23000)
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Summary

The `code-auditor-agent` plugin (formerly `ai-maestro-code-auditor-agent`, renamed per CHANGELOG) is a code auditing dependency plugin that provides two pipelines: a six-phase PR review pipeline and a ten-phase codebase audit pipeline. It installs 11 agents, 3 skills, and 1 slash command.

**Overall governance alignment status: ALIGNED — ready to install with minor notes.**

No critical governance violations found. The plugin is fully self-contained, uses no AI Maestro internal APIs, defines no Claude Code hooks (only dev-only git hooks), and has no name collisions with existing AI Maestro agents or skills.

---

## Integration Status

### 1. Plugin Manifest (`.claude-plugin/plugin.json`)

Status: **PRESENT and VALID**

The manifest exists at `.claude-plugin/plugin.json` and contains all required fields:

| Field | Value | Assessment |
|-------|-------|------------|
| `name` | `code-auditor-agent` | Valid, unique, no collision |
| `version` | `3.1.22` | Semver-compliant |
| `description` | Full pipeline description | Accurate, matches README |
| `author.name` | `Emasoft` | Present |
| `author.email` | `713559+Emasoft@users.noreply.github.com` | Present |
| `homepage` | GitHub URL | Present |
| `repository` | GitHub URL | Present |
| `license` | `MIT` | Present |
| `keywords` | 11 keywords | Present |

The manifest does NOT declare hooks, MCP servers, or runtime configuration — it is a pure content plugin (agents + skills + command).

**Missing optional but recommended fields:** `minClaudeVersion`, `engines` (node/claude version constraints). These are optional per the plugin spec but useful for future-proofing.

### 2. Hardcoded AI Maestro Internal References

Status: **CLEAN — no violations**

A comprehensive grep across all `.md` and `.py` files for the following patterns found zero violations:
- `localhost:23000` — not found
- AI Maestro API endpoints (`/api/v1/`, `/api/messages`, `/api/sessions`) — not found
- `AIMAESTRO_API` env var — not found
- `amp-send.sh`, `amp-inbox.sh`, `amp-read.sh` — not found (these AMP scripts are NOT called by this plugin)
- `team-governance` skill — not found (not referenced)
- `aimaestro-agent.sh` — not found

The single occurrence of `23000` in agent files is a template example in `caa-claim-verification-agent.md`:
```
- **Config values** — If a config file says `port: 23000`, do all references use 23000?
```
This is generic instructional text about checking config consistency (port 23000 is used as an example of any port number), not a hardcoded reference to AI Maestro's API.

The only `localhost` reference is in `scripts/validate_mcp.py` line 218 as a string literal inside a validation function that checks if MCP server URLs are properly formed — it is not making API calls.

**Finding: No AI Maestro internal API dependencies. The plugin is correctly self-contained.**

### 3. Conflict with AI Maestro Skills or Hooks

Status: **NO CONFLICTS**

**Skills provided by this plugin:**
- `caa-pr-review-skill`
- `caa-pr-review-and-fix-skill`
- `caa-codebase-audit-and-fix-skill`

Cross-checked against all currently installed AI Maestro skills in `~/.claude/skills/`. No name overlaps found.

The `caa-` prefix namespace is consistent across all agents, skills, and commands — it effectively namespaces the plugin away from any AI Maestro resources.

**Hooks:**
The plugin contains a `git-hooks/` directory with `pre-commit` and `pre-push` Python scripts. These are **development-only git hooks** for the plugin's own repository, not Claude Code `PreToolUse`/`PostToolUse`/`Stop` hooks. They are installed only when a developer runs `uv run python scripts/setup_git_hooks.py` inside the plugin repo itself. They do NOT get deployed to users' Claude Code environments and present zero conflict risk.

The plugin declares no Claude Code hooks in its manifest and has no `hooks/` directory at the plugin root (only `git-hooks/`).

### 4. Conflict with AI Maestro Agents

Status: **NO CONFLICTS**

**Agents provided by this plugin (all prefixed `caa-`):**
- `caa-claim-verification-agent`
- `caa-code-correctness-agent`
- `caa-consolidation-agent`
- `caa-dedup-agent`
- `caa-domain-auditor-agent`
- `caa-fix-agent`
- `caa-fix-verifier-agent`
- `caa-security-review-agent`
- `caa-skeptical-reviewer-agent`
- `caa-todo-generator-agent`
- `caa-verification-agent`

Cross-checked against all currently installed AI Maestro agents in `~/.claude/agents/`. No name overlaps found.

### 5. Usability by AI Maestro Agents

Status: **COMPATIBLE — works without conflicts**

AI Maestro agents can invoke this plugin's skills via natural language triggers:
- `"review PR 206"` → `caa-pr-review-skill`
- `"review and fix PR 206"` → `caa-pr-review-and-fix-skill`
- `"/audit-codebase"` → `caa-audit-codebase-cmd` → `caa-codebase-audit-and-fix-skill`

The plugin follows the Plugin Abstraction Principle correctly for a dependency plugin:
- It does NOT embed AI Maestro API syntax in its skills or agents
- It does NOT call AI Maestro scripts (`aimaestro-agent.sh`, `amp-*.sh`)
- It does NOT hardcode governance rules or permission matrices
- It uses standard Claude Code tool calls (Bash, Read, Grep, Edit, Write, Task)
- It uses third-party MCPs (Serena MCP, Grepika MCP) as optional accelerators with graceful fallbacks to core tools

The plugin is designed as a generic code auditing tool that works with any project, not AI-Maestro-specific.

**One observation:** The `caa-fix-agent` explicitly references `mcp__llm-externalizer__fix_code` and `mcp__llm-externalizer__batch_fix` as preferred fix methods. This is a reference to the LLM Externalizer MCP that is available in the user's AI Maestro environment. This is a positive feature (it uses the available infrastructure efficiently), not a violation — it is a preference hint with a documented fallback when the MCP is unavailable.

### 6. README Accuracy

Status: **ACCURATE — minor version tracking note**

The README accurately describes:
- All 11 agents and their pipelines (PR review vs codebase audit)
- All 3 skills with usage triggers
- The 1 slash command (`/audit-codebase`) with all parameters
- Report naming conventions (both PR review and codebase audit patterns)
- CI/CD workflows (4 GitHub Actions)
- Development workflow (version bumping, release process)

The README badge and inline version (`3.1.22`) match `plugin.json` and `pyproject.toml` exactly.

**Minor accuracy note:** The README states the plugin was formerly named `ai-maestro-code-auditor-agent` (confirmed in CHANGELOG: "Renamed plugin from ai-maestro-code-auditor-agent to code-auditor-agent"). If there are any installed references in AI Maestro configuration that still use the old name, those would need updating.

---

## Conflicts Found

**None critical.** The following observations are informational only:

### Observation 1: `aimaestro` mention in example output (NOT a conflict)
In `agents/caa-todo-generator-agent.md` lines 205-213, there is an example showing:
```
CONSOLIDATED_REPORT: docs_dev/caa-consolidated-aimaestro.md
OUTPUT_PATH: docs_dev/TODO-aimaestro-server-changes.md
```
These are example filenames in a `<example>` block showing how domain-specific TODO files would be named when auditing the AI Maestro codebase. This is documentation illustrating plugin usage, not a hardcoded dependency. (✓ VERIFIED by reading the full context.)

### Observation 2: `amp-messaging` in example (NOT a conflict)
In `agents/caa-fix-agent.md` line 210 and `agents/caa-fix-verifier-agent.md` line 206, example prompts reference `plugins/amp-messaging/scripts/amp-send.sh` and `plugins/amp-messaging/scripts/amp-inbox.sh` as illustrative FILES parameters. These are examples of files this plugin could audit — not calls to those scripts. (✓ VERIFIED by reading full agent context.)

### Observation 3: `convertAMPToMessage()` mention (NOT a conflict)
In `agents/caa-claim-verification-agent.md`, the agent description references `convertAMPToMessage()` as an illustrative example of a real incident where a claim was false. This is narrative context explaining the agent's purpose, not a functional dependency on AMP. (✓ VERIFIED by reading the Why You Exist section.)

### Observation 4: Missing `minClaudeVersion` in manifest
The plugin manifest does not specify minimum Claude version requirements. Given that the agents specify `model: opus` and `model: sonnet`, adding version constraints would improve marketplace metadata. This is informational, not a blocking issue.

---

## Alignment Instructions

For AI Maestro administrators who want to install this plugin:

### Installation

```bash
/install-plugin emasoft-plugins:code-auditor-agent
```

Or for local development:

```bash
claude --use-plugin /path/to/code-auditor-agent
```

### Prerequisites for Full Functionality

The following external tools are needed for full pipeline capability (all optional — agents degrade gracefully when unavailable):
- `gh` CLI (authenticated) — required for PR review pipelines
- `uv` — required for running merge/generate Python scripts
- `docker` — required for MegaLinter linting phase in fix pipeline
- `git` — standard requirement
- `jq` — for JSON parsing in scripts
- Security tools (optional): `trufflehog`, `bandit`, `osv-scanner`, `pip-audit`, `trivy`, `semgrep`
- MCP tools (optional): Serena MCP, Grepika MCP (used as accelerators with fallback to Grep/Read)

### No Governance Configuration Needed

This plugin does NOT require:
- AI Maestro team governance setup
- AMP messaging registration
- Any API key or token configuration
- Modification of AI Maestro's `team-governance` skill

### Skill Activation

After installation, skills activate via natural language triggers. No manual configuration required.

### Report Output

All pipeline reports are written to `docs_dev/` by default (configurable via `--report-dir` parameter). The `docs_dev/` folder is gitignored by convention in projects following AI Maestro patterns, so audit artifacts will not pollute the project repository.

---

## Final Assessment

| Check | Status | Notes |
|-------|--------|-------|
| Valid `plugin.json` manifest | PASS | All required fields present |
| No hardcoded AI Maestro API calls | PASS | Zero occurrences of localhost:23000 or API endpoints |
| No AI Maestro skill conflicts | PASS | `caa-` prefix is unique, no overlaps |
| No AI Maestro agent conflicts | PASS | All 11 agents use `caa-` prefix, no overlaps |
| No Claude Code hook conflicts | PASS | Plugin has no Claude Code hooks; git-hooks are dev-only |
| Compatible with AI Maestro agent usage | PASS | Standard tool calls, MCP-optional |
| README accuracy | PASS | Matches implementation |
| Follows Plugin Abstraction Principle | PASS | Does not embed AI Maestro internals |

**Recommendation: APPROVED for installation as a dependency plugin in AI Maestro environments.**
