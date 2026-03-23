# Repository Audit: `Emasoft/perfect-skill-suggester`
Generated: 2026-02-27

---

## Overview

**Plugin Name:** perfect-skill-suggester (PSS)
**Repo Version (plugin.json):** 2.1.0
**Marketplace Version (emasoft-plugins):** 1.9.5
**Git Tags Present:** v1.9.0, v1.6.1
**License:** MIT
**Author:** Emasoft

PSS is a Claude Code plugin that provides high-accuracy skill suggestion (claimed 88%+) via a `UserPromptSubmit` hook, a pre-compiled Rust binary for fast matching (~10ms), and an AI agent profiler that generates `.agent.toml` configuration files for other agents. It indexes 6 element types: skills, agents, commands, rules, MCP servers, and LSP servers.

---

## 1. Plugin Structure

### `.claude-plugin/plugin.json` - PRESENT and VALID

```json
{
  "name": "perfect-skill-suggester",
  "version": "2.1.0",
  "commands": ["./commands/pss-reindex-skills.md", "./commands/pss-status.md", "./commands/pss-setup-agent.md"],
  "skills": ["./skills/pss-usage"],
  "agents": ["./agents/pss-agent-profiler.md"]
}
```

The manifest follows the Claude Code plugin spec correctly. It declares 3 commands, 1 skill directory, and 1 agent.

### Directory Structure

```
.claude-plugin/plugin.json         — Plugin manifest (v2.1.0)
agents/
  pss-agent-profiler.md            — AI agent for .agent.toml generation
commands/
  pss-reindex-skills.md            — /pss-reindex-skills slash command
  pss-setup-agent.md               — /pss-setup-agent slash command
  pss-status.md                    — /pss-status slash command
hooks/
  hooks.json                       — UserPromptSubmit hook registration
skills/
  pss-agent-toml/SKILL.md          — Skill for building .agent.toml profiles
  pss-usage/SKILL.md               — Skill for understanding PSS usage
  pss-usage/references/            — 3 reference docs for PSS commands and authoring
prompts/
  pass1-haiku.md                   — Haiku prompt template for Pass 1 keyword extraction
  pass2-haiku.md                   — Haiku prompt template for Pass 2 co-usage analysis
rust/skill-suggester/
  src/main.rs                      — Rust source (~7000 lines)
  bin/pss-darwin-arm64             — Pre-built binary for macOS ARM64
  bin/pss-darwin-x86_64            — Pre-built binary for macOS Intel
  bin/pss-linux-x86_64             — Pre-built binary for Linux x86_64
  bin/pss-linux-arm64              — Pre-built binary for Linux ARM64
  bin/pss-windows-x86_64.exe       — Pre-built binary for Windows
  bin/pss-wasm32.wasm              — WASM fallback
  Cargo.toml / Cargo.lock
  hook.sh / hook.ps1               — Legacy shell wrappers (superseded by pss_hook.py)
schemas/
  pss-agent-toml-schema.json       — JSON Schema for .agent.toml validation
  pss-categories.json              — 16 predefined categories + CxC co-usage matrix
  pss-domains.json                 — Dewey-like domain classification (~keyword → domain code map)
  pss-domain-registry-schema.json  — Schema for domain-registry.json at runtime
  pss-schema.json                  — JSON Schema for .pss metadata files
  pss-skill-index-schema.json      — JSON Schema for skill-index.json
  pss-v1.schema.json               — Legacy v1 schema (retained for reference)
scripts/
  pss_hook.py                      — Main hook dispatcher (calls Rust binary)
  pss_discover.py                  — Scans all element locations, produces checklist
  pss_generate.py                  — Generates .pss metadata files
  pss_merge_queue.py               — Merges incremental .pss files into index
  pss_cleanup.py                   — Removes stale .pss files
  pss_aggregate_domains.py         — Builds domain-registry.json from index
  pss_build.py                     — Build script for Rust binary
  pss_setup.py                     — Plugin setup helper
  pss_test_e2e.py                  — End-to-end pipeline tests
  pss_validate_agent_toml.py       — Validates .agent.toml against schema
  validate_plugin.py               — Full plugin structure validator (CPV)
  validate_*.py (17 files)         — Specialized validators for each aspect
  smart_exec.py                    — Cross-platform tool execution helper
  validation_common.py             — Shared validation utilities
docs/
  PSS-ARCHITECTURE.md              — Core architecture design rationale
  PSS_FILE_FORMAT_SPEC.md          — .pss file format spec
  PLUGIN-VALIDATION.md             — Plugin validation procedures
  DEVELOPMENT.md                   — Build/cross-compile instructions
  FEATURE_COMPARISON.md            — PSS vs alternatives comparison
  ANTHROPIC-COMPLIANCE-REPORT.md   — Compliance verification report
tests/
  unit/test_pss_cleanup.py         — Unit tests for pss_cleanup.py
.github/workflows/
  build-binaries.yml               — CI for cross-platform Rust builds
  validate.yml                     — Plugin validation CI
  notify-marketplace.yml           — Marketplace notification on release
```

### Claude Code Plugin Spec Compliance

The plugin correctly:
- Uses `plugin.json` in `.claude-plugin/` directory
- Declares hooks in `hooks/hooks.json`
- Uses a `UserPromptSubmit` hook type (not PreToolUse or PostToolUse)
- Points commands to `.md` files with YAML frontmatter (`name`, `description`, `argument-hint`, `allowed-tools`)
- Points skills to directories containing `SKILL.md` with YAML frontmatter
- Points agents to `.md` files
- Has `user-invocable: false` on the `pss-agent-toml` skill (it is called programmatically only)
- Hook registered with 5000ms timeout

---

## 2. AI Maestro Compatibility

### NO direct AI Maestro references found.

A comprehensive grep for `localhost:23000`, `aimaestro`, `ai-maestro`, `agent-registry`, `governance`, `teams` returned zero matches across all source files.

**PSS is an entirely standalone plugin** designed for the general Claude Code plugin ecosystem, not specifically for the AI Maestro ecosystem. It does not:
- Reference the AI Maestro API at `localhost:23000`
- Use AMP messaging (`amp-send.sh`, `amp-inbox.sh`)
- Reference the agent registry (`lib/agent-registry.ts` or `~/.aimaestro/agents/registry.json`)
- Reference governance, teams, or AI Maestro-specific concepts

**Compatibility Assessment:** PSS works with any Claude Code installation that supports the plugin spec. Since AI Maestro uses Claude Code natively, PSS is compatible by inheritance — but it has no specific AI Maestro integrations.

---

## 3. Skill Suggestion Engine

### 3.1 Discovery

PSS indexes elements from these sources (scanned on every `/pss-reindex-skills` run):

| Source | Location |
|--------|----------|
| User-level skills | `~/.claude/skills/` |
| Current project skills | `.claude/skills/` |
| Plugin cache | `~/.claude/plugins/cache/*/*/skills/` |
| Local plugins | `~/.claude/plugins/*/skills/` |
| Project plugins | `.claude/plugins/*/skills/` |
| Agents | `~/.claude/agents/`, `.claude/agents/`, plugin `agents/` |
| Commands | `~/.claude/commands/`, `.claude/commands/`, plugin `commands/` |
| Rules | `~/.claude/rules/`, `.claude/rules/` |
| MCP servers | `~/.claude.json`, `.mcp.json` |
| LSP servers | `~/.claude/settings.json` enabledPlugins |
| All projects (optional) | Via `--all-projects` flag reading `~/.claude.json` |

### 3.2 Scoring Algorithm

The Rust binary implements weighted scoring in two modes:

**Hook mode** (real-time, max 4 suggestions, min score 0.5):
```
Evidence Type       Weight   Description
directory_match     +5       Skill is in a directory mentioned in prompt
path_match          +4       File paths in prompt match skill patterns
intent_match        +4       Action verbs like "deploy", "test", "build"
pattern_match       +3       Regex patterns in skill config
keyword_match       +2       Simple keyword substring match
first_match_bonus   +10      First keyword hit gets extra weight
original_bonus      +3       Keyword in original prompt (not from synonym expansion)
```

**Confidence tiers:**
- HIGH (score >= 12): Auto-suggest with commitment reminder
- MEDIUM (6-11): Show with match evidence
- LOW (< 6): Include as alternatives

### 3.3 Keyword Matching and Synonym Expansion

Before scoring, user prompts are expanded using 70+ synonym patterns built into the Rust binary:
- `"pr"` → `"github pull request"`
- `"403"` → `"oauth2 authentication"`
- `"db"` → `"database"`
- `"ci"` → `"cicd deployment automation"`

### 3.4 Intent Detection

Detected via named action verbs in the `intents` field of each indexed element (e.g., "deploy", "build", "test", "refactor").

### 3.5 Fuzzy/Typo Tolerance

The binary implements Damerau-Levenshtein distance for typo correction:
- 1 edit for words ≤4 chars (e.g., `"gti"` → `"git"`)
- 2 edits for medium words (e.g., `"dokcer"` → `"docker"`)
- 3 edits for long words

### 3.6 Task Decomposition

Complex multi-part prompts are split by conjunctions, semicolons, and numbered lists into sub-tasks, each scored independently with results aggregated.

### 3.7 Context Augmentation (pss_hook.py)

The Python hook script augments prompts before passing to the binary:
- Detects project type from CWD (Cargo.toml → rust, package.json → js/ts, etc.)
- Reads recent conversation transcript (last 200 lines) for context keywords
- Appends up to 2 context keywords to short prompts (≤80 chars)
- Extracts platforms, frameworks, languages for the binary's domain gate filtering
- Detects tools from the dynamic TOOL_CATALOG (built from all indexed skills' `tools` fields)
- Detects file types from the prompt for media/document skills

### 3.8 Two-Pass Index Generation

**Pass 1 (Haiku agents in parallel batches of 10-20):**
- Each Haiku reads a batch of element SKILL.md files
- Extracts: keywords (8-15 per element), intents, patterns, directories, category (from 16 predefined), description, use_cases VERBATIM
- Uses triple-read verification to compensate for Haiku accuracy limitations
- Output merged incrementally into `~/.claude/cache/skill-index.json` via `pss_merge_queue.py`

**Pass 2 (Haiku agents per element):**
- Each Haiku reads its element's Pass 1 data
- Calls Rust binary in `--incomplete-mode` for keyword-similarity candidates
- Uses CxC category co-usage matrix for additional candidate discovery
- Applies AI reasoning to determine semantic co-usage relationships: `usually_with`, `precedes`, `follows`, `alternatives`
- Writes results back to the global index

---

## 4. .agent.toml Schema and Support

### 4.1 .agent.toml Production

PSS fully supports generating `.agent.toml` files. This is a CORE feature introduced in v2.1.0.

**Trigger:** `/pss-setup-agent <agent-path> [--requirements PATHS...] [--output PATH]`

**Output location (default):** `team/agents-cfg/<agent-name>.agent.toml` relative to CWD

### 4.2 .agent.toml Schema

The full schema is defined in `schemas/pss-agent-toml-schema.json` (JSON Schema Draft-07). The file format is TOML with these sections:

```toml
# Auto-generated by PSS Agent Profiler
# Agent: <name>
# Generated: <ISO-8601 timestamp>
# Requirements: <file basenames or "none">

[agent]                    # REQUIRED
name = "agent-name"        # kebab-case, pattern: ^[a-z0-9][a-z0-9_-]*$
source = "path"            # "path" or "plugin:<name>"
path = "/abs/path/to/agent-name.md"

[requirements]             # OPTIONAL - project context
files = ["prd.md"]         # basenames of design documents
project_type = "web-app"   # web-app | cli-tool | mobile-app | library | api | microservice
tech_stack = ["typescript", "react", "postgresql"]

[skills]                   # REQUIRED
primary = ["skill-a", "skill-b"]        # 1-7 items (core daily-use, score >= 60%)
secondary = ["skill-c", "skill-d"]      # 0-12 items (useful common tasks, score 30-59%)
specialized = ["skill-e"]               # 0-8 items (niche situations, score 15-29%)

[skills.excluded]          # OPTIONAL - transparency comments only, not parsed
# "vue-frontend" = "Conflicts with React (requirements specify React)"
# "jest-testing" = "Vitest preferred for Vite-based project"

[agents]                   # OPTIONAL
recommended = ["agent-x", "agent-y"]

[commands]                 # OPTIONAL
recommended = ["command-a", "command-b"]

[rules]                    # OPTIONAL
recommended = ["rule-a", "rule-b"]

[mcp]                      # OPTIONAL
recommended = ["mcp-server-a"]

[hooks]                    # OPTIONAL
recommended = []

[lsp]                      # OPTIONAL - assigned by language detection
recommended = ["typescript-lsp", "pyright-lsp"]
```

**Schema constraints (enforced by pss_validate_agent_toml.py):**
- `agent.name` must match `^[a-z0-9][a-z0-9_-]*$`
- `skills.primary` must have 1-7 items (minItems: 1, maxItems: 7)
- `skills.secondary` max 12 items
- `skills.specialized` max 8 items
- All skill arrays have `uniqueItems: true` (no duplicates within a tier)
- Same skill cannot appear in multiple tiers
- `agent.path` must exist on disk (when `--check-index` flag used)
- All skill names must exist in `~/.claude/cache/skill-index.json` (when `--check-index` flag used)
- `agent.source` matches `^(path|plugin:[a-z0-9][a-z0-9_-]*)$`
- `additionalProperties: false` on all objects

### 4.3 .agent.toml Element Coverage

The file covers ALL 6 indexed element types:
- `[skills]` — tiered skills (primary/secondary/specialized)
- `[agents]` — complementary sub-agents
- `[commands]` — recommended slash commands
- `[rules]` — enforcement rules
- `[mcp]` — MCP servers
- `[hooks]` — hook configurations
- `[lsp]` — language server assignments

---

## 5. Agent Profiling Workflow

### 5.1 Input

The `/pss-setup-agent` command accepts:
- **Agent definition file** (required): An `.md` file describing the agent
- **Requirements files** (optional): PRDs, tech specs, architecture docs
- **Output path** (optional): Custom path for the `.agent.toml`

Supports plugin notation: `plugin-name:agent-name` (resolves from plugin cache)

### 5.2 Processing (6-Phase Pipeline)

**Phase 1: Gather Context**
- Read agent `.md` file completely (name, description, role, duties, tools, domains)
- Read all requirements documents (project_type, tech_stack, key_features, constraints)
- Detect project languages from CWD file system markers

**Phase 2: Candidate Generation**
- Build JSON descriptor with agent metadata + requirements summary (≤2000 chars)
- Invoke Rust binary in `--agent-profile` mode with `--top 30`
- Binary returns candidates grouped by type (skills, complementary_agents, commands, rules, mcp, lsp)
- Additional manual index search using Python one-liner with type/category/language/framework filters

**Phase 3: AI Post-Filtering (MANDATORY - AI agent required)**
- Read each candidate's full SKILL.md/agent.md file
- Evaluate relevance to the agent's actual role and project
- Detect mutual exclusivity (11 families: JS framework, runtime, bundler, CSS, ORM, testing, state mgmt, deployment, Python web, Python test, mobile)
- Check for obsolescence (deprecated APIs, EOL runtimes, superseded tools)
- Verify stack compatibility (no Python-only skills for TS projects, etc.)
- Gap analysis: check if requirements mention needs not covered by scored candidates
- Redundancy pruning: remove skills that are strict subsets of other selected skills

**Phase 4: External Sources** (if requested by user/orchestrator)
- Local files, installed plugins, marketplace plugins, GitHub repos, network shares, raw URLs

**Phase 5: Cross-Type Coherence Validation**
- Skill ↔ MCP overlap detection (e.g., "database-management" skill vs "postgres-mcp" server)
- Skill ↔ Agent overlap detection
- Agent ↔ Agent duplicate role detection
- MCP ↔ MCP tool overlap detection
- Rule ↔ Rule contradiction detection
- Framework consistency (no React + Vue mix)
- Runtime consistency (no Node + Deno mix)

**Phase 6: Write and Validate**
- Write `.agent.toml` to output path
- Run `pss_validate_agent_toml.py <path> --check-index --verbose`
- Re-write and re-validate on failure (up to 3 attempts)
- Report: `[DONE] Agent profile written to: <output-path>` or `[FAILED] <reason>`

### 5.3 Output

A fully populated `.agent.toml` file, validated against the schema, placed at:
- Default: `team/agents-cfg/<agent-name>.agent.toml` (relative to CWD)
- Custom: path specified with `--output`

### 5.4 Application of .agent.toml

**CRITICAL FINDING:** There is NO `apply-agent-toml.sh` script or equivalent in the repo. The `.agent.toml` file is a **recommendation output**, not an automatically applied configuration. It is intended to be read by:
1. A human who manually loads the recommended skills when running the agent
2. An orchestrator agent that reads the file and applies the configuration
3. A future automated pipeline (not yet implemented)

There is NO AI Maestro API endpoint (`/api/agents/...`) that accepts TOML config natively. The `.agent.toml` format is PSS-specific and would require custom integration work to be applied programmatically via the AI Maestro API.

---

## 6. Integration Points (COS + Haephestos)

### 6.1 Chief-of-Staff Integration

**Current state:** No direct integration exists. PSS has no API, no messaging endpoint, and no shared memory with the Chief-of-Staff plugin.

**Possible integration path:**
- The COS agent can invoke `/pss-setup-agent` via the Task tool by spawning it as a subagent
- The COS can read the output `.agent.toml` from `team/agents-cfg/`
- The COS would need to parse the TOML and apply it when instantiating agents
- This requires custom orchestration code — PSS does not provide it

### 6.2 Haephestos (Agent Creation Helper) Integration

**Current state:** No direct integration. PSS does not reference Haephestos and vice versa.

**Possible integration path:**
- During the agent creation chat, Haephestos could invoke `/pss-setup-agent` after the user provides an agent description and optional requirements
- Haephestos would pass the newly created agent `.md` file path to PSS
- PSS returns a `.agent.toml` that Haephestos could present to the user as configuration recommendations
- The user or Haephestos could then apply the recommended skills to the agent session

**Gap:** Neither plugin has any code implementing this integration. It would need to be built.

### 6.3 API/Skill for Other Agents

The `pss-agent-toml` skill (in `skills/pss-agent-toml/SKILL.md`) is designed to teach ANY agent how to perform agent profiling. It is marked `user-invocable: false` but any agent with this skill loaded can execute the profiling workflow.

The `/pss-setup-agent` command provides a callable interface that spawns the `pss-agent-profiler` agent autonomously. Any agent with the `Task` tool can invoke it.

---

## 7. Hook Architecture

### 7.1 Hook Registration

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "python3 \"${CLAUDE_PLUGIN_ROOT}/scripts/pss_hook.py\"",
        "timeout": 5000,
        "statusMessage": "Analyzing skill triggers..."
      }]
    }]
  }
}
```

**Single hook, single trigger:** Only `UserPromptSubmit`. No PreToolUse, PostToolUse, or other hook types.

### 7.2 Hook Execution Flow

```
UserPromptSubmit fires
    ↓
pss_hook.py reads stdin (JSON with prompt, cwd, transcriptPath)
    ↓
should_skip_prompt() check (slash commands, simple responses, task notifications)
    ↓ if not skipped
skill-index.json existence check
    ↓ if index exists
Rust binary existence check
    ↓ if binary exists
Initialize catalogs (DOMAIN_KEYWORD_MAP, TOOL_CATALOG from index)
    ↓
Augment prompt with project/conversation context (if prompt ≤80 chars)
    ↓
Extract context metadata (platforms, frameworks, languages, domains, tools, file_types)
    ↓
Call Rust binary with --format hook --top 4 --min-score 0.5
    ↓
Print binary stdout (hook output JSON) → Claude receives skill suggestions
```

**Performance:** Total hook latency ~10-15ms (2ms Python startup + ~10ms Rust binary).

### 7.3 Prompt Skipping Logic

PSS skips suggestion for:
- Slash commands (any prompt starting with `/`)
- Single-word confirmations: "yes", "no", "ok", "continue", "done", etc.
- Multi-word acknowledgments: "got it", "sounds good", "looks good", etc.
- `<task-notification>` content (avoids firing during agent-to-agent messages)

### 7.4 Performance Considerations

- Python subprocess timeout: 2 seconds (well under the 5s hooks.json timeout)
- Catalogs (DOMAIN_KEYWORD_MAP, TOOL_CATALOG) loaded lazily after skip checks
- The Rust binary holds ~2-3MB memory and starts in ~5-10ms
- A 200+ element index would increase binary runtime but still expected under 100ms

---

## 8. Installation and Marketplace

### 8.1 Independence from emasoft-plugins Marketplace

**IMPORTANT**: This plugin (`perfect-skill-suggester`) is an **independent** AI Maestro plugin distributed via its own GitHub repo (`https://github.com/Emasoft/perfect-skill-suggester`). It is NOT part of the emasoft-plugins marketplace. Any references to the emasoft-plugins marketplace inside this repo are bugs that need to be fixed.

### 8.2 Emasoft Marketplace Contamination: CRITICAL

The README and CI workflow still contain **15+ references** to the emasoft-plugins marketplace that are incorrect for the AI Maestro version:

**README.md contamination (12 lines):**
- Line 79: `claude plugin marketplace add emasoft-plugins --url https://github.com/Emasoft/emasoft-plugins`
- Line 82: `claude plugin install perfect-skill-suggester@emasoft-plugins --scope user`
- Lines 100-114: Update instructions referencing `emasoft-plugins` marketplace
- Lines 118-125: Uninstall instructions referencing `emasoft-plugins`
- Lines 141-158: Troubleshooting sections referencing `~/.claude/plugins/cache/emasoft-plugins/`

**CI workflow contamination:**
- `.github/workflows/notify-marketplace.yml`: `MARKETPLACE_REPO: 'emasoft-plugins'`

**Required fix**: All emasoft-plugins marketplace references should be replaced with the correct AI Maestro marketplace or direct GitHub repo installation. Installation instructions should reference `ai-maestro-plugins` or direct `--plugin-dir` loading.

### 8.3 Version Discrepancy

The plugin.json says version `2.1.0` but no git tag exists for v2.1.0. Latest git tags are `v1.9.0` and `v1.6.1`. A proper release tag should be created for v2.1.0 to enable versioned installation.

### 8.4 Installation Scope

README documents `--scope user` as recommended for utility plugins (not `--scope local`). The plugin is designed as a universal hook plugin, not per-agent. Installation is global (`--scope user`).

**Per-agent assignment:** The plugin does not mention `--agent` flag support.

### 8.5 Post-Install Steps

After installation, user must run `/pss-reindex-skills` to generate the element index. The hook silently does nothing until the index exists at `~/.claude/cache/skill-index.json`.

---

## 9. AI Maestro Compatibility Summary

| Aspect | Status |
|--------|--------|
| AI Maestro API (localhost:23000) | Not referenced |
| AMP messaging | Not used |
| Agent registry | Not referenced |
| Governance/teams | Not referenced |
| Claude Code plugin spec | Fully compliant |
| Works in AI Maestro ecosystem | Yes (inherits Claude Code compatibility) |
| Specific AI Maestro integrations | None |

---

## 10. Findings Summary

### CRITICAL

**C1: Emasoft Marketplace Contamination (15+ references)**
The README, installation/update/uninstall instructions, troubleshooting sections, and CI workflow (`.github/workflows/notify-marketplace.yml`) all reference the `emasoft-plugins` marketplace. This plugin is an independent AI Maestro plugin and should NOT reference the emasoft marketplace. All 15+ references need to be replaced with the correct AI Maestro marketplace or direct repo installation. See Section 8.2 for full breakdown.

**C2: No Apply Mechanism for .agent.toml**
PSS generates `.agent.toml` files but provides no script, API, or tooling to automatically apply them. There is no `apply-agent-toml.sh`, no AI Maestro API endpoint that accepts TOML, and no integration code. The `.agent.toml` is purely a recommendation artifact — it requires manual or custom-orchestrated application. This is a significant gap if the goal is automated agent setup.

**C3: No AI Maestro Integration**
PSS has zero code for AI Maestro-specific integration (no AMP, no governance, no registry references). Using PSS within the AI Maestro ecosystem requires custom bridge code that does not exist yet.

**C4: Version Mismatch - No 2.1.0 Tag**
The repo's `plugin.json` declares `2.1.0` but no git tag exists for v2.1.0. Latest git tags are `v1.9.0` and `v1.6.1`. The `.agent.toml` profiling system is only available in the untagged `2.1.0`. A proper release must be created.

### HIGH

**H1: Haephestos Cannot Invoke PSS Without Custom Integration**
There is no API, skill, or hook that Haephestos (agent creation helper) can call to automatically get PSS skill recommendations during agent creation. The integration path exists conceptually (both are Claude Code plugins) but requires implementation work.

**H2: Chief-of-Staff Cannot Auto-Apply .agent.toml**
Even if COS invokes `/pss-setup-agent`, it cannot automatically apply the resulting `.agent.toml` to configure an agent session. There is no automated bridge between the TOML output and actual agent configuration.

**H3: Index Requires Manual Rebuild**
PSS never auto-rebuilds the index. After installing new skills or updating plugins, the user must manually run `/pss-reindex-skills`. In an AI Maestro environment with dynamically installed plugins, this creates a maintenance burden. A post-install hook or scheduled rebuild would improve usability.

**H4: Rust Binary Not Tagged for 2.1.0**
The repository has no git tag for v2.1.0. Git tags exist for v1.9.0 and v1.6.1. Without a proper release tag, the marketplace cannot reliably pin to the correct version.

### MEDIUM

**M1: pss-agent-toml Skill is not User-Invocable**
The `pss-agent-toml` SKILL.md has `user-invocable: false`. This prevents a user from directly invoking the skill to learn about `.agent.toml` building. Only the `/pss-setup-agent` command provides a user-facing entry point. The skill is used programmatically by agents.

**M2: No --scope local Support Documented**
The README recommends `--scope user` but does not document `--scope local` behavior for per-project or per-agent scoping. In AI Maestro's agent-centric model, per-agent plugin scoping may be preferred.

**M3: Two legacy shell hooks (hook.sh, hook.ps1)**
The repo contains `rust/skill-suggester/hook.sh` and `hook.ps1` alongside the new `pss_hook.py`. These legacy files appear superseded but are still present and could cause confusion.

**M4: No Automated Testing for Agent Profiling**
The `tests/` directory only contains `unit/test_pss_cleanup.py`. There are no automated tests for the `.agent.toml` generation pipeline (pss-agent-profiler agent, validation, tier assignment). The `pss_test_e2e.py` script exists but tests the hook pipeline only.

**M5: Pass 2 Requires Rust Binary**
During `/pss-reindex-skills` Pass 2, Haiku agents must invoke the Rust binary in `--incomplete-mode`. If the binary is missing for the platform (rare but possible), Pass 2 fails entirely. This is a hard dependency that blocks co-usage index generation.

### LOW

**L1: .agent.toml Not Machine-Applied**
The `.agent.toml` format is comprehensive but its application to an actual running agent session is entirely manual. A future integration could auto-apply it when starting an agent via `claude --agent <agent-name>`, but this is not implemented.

**L2: Synonym Expansion is Hardcoded in Rust**
The 70+ synonym patterns are compiled into the Rust binary. Adding new synonyms requires recompiling. There is no configuration file for synonyms, making customization difficult without rebuilding.

**L3: No Uninstall Hook**
When PSS is uninstalled, the generated `~/.claude/cache/skill-index.json` is not cleaned up. Stale index files from PSS remain on the system until manually deleted.

**L4: WASM Binary Untested**
A `pss-wasm32.wasm` binary is included but there is no documentation on how to use it or what runtime is required. This platform target appears experimental.

**L5: Haiku Triple-Read Verification Adds Latency**
Both Pass 1 and Pass 2 prompt templates require Haiku to read each element file 3 times for verification. This triples the indexing cost for accuracy. For a large skill library (200+ elements), reindexing takes several minutes and significant API cost.

**Note on Version Requirements:** The Claude Code plugin specification has no mechanism for plugins to declare platform version requirements. Any version references in plugin documentation are informational only and cannot be validated or enforced.

---

## 11. Required Plugin Changes

This section provides detailed change requirements for the PSS plugin to function correctly within the AI Maestro governance system. Each change specifies the target file(s), the modification required, the rationale, and which protocol flow(s) it supports.

### Summary Table

| ID | Severity | Change | File(s) | Flow(s) |
|----|----------|--------|---------|---------|
| RC-1 | CRITICAL | Fix emasoft marketplace contamination | README.md, CI workflow | Installation |
| RC-2 | CRITICAL | Create apply-agent-toml script/skill | New files | Flow 6 |
| RC-3 | CRITICAL | Create v2.1.0 git tag | Git | Installation |
| RC-4 | HIGH | Add AI Maestro discovery paths | pss_discover.py | Flow 6 |
| RC-5 | HIGH | Add AI Maestro context to profiler | pss-agent-profiler.md | Flows 6,9 |
| RC-6 | HIGH | Add governance message skip logic | pss_hook.py | ALL |
| RC-7 | MEDIUM | Add --team flag for output path | pss-setup-agent.md | Flow 6 |
| RC-8 | MEDIUM | Add --check-ai-maestro validator flag | pss_validate_agent_toml.py | Flow 6 |
| RC-9 | MEDIUM | Add index freshness check | hooks/hooks.json + new script | ALL |
| RC-10 | LOW | Remove legacy shell hooks | hook.sh, hook.ps1 | Housekeeping |
| RC-11 | LOW | Add hooks reference to plugin.json | plugin.json | Hook reliability |

---

### RC-1: Fix Emasoft Marketplace Contamination — 15+ References (CRITICAL)

**Files:**
- `README.md` — 12 lines referencing `emasoft-plugins` marketplace
- `.github/workflows/notify-marketplace.yml` — `MARKETPLACE_REPO: 'emasoft-plugins'`

**Required replacements in README.md:**
- Line 79: Replace `claude plugin marketplace add emasoft-plugins --url https://github.com/Emasoft/emasoft-plugins` with `claude plugin marketplace add ai-maestro-plugins --url https://github.com/Emasoft/ai-maestro-plugins` (or direct repo installation)
- Line 82: Replace `claude plugin install perfect-skill-suggester@emasoft-plugins --scope user` with `claude plugin install perfect-skill-suggester@ai-maestro-plugins --scope user`
- Lines 100-114: Update all `emasoft-plugins` references in update instructions
- Lines 118-125: Update uninstall instructions
- Lines 141-158: Update troubleshooting sections — replace `~/.claude/plugins/cache/emasoft-plugins/` with correct cache path

**Required replacement in CI:**
- `.github/workflows/notify-marketplace.yml`: Change `MARKETPLACE_REPO: 'emasoft-plugins'` to `MARKETPLACE_REPO: 'ai-maestro-plugins'`

**Why:** Incorrect marketplace references cause installation failures. Users following the README will try to install from a marketplace that doesn't contain this version of the plugin.

**Flows affected:** Installation prerequisite for ALL flows.

---

### RC-2: Create `apply-agent-toml` Script/Skill (CRITICAL)

**New files to create:**
- `scripts/pss_apply_agent_toml.py` — Script that reads `.agent.toml` and applies it to an agent
- `skills/pss-apply-profile/SKILL.md` — Skill teaching agents how to apply `.agent.toml` profiles
- `commands/pss-apply-agent-profile.md` — `/pss-apply-agent-profile <toml-path> [--agent <name>]` slash command

**Required implementation for `pss_apply_agent_toml.py`:**

```python
# pss_apply_agent_toml.py
"""
Reads an .agent.toml file and applies the configuration to a target agent.

Usage: python3 pss_apply_agent_toml.py <toml-path> [--agent <agent-name>] [--dry-run]

Steps:
1. Parse TOML file (requires tomli or tomllib from Python 3.11+)
2. Validate against pss-agent-toml-schema.json
3. For each skill in skills.primary + skills.secondary + skills.specialized:
   a. Check if skill is already installed: list agent's current skills
   b. If not installed, install: claude plugin install <skill> --scope local
4. For each MCP server in mcp.recommended:
   a. Add to .claude/settings.local.json mcpServers section
5. For each rule in rules.recommended:
   a. Copy rule file to .claude/rules/ in agent's workspace
6. For each LSP server in lsp.recommended:
   a. Add to .claude/settings.local.json lspServers section
7. Log all actions taken
"""
```

**Skill file (`skills/pss-apply-profile/SKILL.md`):**

```yaml
---
name: pss-apply-profile
description: Apply a .agent.toml profile to configure an agent with recommended skills, MCP servers, and rules
user-invocable: false
---
```

The skill should teach agents (especially COS) how to:
1. Locate `.agent.toml` files in `team/agents-cfg/`
2. Parse and validate them
3. Apply each section to the target agent
4. Handle failures gracefully (skill not found, MCP config error, etc.)

**Command file (`commands/pss-apply-agent-profile.md`):**

```yaml
---
name: pss-apply-agent-profile
description: Apply a .agent.toml profile to an agent
argument-hint: <toml-path> [--agent <name>] [--dry-run]
allowed-tools: [Bash, Read, Write, Edit]
---
```

**Why:** This is the **#1 functional gap** in the entire 3-plugin ecosystem. PSS generates `.agent.toml` but nothing reads or applies it. Without this, the entire agent profiling pipeline is a dead end. COS cannot use PSS output to configure agents.

**Flows affected:** Flow 6 (PSS agent creation — the `.agent.toml` output is useless without this).

---

### RC-3: Create v2.1.0 Git Tag (CRITICAL)

**Action:** Create and push git tag `v2.1.0` pointing to the commit that includes the `.agent.toml` profiling feature.

```bash
git tag -a v2.1.0 -m "Release 2.1.0: Agent profiling with .agent.toml support"
git push origin v2.1.0
```

**Why:** The plugin.json declares version 2.1.0 but no git tag exists. Marketplace installations that use versioned tags will fail to find the correct release. The existing tags (v1.9.0, v1.6.1) point to older versions without the agent profiling feature.

**Flows affected:** Installation prerequisite.

---

### RC-4: Add AI Maestro Discovery Index Paths (HIGH)

**File:** `scripts/pss_discover.py` (or equivalent discovery module)

**Current discovery paths:** Only scans standard Claude Code paths (`~/.claude/skills/`, `.claude/skills/`, plugin cache, etc.)

**Required addition:** Add AI Maestro-specific discovery paths:

```python
AI_MAESTRO_PATHS = [
    # AI Maestro bundled plugin skills
    os.path.expanduser('~/.claude/plugins/cache/ai-maestro/*/skills/'),
    # AI Maestro agent-specific skills
    os.path.expanduser('~/.aimaestro/agents/*/skills/'),
    # AI Maestro team-level shared skills
    os.path.expanduser('~/.aimaestro/teams/*/skills/'),
]
```

**Why:** AI Maestro distributes plugins from `~/.claude/plugins/cache/ai-maestro/` (not `emasoft-plugins`). AMCOS copies plugins to `~/agents/<session>/.claude/plugins/`. PSS will not discover these skills unless the paths are explicitly scanned.

**Flows affected:** Flow 6 (PSS needs to index AI Maestro-distributed skills to suggest them).

---

### RC-5: Add AI Maestro Context to Agent Profiling (HIGH)

**File:** `agents/pss-agent-profiler.md` (agent definition)

**Current:** The profiler generates `.agent.toml` without any AI Maestro context.

**Required additions to the agent persona:**

1. **Governance awareness**: When profiling an agent for an AI Maestro team, consider:
   - The team type (open/closed) affects which skills are appropriate
   - Closed team agents MUST have `agent-messaging` skill for AMP communication
   - The `team-governance` skill is essential for COS-managed agents
   - Agents in AI Maestro MUST NOT load multiple role plugins (mutual exclusivity)

2. **Role-based skill recommendations**: Add default skill recommendations per role:
   - `orchestrator`: planning, git-workflow, parallel-agents
   - `architect`: research-agent, planning, software-engineering-lead
   - `implementer`: tdd, exhaustive-testing, git-workflow, refactor15
   - `tester`: exhaustive-testing, tdd, e2e testing
   - `reviewer`: github-code-reviews, security

3. **AMP messaging requirement**: All AI Maestro agents MUST include the `agent-messaging` skill in `skills.primary`. This is non-negotiable for the governance system to function.

**Why:** Without this context, PSS generates generic profiles that miss AI Maestro-specific requirements. An agent created without `agent-messaging` cannot receive AMP messages from COS or MANAGER.

**Flows affected:** Flow 6 (PSS agent creation), Flow 9 (COS design requirements).

---

### RC-6: Add Hook Output Compatibility with AI Maestro Message Filter (HIGH)

**File:** `scripts/pss_hook.py`

**Current:** The hook fires on every `UserPromptSubmit` regardless of context.

**Required:** Add AI Maestro message filter awareness:

```python
def should_skip_prompt(prompt_text):
    # ... existing skip logic ...

    # Skip AI Maestro governance messages (already processed by message filter)
    if '<governance-request>' in prompt_text:
        return True
    if '<transfer-request>' in prompt_text:
        return True
    if 'GovernanceRequest' in prompt_text and 'approve' in prompt_text.lower():
        return True

    # Skip AMP message notifications (already processed by inbox hooks)
    if '[MESSAGE]' in prompt_text and 'From:' in prompt_text:
        return True
```

**Why:** In an AI Maestro environment, governance messages and AMP notifications inject prompts that PSS should not try to match skills against. A governance approval request should not trigger skill suggestions for "approval" or "governance" skills.

**Flows affected:** All flows — prevents noisy false-positive suggestions during governance operations.

---

### RC-7: Add `.agent.toml` Output Path Configuration (MEDIUM)

**File:** `commands/pss-setup-agent.md`

**Current:** Default output path is `team/agents-cfg/<agent-name>.agent.toml` relative to CWD.

**Required:** Add support for AI Maestro team-specific paths:

```
/pss-setup-agent /path/to/agent.md --team <team-uuid> [--output PATH]
```

When `--team` is specified:
1. Query `GET /api/teams/{team-uuid}` to get team name
2. Default output to `~/.aimaestro/teams/<team-uuid>/agents-cfg/<agent-name>.agent.toml`
3. Create the directory if it does not exist

**Why:** In AI Maestro, team configuration is stored under `~/.aimaestro/teams/`. The current CWD-relative path does not integrate with the team filesystem structure. COS looking for `.agent.toml` files would need to know to look in `team/agents-cfg/` in whatever CWD PSS was running in.

**Flows affected:** Flow 6 (PSS agent creation).

---

### RC-8: Add `--check-ai-maestro` Flag to Validator (MEDIUM)

**File:** `scripts/pss_validate_agent_toml.py`

**Current:** Validates against schema and optionally checks skill-index.json.

**Required:** Add `--check-ai-maestro` flag that:

1. Verifies `agent-messaging` is in `skills.primary` (required for AMP)
2. Verifies no conflicting role plugins (mutual exclusivity check)
3. Checks that recommended MCP servers are compatible with the target agent's host platform
4. Warns if `team-governance` is missing for COS-managed agents

```bash
python3 pss_validate_agent_toml.py profile.agent.toml --check-index --check-ai-maestro
```

**Why:** Generic `.agent.toml` validation does not catch AI Maestro-specific requirements. An agent profile that validates cleanly against the schema may still be non-functional in AI Maestro if it is missing mandatory skills.

**Flows affected:** Flow 6 validation step.

---

### RC-9: Add Auto-Reindex Trigger Hook (MEDIUM)

**File:** `hooks/hooks.json`

**Current:** Only has `UserPromptSubmit` hook.

**Required:** Consider adding a `SessionStart` hook that checks if the skill index is stale:

```json
{
  "SessionStart": [{
    "hooks": [{
      "type": "command",
      "command": "python3 \"${CLAUDE_PLUGIN_ROOT}/scripts/pss_check_index_freshness.py\"",
      "timeout": 3000,
      "statusMessage": "Checking skill index..."
    }]
  }]
}
```

**New file: `scripts/pss_check_index_freshness.py`**

The freshness check script would:
1. Read `~/.claude/cache/skill-index.json` timestamp
2. Compare against installed plugins modification times
3. If index is >24h old or plugins have changed, output a reminder: "Skill index may be stale. Run /pss-reindex-skills to update."

**Why:** In AI Maestro, plugins are installed/removed dynamically by COS. The skill index becomes stale frequently. Without this, PSS suggests skills that no longer exist or misses newly installed ones.

**Flows affected:** Accuracy of all skill suggestions.

---

### RC-10: Remove Legacy Shell Hooks (LOW)

**Files to remove (or move to `docs/legacy/`):**
- `rust/skill-suggester/hook.sh` — legacy shell wrapper, superseded by `pss_hook.py`
- `rust/skill-suggester/hook.ps1` — legacy PowerShell wrapper, superseded by `pss_hook.py`

**Why:** These files are from the pre-Python era of PSS. They could confuse someone inspecting the plugin structure. The canonical hook is `scripts/pss_hook.py`.

**Flows affected:** None — housekeeping only.

---

### RC-11: Update plugin.json with `hooks` Reference (LOW)

**File:** `.claude-plugin/plugin.json`

**Current:** No `hooks` field in manifest.

**Note:** The hooks ARE defined in `hooks/hooks.json` which Claude Code auto-discovers from the `hooks/` directory path. However, some Claude Code versions may require explicit declaration:

```json
{
  "hooks": "./hooks/"
}
```

**Why:** Defensive measure — ensures hooks are discovered regardless of Claude Code version behavior.

**Flows affected:** Hook execution reliability.

---

## 12. PR Compatibility Conflicts (feature/team-governance)

> **Design principle:** Plugin skills should reference AI Maestro's global skills by name (not embed API syntax). Plugin hooks should call global scripts (not curl). See [docs/PLUGIN-ABSTRACTION-PRINCIPLE.md](../docs/PLUGIN-ABSTRACTION-PRINCIPLE.md).

The following conflicts exist between this plugin and the current PR:

### CONFLICT-1: No Governance Context Awareness (LOW)

**Problem:** PSS operates as a standalone skill suggestion engine with zero AI Maestro API integration. The PR introduces governance APIs (`GET /api/governance`, `GET /api/teams`, `GET /api/governance/reachable`) that could provide valuable context for skill suggestions.

**Current plugin behavior:** PSS analyzes user prompt, project context, conversation history, and skill index to suggest skills. No team or governance awareness.

**Impact:** PSS will continue to work without changes. This is NOT a breaking conflict. However, PSS misses context that could improve suggestions:
- An agent in a team with COS could benefit from governance-related skill suggestions
- The team context (which agents are teammates) could influence collaboration skill suggestions
- Governance status (hasManager, hasPassword) could trigger governance setup skill suggestions

**Optional enhancement:** PSS could optionally leverage the `agent-messaging` skill's team discovery patterns (which teach querying `GET /api/teams`) to enrich suggestion context with governance and team awareness. This requires no plugin script changes — the agent simply uses the already-installed `agent-messaging` skill to discover team context before generating suggestions.

### CONFLICT-2: Skill Index Doesn't Include Governance Skills (LOW)

**Problem:** The PR introduces governance-related skills in AI Maestro (e.g., `team-governance` skill at `/Users/emanuelesabetta/.claude/skills/team-governance/SKILL.md`). PSS's skill index may not include these if they were added after the last reindex.

**Current plugin behavior:** PSS reindexes on demand (`/pss-reindex-skills`). New skills added between reindexes are invisible.

**Required change:** After AI Maestro governance is set up, run `/pss-reindex-skills` to pick up the `team-governance` skill and any other new governance-related skills. Consider adding a hook that triggers reindex when new skills are installed. The `team-governance` skill and any other governance-related skills will then appear in PSS's index for activation.

### Summary

PSS has **no breaking conflicts** with the PR. All conflicts are optional enhancements:

| Conflict | Severity | Required? | Effort |
|----------|----------|-----------|--------|
| C1: No governance context | LOW | No | Medium |
| C2: Skill index freshness | LOW | Recommended | Low (just reindex) |

PSS's standalone architecture means it will continue to function identically with or without the governance PR. However, governance context could meaningfully improve suggestion relevance for team-based workflows.

---

## Appendix: Key File Paths

| File | Purpose |
|------|---------|
| `/tmp/audit-skill-suggester/.claude-plugin/plugin.json` | Plugin manifest (version 2.1.0) |
| `/tmp/audit-skill-suggester/agents/pss-agent-profiler.md` | Agent profiler definition |
| `/tmp/audit-skill-suggester/skills/pss-agent-toml/SKILL.md` | .agent.toml builder skill |
| `/tmp/audit-skill-suggester/skills/pss-usage/SKILL.md` | PSS usage skill |
| `/tmp/audit-skill-suggester/commands/pss-setup-agent.md` | /pss-setup-agent command |
| `/tmp/audit-skill-suggester/commands/pss-reindex-skills.md` | /pss-reindex-skills command |
| `/tmp/audit-skill-suggester/schemas/pss-agent-toml-schema.json` | .agent.toml JSON Schema |
| `/tmp/audit-skill-suggester/scripts/pss_hook.py` | Hook dispatcher (Python) |
| `/tmp/audit-skill-suggester/scripts/pss_validate_agent_toml.py` | .agent.toml validator |
| `/tmp/audit-skill-suggester/hooks/hooks.json` | Hook registration |
| `/tmp/audit-skill-suggester/docs/PSS-ARCHITECTURE.md` | Architecture design doc |
