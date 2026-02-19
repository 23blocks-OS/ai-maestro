# AI Maestro Skills Structure Analysis
Generated: 2026-02-16

## Summary

AI Maestro skills are Markdown-based instruction files (SKILL.md) that provide Claude Code with domain-specific knowledge and behavioral rules. Skills are stored as directories containing a SKILL.md file and optional resources (templates, etc.). They flow from the plugin source to the user environment via `install-messaging.sh`.

---

## 1. Storage Paths

### Plugin Source Skills (6 skills)
```
/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/skills/
  agent-messaging/SKILL.md
  ai-maestro-agents-management/SKILL.md
  docs-search/SKILL.md
  graph-query/SKILL.md
  memory-search/SKILL.md
  planning/SKILL.md
  planning/templates/findings.md
  planning/templates/progress.md
  planning/templates/task_plan.md
```

### Plugin Build/Src Skills (5 skills, no agent-messaging)
```
/Users/emanuelesabetta/ai-maestro/plugin/src/skills/
  ai-maestro-agents-management/SKILL.md
  docs-search/SKILL.md
  graph-query/SKILL.md
  memory-search/SKILL.md
  planning/SKILL.md
```
Note: `agent-messaging` only exists in `plugin/plugins/ai-maestro/skills/`, not in `plugin/src/skills/`.

### User-Installed Skills (~90+ skills)
```
~/.claude/skills/
  agent-messaging/SKILL.md          <-- installed from plugin
  ai-maestro-agents-management/     <-- installed from plugin
  docs-search/                      <-- installed from plugin
  graph-query/                      <-- installed from plugin
  memory-search/                    <-- installed from plugin
  planning/                         <-- installed from plugin (has templates/ subdir)
  commit/SKILL.md                   <-- third-party/marketplace skill
  explore/SKILL.md                  <-- third-party/marketplace skill
  ... ~80+ more third-party skills
```

### Skill Scopes (from agent-management SKILL.md)
| Scope | Location | Access |
|-------|----------|--------|
| `user` | `~/.claude/skills/<name>/` | All projects for this user |
| `project` | `<agent-dir>/.claude/skills/<name>/` | All collaborators on this project |
| `local` | `<agent-dir>/.claude/skills/<name>/` | Only this user, only this project |

### Backup Convention
When skills are reinstalled, the installer creates timestamped backups:
```
~/.claude/skills/agent-messaging.backup-20260216034359/SKILL.md
```

---

## 2. SKILL.md Format

### Two Format Variants

**Variant A: YAML Frontmatter (AI Maestro native skills + some third-party)**
```markdown
---
name: <skill-name>
description: <one-line description used by Claude for skill matching>
allowed-tools: <tool list, either string or array>
user-invocable: true|false       # optional, defaults to false
keywords: [keyword1, keyword2]   # optional, for search/matching
metadata:
  author: <author>
  version: "<semver>"
---

# Skill Title

## CRITICAL: AUTOMATIC BEHAVIOR - READ THIS FIRST
(behavioral instructions)

## Available Commands
(command reference)

## Error Handling
(troubleshooting)
```

**Variant B: Minimal Frontmatter (third-party/marketplace skills)**
```markdown
---
description: <one-line description>
---

# Skill Title

## When to Use This Skill
(trigger conditions)

## Process:
(step-by-step instructions)
```

### Frontmatter Fields

| Field | Required | Example | Purpose |
|-------|----------|---------|---------|
| `name` | No* | `graph-query` | Skill identifier (* AI Maestro skills always include it) |
| `description` | Yes | `"PROACTIVELY query the code graph..."` | Claude uses this to decide when to invoke the skill |
| `allowed-tools` | No | `Bash` or `[Bash, Task, Read]` | Restricts which tools the skill can use |
| `user-invocable` | No | `true` | Whether user can invoke with slash command |
| `keywords` | No | `[explore, codebase]` | Search/matching keywords |
| `metadata` | No | `{author, version}` | Skill metadata |
| `metadata.author` | No | `23blocks` | Author name |
| `metadata.version` | No | `"1.0"` | Semantic version |

### Body Structure Pattern (AI Maestro skills)

1. **Title**: `# AI Maestro <Skill Name>`
2. **Critical Behavior Section**: `## CRITICAL: AUTOMATIC BEHAVIOR - READ THIS FIRST` - behavioral instructions that override defaults
3. **Overview/Purpose**: What the skill does
4. **Commands Table**: Available CLI commands with descriptions
5. **Usage Patterns**: Tables mapping user actions to skill behaviors
6. **Examples**: Concrete usage examples with bash blocks
7. **Error Handling**: Troubleshooting section
8. **Installation**: How to install if missing

### Body Structure Pattern (third-party skills)

1. **Title**: `# Skill Name`
2. **When to Use**: Trigger conditions
3. **Process**: Step-by-step workflow
4. **Important**: Key constraints
5. **Remember**: Additional rules

---

## 3. Skill Examples Analyzed

### Example 1: `agent-messaging` (418 lines)
- **Frontmatter**: name, description, allowed-tools (Bash only), metadata
- **Key sections**: Identity Check (run first), Quick Start, Address Formats, Commands, Message Types table, Priority Levels, Natural Language Interface, Example Workflows, Local Storage layout, Security, Troubleshooting
- **Extra files**: None (SKILL.md only)

### Example 2: `planning` (286 lines)
- **Frontmatter**: name, description, allowed-tools (Read,Write,Edit,Bash,Glob,Grep), user-invocable: true, metadata
- **Key sections**: Problem statement, Core Principle, 3-File Pattern, Quick Start, 6 Rules, 3-Strike Protocol, When to Read vs Write, 5-Question Reboot, Anti-Patterns, Integration with Memory Skill, Templates reference
- **Extra files**: `templates/task_plan.md`, `templates/findings.md`, `templates/progress.md`

### Example 3: `graph-query` (163 lines)
- **Frontmatter**: name, description, allowed-tools (Bash only), metadata
- **Key sections**: Automatic Behavior rule (Read File -> Query Graph -> Proceed), Query Commands table, Delta Indexing, Component Types, Error Handling

### Example 4: `ai-maestro-agents-management` (1203 lines, largest)
- **Frontmatter**: name, description, allowed-tools (Bash), metadata (version "2.0")
- **Key sections**: 4 Parts (Lifecycle, Plugin Management, Export/Import, Skill Management), 24 numbered command sections, Decision Guide, Troubleshooting, Error Messages table

### Example 5: `commit` (third-party, 58 lines, minimal)
- **Frontmatter**: description only (no name, no allowed-tools)
- **Key sections**: When to Use, Process (5 steps), Important, Remember

### Example 6: `explore` (third-party, 475 lines)
- **Frontmatter**: name, description, allowed-tools (array), keywords (array)
- **Key sections**: Question Flow (interactive), Depths table, Options table, Workflow Details (per depth), Output Formats, Implementation, Related Skills, Troubleshooting

---

## 4. Installation Mechanism

### Primary Installer: `install-messaging.sh`

**Location**: `/Users/emanuelesabetta/ai-maestro/install-messaging.sh`

**Source**: `plugin/plugins/ai-maestro/` (git submodule)

**Install Flow**:
1. Resolves `PLUGIN_DIR` from script location: `$SCRIPT_DIR/plugin/plugins/ai-maestro`
2. Auto-initializes git submodule if not present
3. Checks prerequisites (curl, jq, openssl, tmux, claude)
4. Migrates old messages if needed
5. Offers interactive menu: scripts only / skills only / both
6. **Scripts install**: Copies `$PLUGIN_DIR/scripts/amp-*.sh` to `~/.local/bin/`, creates symlinks without `.sh` extension, installs additional tools (graph, memory, docs)
7. **Skills install** (lines 707-791):
   - Creates `~/.claude/skills/` if needed
   - For `agent-messaging` skill:
     - Backs up existing to `agent-messaging.backup-<timestamp>`
     - Copies to temp dir, then atomic swap (rm old + mv temp)
     - Verifies SKILL.md exists and reports byte size
   - For other skills (`graph-query`, `memory-search`, `docs-search`, `planning`, `ai-maestro-agents-management`):
     - Same backup + atomic-swap pattern
8. Verifies installation by checking file existence
9. Sets up PATH (`~/.local/bin` in shell rc)

**Key code (skill install loop)**:
```bash
OTHER_SKILLS=("graph-query" "memory-search" "docs-search" "planning" "ai-maestro-agents-management")
for skill in "${OTHER_SKILLS[@]}"; do
    # backup existing → copy to temp → atomic swap
done
```

### Secondary Installer: `aimaestro-agent.sh skill install`

The agent management CLI also supports skill installation:
```bash
aimaestro-agent.sh skill install <agent> <source> [-s|--scope user|project|local] [--name <name>]
```
- Accepts `.skill` zip archives or skill directories containing SKILL.md
- Copies to appropriate scope location
- Separate from registry tracking (`skill add`/`skill remove`)

### Skill Registry vs Filesystem

Two independent systems:
1. **Registry** (`skill add`/`remove`/`list`): Tracks which skills an agent has in AI Maestro metadata (API calls, no file copying)
2. **Filesystem** (`skill install`/`uninstall`): Actually copies/removes skill files on disk

---

## 5. Plugin Manifest

**Location**: `/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/.claude-plugin/plugin.json`

**Contents** (minimal):
```json
{
  "name": "ai-maestro",
  "version": "1.0.0",
  "author": {
    "name": "23blocks"
  },
  "homepage": "https://github.com/23blocks-OS/ai-maestro",
  "license": "MIT"
}
```

This is the Claude Code plugin manifest format. It identifies the plugin but does not enumerate skills -- skills are discovered by directory structure (each subdirectory of `skills/` containing a SKILL.md).

---

## 6. Key Patterns and Conventions

### Directory Convention
- Each skill = one directory named after the skill
- Directory MUST contain `SKILL.md` at the top level
- Directory MAY contain additional resources (templates, scripts, etc.)
- Directory name = skill identifier (kebab-case)

### Description Field is Critical
The `description` field in frontmatter is how Claude Code decides when to invoke a skill. It should be a clear, action-oriented sentence describing the trigger condition. AI Maestro skills use imperative/behavioral descriptions ("PROACTIVELY search...", "Use persistent markdown files...").

### Behavioral Override Pattern
AI Maestro skills use a distinctive "CRITICAL: AUTOMATIC BEHAVIOR" section that overrides Claude's default behavior. This pattern includes:
- "THIS IS NOT OPTIONAL" declarations
- DO NOT / ALWAYS lists
- The Rule pattern: "Action A -> Action B -> Then Proceed"

### Atomic Install Pattern
The installer uses a safe atomic install pattern:
1. Backup existing to `.backup-<timestamp>`
2. Copy new to `.tmp.XXXXXX`
3. Remove old, rename tmp to final
4. On failure: clean temp, restore from backup

### No Central Skill Registry File
Skills are NOT registered in a manifest or index file. They are discovered by:
- File system scanning of `~/.claude/skills/*/SKILL.md`
- The SKILL.md frontmatter provides metadata for matching/invocation
