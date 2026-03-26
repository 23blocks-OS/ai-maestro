# CPV Compliance Specification for SKILL.md Files

This spec defines the rules that every SKILL.md file must follow to pass CPV validation with 0 MINOR issues.

---

## Rule 1: Character Limit
- SKILL.md MUST be under 4000 characters total (including frontmatter)
- If over 4000 chars: move detailed content to references/ directory
- SKILL.md is a concise overview only — detailed docs go in references/

## Rule 2: Required Sections (all 7 must exist)
Every SKILL.md must contain these exact section headers:
```
## Overview
## Prerequisites
## Instructions
## Output
## Error Handling
## Examples
## Resources
```

## Rule 3: Instructions Section
- Must contain numbered steps (1. 2. 3. format)
- At least 3 numbered steps

## Rule 4: Examples Section
- Must contain at least one concrete input/output example
- Must include a code block (``` block) showing actual usage
- Must show expected output or result description after the code block

## Rule 5: Checklist Section
- Must have a `## Checklist` section (8th section, after Examples)
- Must start with: "Copy this checklist and track your progress:"
- Must contain at least 3 items using `- [ ]` format

## Rule 6: Scoped Bash in allowed-tools
- Never use bare `Bash` in allowed-tools frontmatter
- Always use scoped: `Bash(script-name:*)`, `Bash(curl:*)`, `Bash(jq:*)`, etc.

## Rule 7: Description Field
- Must include "Use when ..." phrase
- Must include "Trigger with /skill-name" phrase
- Must NOT contain angle brackets like <query> or <file> (XML tag violation)
- Must be under 200 characters

## Rule 8: Reference Files
- All reference .md files must have a `## Table of Contents` section in the first 50 lines
- Each TOC entry must be an anchor link: `- [Section Name](#section-name)`

## Rule 9: TOC Embedding in SKILL.md
- In the `## Resources` section, every referenced .md file must have its TOC embedded
- Format: indented bullets under the link listing all headings from the referenced file
- Example:
  ```
  - [Full Reference](references/REFERENCE.md) — Complete API docs
    - CLI Quick Reference
    - Agent Lifecycle Commands
    - Plugin Management
  ```

## Rule 10: Shellcheck Compliance
- All .sh scripts must pass shellcheck with no warnings
- Use `# shellcheck disable=SCXXXX` on its own line before the problematic line (not inline)
- Common fixes: SC2034 (unused vars) → export or disable, SC2015 → use if/then/else

## Rule 11: Repository Files
- Must have .gitignore (covering: node_modules, .DS_Store, *.log, .env, dist, build, coverage, .cache, .venv, __pycache__, .claude, .mypy_cache, .ruff_cache, llm_externalizer_output, .tldr)
- Must have LICENSE file (MIT)
- Must have .githooks/pre-push (executable)
- README.md must have badge markers (<!--BADGES-START--> / <!--BADGES-END-->)
