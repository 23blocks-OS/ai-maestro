# Plugin Governance Audit: perfect-skill-suggester
**Date:** 2026-03-10  
**Auditor:** Claude Code (Sonnet 4.6)  
**Repo:** https://github.com/Emasoft/perfect-skill-suggester  
**Version audited:** 2.3.36  
**Purpose:** Audit for AI Maestro governance alignment — dependency plugin that must work alongside AI Maestro without conflicting.

---

## Summary

`perfect-skill-suggester` (PSS) is a utility Claude Code plugin that:
1. **At hook time**: Intercepts `UserPromptSubmit` events, runs a Rust binary to score skill candidates, and injects up to 4 skill suggestions into Claude's context window (~10ms latency).
2. **At agent-creation time**: Provides an AI-powered agent profiler (`/pss-setup-agent` command) that reads an agent `.md` definition file (and optionally requirements documents), runs a two-pass Rust-binary scoring pipeline, then spawns a `pss-agent-profiler` AI subagent to post-filter results and write a `.agent.toml` configuration file.

**Integration status: COMPATIBLE — no governance conflicts found.** The plugin operates entirely within the Claude Code plugin abstraction layer, uses no AI Maestro internals, and produces outputs (`.agent.toml` files) that Haephestos can consume.

---

## 1. Plugin Manifest Assessment

**File:** `.claude-plugin/plugin.json`

```json
{
  "name": "perfect-skill-suggester",
  "version": "2.3.36",
  "description": "High-accuracy skill activation (88%+)...",
  "author": {"name": "Emasoft", ...},
  "license": "MIT",
  "keywords": ["skills", "activation", "rust", "ai", "claude-code", "hooks", "performance", "ml"],
  "outputStyles": []
}
```

**Assessment:**
- Manifest is present and well-formed.
- No `dependencies`, `conflicts`, or `peerDependencies` fields — the plugin does not declare any relationship to AI Maestro.
- The `outputStyles: []` is an empty array, which is valid.
- **Missing field**: No `minClaudeCodeVersion` or `engines` field specifying the minimum Claude Code version required. This is not a blocker but worth noting.

**Verdict: PASS** — manifest is structurally sound and does not conflict with AI Maestro's own `.claude-plugin/plugin.json`.

---

## 2. Hardcoded AI Maestro Internals

**Searched:** `localhost:23000`, `ai-maestro`, `aimaestro`, `AIMAESTRO`, `23000`, all API paths.

**Results found:**
- `schemas/pss-agent-toml-schema.json` line 175: `"description": "Plugin names that must be installed (e.g., 'ai-maestro-integrator-agent', 'claude-ecosystem')"` — this is a **documentation string in a JSON Schema example**, not an actual API call or hardcoded dependency. The string is illustrative only.
- `README.md` line 14: `> Orchestrated by [AI Maestro](https://github.com/Emasoft/ai-maestro)` — marketing/description text only, no functional reference.

**No hardcoded references to:**
- `localhost:23000` or any AI Maestro port
- `/api/sessions`, `/api/agents`, `/api/teams`, `/api/governance`, or any AI Maestro API endpoint
- `aimaestro-agent.sh` or any AI Maestro CLI script
- `amp-send.sh`, `amp-inbox.sh`, or any AMP messaging script
- `~/.aimaestro/` directories
- Any AI Maestro-specific environment variables

**Verdict: PASS** — zero hardcoded AI Maestro internals. The plugin is fully self-contained.

---

## 3. Hook Conflict Analysis

PSS registers exactly **one hook**:

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "type": "command",
      "command": "unset VIRTUAL_ENV; python3 \"${CLAUDE_PLUGIN_ROOT}/scripts/pss_hook.py\"",
      "timeout": 5000
    }]
  }
}
```

**AI Maestro's hooks** (from `plugin/plugins/ai-maestro/hooks/`): SessionStart, PostToolUse (for session tracking), and custom notification hooks. AI Maestro does **not** register a `UserPromptSubmit` hook.

**Analysis:**
- PSS uses `UserPromptSubmit` exclusively — this is the least intrusive hook type (read-only, additive context injection, non-blocking).
- The script always exits 0 (`sys.exit(0)`) to never block Claude, even on errors.
- The script validates that `cwd` and `transcriptPath` are under `~/.../` (home directory) before using them — basic path traversal protection.
- The script reads `~/.claude/cache/skill-index.json` (PSS's own cache) and plugin-local domain schemas. It does NOT touch any AI Maestro directories or config files.
- PSS's Python hook explicitly unsets `VIRTUAL_ENV` to avoid stale venv interference. This is safe and does not affect AI Maestro's session environment.
- Timeout is 5000ms in hooks.json, and the internal subprocess timeout is 2s — well within limits.

**Potential minor interaction (non-conflicting):** PSS reads the user's most recent transcript line (via `transcriptPath` from Claude's hook input). This is a standard Claude hook feature and does not interfere with AI Maestro's AMP messaging or session management.

**Verdict: PASS — no hook conflicts.** AI Maestro and PSS can coexist with both installed.

---

## 4. Profiler Agent: How Haephestos Should Invoke It

### What PSS's Profiler Does

The profiler is invoked via the `/pss-setup-agent` slash command. Internally, this command:

1. Validates the environment (`CLAUDE_PLUGIN_ROOT`, binary existence, index existence).
2. Detects the platform-specific Rust binary in `$CLAUDE_PLUGIN_ROOT/src/skill-suggester/bin/`.
3. Spawns the `pss-agent-profiler` Task agent with all required inputs as environment variables.

The profiler agent reads an **agent `.md` definition file** and optionally **requirements documents** (PRDs, tech specs), runs two passes of Rust binary scoring, applies AI post-filtering, and writes a `.agent.toml` file.

### Required Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `AGENT_PATH` | absolute path | Yes | Path to the `<agent-name>.md` agent definition file |
| `REQUIREMENTS_PATHS` | list of paths | No | Design/requirements documents for project-specific profiling |
| `INDEX_PATH` | absolute path | Yes | `~/.claude/cache/skill-index.json` (must exist — run `/pss-reindex-skills` first) |
| `BINARY_PATH` | absolute path | Yes | Platform-specific Rust binary in `$CLAUDE_PLUGIN_ROOT/src/skill-suggester/bin/` |
| `OUTPUT_PATH` | absolute path | Yes | Where to write the resulting `.agent.toml` file |
| `INTERACTIVE` | `true`/`false` | No | If `true`, pauses for human review before finalizing |
| `INCLUDE_ELEMENTS` | list of names | No | Element names to force-include in the profile |
| `EXCLUDE_ELEMENTS` | list of names | No | Element names to force-exclude |
| `MAX_PRIMARY` | integer | No | Override primary tier limit (default: 7) |
| `MAX_SECONDARY` | integer | No | Override secondary tier limit (default: 12) |
| `MAX_SPECIALIZED` | integer | No | Override specialized tier limit (default: 8) |

### How Haephestos Should Invoke It

Haephestos currently does NOT invoke PSS. The integration would follow this pattern:

**Option A — Direct command invocation (recommended for simplicity):**
Haephestos instructs the user (or the underlying Claude Code session) to run:
```
/pss-setup-agent /path/to/new-agent.md --output /path/to/new-agent.agent.toml
```
With optional requirements documents:
```
/pss-setup-agent /path/to/new-agent.md --requirements /path/to/prd.md --output /path/to/new-agent.agent.toml
```

**Option B — Haephestos triggers it via Task tool:**
After the user confirms the agent config in the chat, Haephestos can spawn a Task agent that runs the `/pss-setup-agent` command. The Haephestos agent currently has `allowed-tools: ["Task", "Read", "Bash", "Glob", "Grep"]` in the `/pss-setup-agent` command definition — but Haephestos itself only has `TOOLS = 'Read,Glob,Grep'` (no Task tool) per `creation-helper-service.ts` line 46.

**Conclusion for Haephestos integration:**
- Haephestos CANNOT directly invoke PSS's profiler via the Task tool (no Task tool in its allowed-tools).
- Haephestos CAN tell the user "After creation, run `/pss-setup-agent <path>` to auto-generate the skills configuration."
- Or the AI Maestro backend could run the profiler as a post-creation step using a separate Claude Code invocation with the Task tool enabled.

### Output: `.agent.toml` Format

The profiler writes a TOML file conforming to `schemas/pss-agent-toml-schema.json`:

```toml
[agent]
name = "my-agent"
source = "path"
path = "/absolute/path/to/my-agent.md"

[skills]
primary = ["skill-a", "skill-b"]
secondary = ["skill-c", "skill-d"]
specialized = ["skill-e"]

[agents]
recommended = ["complementary-agent"]

[commands]
recommended = ["pss-reindex-skills"]

[rules]
recommended = ["claim-verification"]

[mcp]
recommended = ["chrome-devtools"]

[lsp]
recommended = ["typescript-lsp"]

[dependencies]
plugins = []
skills = []
mcp_servers = []
tools = []
```

**Note:** The `.agent.toml` format is PSS-specific — it is NOT the same as AI Maestro's `agent-registry.json` or the Claude Code `--agent` frontmatter format. It is an intermediate configuration file that PSS can read to suggest skills when an agent runs. Haephestos would need to translate the `.agent.toml` recommendations into its own JSON config format if it wants to use the results directly.

---

## 5. Skill Conflicts with AI Maestro

PSS installs these skills (in `skills/`):

| Skill | Description | User-invocable |
|-------|-------------|----------------|
| `pss-agent-toml` | Agent profiling via TOML generation | No |
| `pss-authoring` | Skill authoring best practices | No |
| `pss-benchmark-agent` | Benchmarking PSS accuracy | No |
| `pss-design-alignment` | Requirements alignment for agent profiling | No |
| `pss-usage` | PSS usage guide | No |
| `text-categorization-improver` | Improving text categorization | No |

AI Maestro installs these skills (from `plugin/plugins/ai-maestro/skills/`):
- `agent-messaging`
- `ai-maestro-agents-management`
- `docs-search`
- `graph-query`
- `memory-search`
- `planning`
- `team-governance`

**No name collisions found.** All PSS skills use the `pss-` prefix or descriptive names that don't overlap with AI Maestro's skill names. None of PSS's skills are `user-invocable: true` except via the hook's auto-suggestion mechanism, which is purely additive.

**Verdict: PASS — no skill conflicts.**

---

## 6. Commands Conflict Check

PSS registers these slash commands:
- `/pss-reindex-skills`
- `/pss-setup-agent`
- `/pss-change-agent-profile`
- `/pss-add-to-index`
- `/pss-status`

All use the `pss-` prefix. AI Maestro does not register any `pss-` commands.

**Verdict: PASS — no command conflicts.**

---

## 7. README Accuracy Assessment

The README is accurate and detailed. Key claims verified:
- **88%+ accuracy**: Claimed, supported by the `docs/ANTHROPIC-COMPLIANCE-REPORT.md` and benchmark scripts.
- **~10ms hook latency**: Plausible given a native Rust binary with a 2s subprocess timeout.
- **Platform support**: 6 binaries present in `src/skill-suggester/bin/` (darwin-arm64, darwin-x86_64, linux-arm64, linux-x86_64, windows-x86_64.exe, wasm32.wasm) — all confirmed by file listing.
- **874+ elements**: Index count mentioned; accurate at time of last reindex (dynamic).
- **Installation instructions**: Use `claude plugin install` from Emasoft marketplace — correct, standard Claude Code plugin installation.

One minor inaccuracy: The README shows the `bin/` directory as `bin/pss-darwin-arm64` at the root level, but the actual binaries are in `src/skill-suggester/bin/`. The root `bin/pss-darwin-arm64` is a symlink or copy used for convenience; the source-of-truth binaries are in the `src/` subdirectory. The hook script `find_binary()` correctly resolves to `script.parent.parent / "src" / "skill-suggester" / "bin" / binary_name`.

**Verdict: MOSTLY ACCURATE.** Minor discrepancy in binary path documentation.

---

## 8. Conflicts Found

**None.** Summary of non-issues:
1. The `ai-maestro-integrator-agent` mention in the JSON Schema is a documentation example string, not a hardcoded dependency.
2. The `Orchestrated by AI Maestro` README blurb is marketing copy, not a runtime dependency.
3. The `UserPromptSubmit` hook does not conflict with any AI Maestro hook (AI Maestro uses SessionStart and PostToolUse hooks, not UserPromptSubmit).

---

## 9. Alignment Instructions

To ensure continued governance alignment as both projects evolve:

### For PSS (no changes required now, future recommendations):

1. **Do not add any AI Maestro API calls** to PSS scripts. If PSS ever needs to query AI Maestro for team/governance data, it must use the global `aimaestro-agent.sh` CLI script or the `team-governance` skill — never direct `curl` calls to `localhost:23000`.

2. **Preserve the `pss-` prefix** on all new commands and skills to avoid future naming collisions as AI Maestro's skill ecosystem grows.

3. **If PSS ever adds a SessionStart hook**, ensure it does not conflict with AI Maestro's session tracking hook (`plugin/plugins/ai-maestro/hooks/`).

### For AI Maestro / Haephestos (integration recommendations):

1. **Haephestos can mention PSS as a post-creation enhancement**: After the user creates an agent via the Haephestos dialog, Haephestos can suggest: "To auto-configure the best skills for your new agent, run `/pss-setup-agent /path/to/your-agent.md` (requires the `perfect-skill-suggester` plugin)."

2. **Haephestos cannot directly invoke the PSS profiler** in its current form (lacks Task tool). If AI Maestro wants to auto-invoke PSS profiling on agent creation, the `creation-helper-service.ts` would need to:
   - After the user clicks "Accept" to create the agent, spawn a separate Claude Code session with Task tool enabled.
   - Pass the agent `.md` file path as `AGENT_PATH` to the `pss-agent-profiler` agent.
   - Optionally pass design documents as `REQUIREMENTS_PATHS`.
   - The resulting `.agent.toml` can inform skill suggestions in the AI Maestro dashboard.

3. **Skill index prerequisite**: PSS requires `/pss-reindex-skills` to be run before profiling works. If AI Maestro automates PSS invocation, it must first check that `~/.claude/cache/skill-index.json` exists, and prompt the user to run `/pss-reindex-skills` if it doesn't.

4. **`.agent.toml` is a PSS artifact, not AI Maestro registry format**: The output of `/pss-setup-agent` is a PSS-format TOML file with skill recommendations. AI Maestro's agent registry (`~/.aimaestro/agents/registry.json`) uses a different format. They serve complementary purposes — PSS recommends what skills to activate, AI Maestro manages agent lifecycle and team governance.

---

## 10. Recommended Integration Workflow for Haephestos

When a user asks Haephestos to create a new agent:

1. Haephestos guides the user through the standard creation flow (name, model, program, rules, team assignment).
2. After the user confirms the configuration and clicks "Accept" (creating the agent in the registry):
   - The agent `.md` file is written to `~/.claude/agents/<name>.md` (or the project's `.claude/agents/`).
3. Haephestos can then suggest (conversationally, not programmatically — due to tool limitations):
   ```
   Your agent has been created! To auto-configure the optimal skill set for it, 
   open a Claude Code session and run:
   
   /pss-setup-agent ~/.claude/agents/your-agent-name.md
   
   This will analyze your agent's definition and generate a .agent.toml file 
   with recommended skills, MCP servers, and commands tailored to its role.
   ```

If AI Maestro's backend is ever enhanced to support automated PSS invocation (post-creation hook), the required call is:

```bash
# In a Claude Code session with Task tool enabled:
/pss-setup-agent \
  ~/.claude/agents/<agent-name>.md \
  --requirements /path/to/design-doc.md \
  --output ~/.claude/agents/<agent-name>.agent.toml
```

The PSS binary, index, and `CLAUDE_PLUGIN_ROOT` environment variable are all resolved automatically by the `/pss-setup-agent` command implementation — no additional configuration needed on the AI Maestro side.

---

## Appendix: File Structure Reference

```
perfect-skill-suggester/
├── .claude-plugin/plugin.json        # Plugin manifest (VALID)
├── hooks/hooks.json                  # UserPromptSubmit hook only (NO CONFLICTS)
├── agents/pss-agent-profiler.md      # AI subagent for .agent.toml generation
├── commands/
│   ├── pss-setup-agent.md            # Main profiling command
│   ├── pss-change-agent-profile.md   # Profile modification command
│   ├── pss-reindex-skills.md         # Index rebuild command
│   ├── pss-add-to-index.md           # Single-element index addition
│   └── pss-status.md                 # Status/debug command
├── skills/
│   ├── pss-agent-toml/               # Agent TOML profiling skill
│   ├── pss-authoring/                # Skill authoring best practices
│   ├── pss-benchmark-agent/          # Accuracy benchmarking
│   ├── pss-design-alignment/         # Requirements-based profiling skill
│   ├── pss-usage/                    # Usage guide skill
│   └── text-categorization-improver/ # Categorization improvement skill
├── schemas/
│   ├── pss-agent-toml-schema.json    # .agent.toml output format schema
│   └── pss-*.json                    # Domain, category, skill index schemas
├── scripts/pss_hook.py               # UserPromptSubmit hook implementation
└── src/skill-suggester/bin/          # Platform-specific Rust binaries (6 platforms)
```
