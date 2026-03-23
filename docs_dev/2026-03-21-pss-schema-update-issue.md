# PSS .agent.toml Schema Update Request

## Issue Title
Update .agent.toml schema: add [description], [output_styles], expand [dependencies], and support AI Maestro role-plugin generation

## Issue Body

### Summary

The `.agent.toml` schema needs several updates to support the full Claude Code plugin ecosystem and AI Maestro's role-plugin generation workflow. The PSS profiler and the `/pss-make-plugin-from-profile` command both need to be updated.

### 1. New `[description]` Section (after `[agent]`)

Add a `[description]` section with a `text` key:

```toml
[description]
text = "A TypeScript backend architect specializing in Node.js microservices, API design, and database optimization. Creates scalable, maintainable server-side applications."
```

**Purpose:**
- Used by the plugin generator to populate `plugin.json` `description` field
- Used to generate the `README.md` file inside the plugin
- Used as the persona markdown's introduction paragraph
- The PSS profiler should generate this description based on the agent's skills and role

**Where it goes in the schema:** Section 2 (between `[agent]` and `[skills]`).

### 2. New `[output_styles]` Section (after `[lsp]`)

Add an `[output_styles]` section following the same pattern as other component sections:

```toml
[output_styles]
recommended = []
```

**Purpose:** Claude Code plugins can include an `output-styles/` directory with custom formatting styles. The PSS indexer should scan for these in installed plugins and include them in the generated profile.

**What to index:** Scan `output-styles/` directories in all indexed plugins. Each file in the directory is an output style element.

**Where it goes in the schema:** Section 10 (between `[lsp]` and `[dependencies]`).

### 3. Expand `[dependencies]` Sub-keys

The `[dependencies]` section needs an `output_styles` sub-key added:

```toml
[dependencies]
plugins = []
skills = []
rules = []
agents = []
commands = []
hooks = []
mcp_servers = []
lsp_servers = []
output_styles = []  # NEW
tools = []
frameworks = []
```

This brings the total to 11 sub-keys. All must be present even if empty.

### 4. Plugin Generation Updates (`/pss-make-plugin-from-profile`)

When generating a plugin from a `.agent.toml`, the command should:

#### a. Use `[description].text` for plugin metadata
- Set `plugin.json` `description` to `[description].text`
- Generate a `README.md` at the plugin root using the description as the introduction

#### b. Include `output-styles/` directory
If `[output_styles].recommended` is non-empty, create an `output-styles/` directory in the generated plugin.

#### c. Include `[dependencies]` in the generated plugin
The `[dependencies]` section should be preserved in the `.agent.toml` file that gets copied into the plugin root. AI Maestro reads this to check prerequisites before installation.

#### d. AI Maestro Role-Plugin Compatibility (3 additional files)

When the generated plugin is used as an AI Maestro role-plugin, 3 additional files are needed. These are NOT the responsibility of PSS to generate (AI Maestro adds them post-generation), but PSS should ensure its output doesn't conflict with them:

1. **Quadruple equality rule:** The plugin must satisfy:
   - `plugin.json` `name` == plugin directory name == `[agent].name` in TOML == main-agent filename stem

2. **Main agent file:** `agents/<plugin-name>-main-agent.md` with frontmatter:
   ```yaml
   ---
   name: <plugin-name>-main-agent
   description: <from [description].text>
   model: <from [agent].model>
   ---
   ```

3. **TOML at plugin root:** `<plugin-name>.agent.toml` (copy of the source profile)

**PSS should ensure:**
- The generated `plugin.json` `name` matches `[agent].name`
- The generated plugin directory name matches `[agent].name`
- No conflicting `agents/<name>-main-agent.md` is generated (leave room for AI Maestro to add it)

### 5. Updated Schema (Complete)

```toml
# Section 1: Identity
[agent]
name = "role-name"
program = "claude-code"
model = "sonnet"
workingDirectory = "~/agents/<persona-name>"

# Section 2: Description (NEW)
[description]
text = "Description of the role-plugin for README and plugin.json"

# Section 3: Skills
[skills]
primary = []
secondary = []
specialized = []

# Section 4: Rules
[rules]
recommended = []

# Section 5: Sub-agents
[agents]
recommended = []

# Section 6: Commands
[commands]
recommended = []

# Section 7: Hooks
[hooks]
recommended = []

# Section 8: MCP Servers
[mcp]
recommended = []

# Section 9: LSP Servers
[lsp]
recommended = []

# Section 10: Output Styles (NEW)
[output_styles]
recommended = []

# Section 11: Dependencies (ALWAYS LAST)
[dependencies]
plugins = []
skills = []
rules = []
agents = []
commands = []
hooks = []
mcp_servers = []
lsp_servers = []
output_styles = []  # NEW
tools = []
frameworks = []
```

### 6. PSS Indexer Changes

The PSS Rust binary indexer needs to:
1. **Scan `output-styles/` directories** in plugins — each file is an indexable element
2. **Include output-styles in matching** — when profiling an agent, consider relevant output styles
3. **Generate `[output_styles].recommended`** in the profile output
4. **Generate `[description].text`** — use the agent's skills and role to write a meaningful description

### Checklist

- [ ] Add `[description]` section to schema (after `[agent]`)
- [ ] Add `[output_styles]` section to schema (after `[lsp]`)
- [ ] Add `output_styles` to `[dependencies]` sub-keys
- [ ] Update PSS indexer to scan `output-styles/` directories
- [ ] Update profiler to generate `[description].text`
- [ ] Update profiler to generate `[output_styles].recommended`
- [ ] Update `/pss-make-plugin-from-profile` to handle new sections
- [ ] Update `/pss-make-plugin-from-profile` to use `[description].text` for plugin.json and README
- [ ] Ensure plugin.json `name` matches `[agent].name` (quad-match compatibility)
- [ ] Update PSS schema validation to accept 11 sections
