# LLM Externalizer Response

- **Tool**: `check_against_specs`
- **Model**: `ensemble: google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-26T22:08:23.705Z
- **Input file**: `/tmp/ai-maestro-plugin/skills/debug-hooks/SKILL.md`
- **Task**: Spec compliance: cpv-compliance-spec.md vs 8 file(s)

---

SKIPPED (exceeds 400 KB payload budget): 2 file(s)
  - /tmp/ai-maestro-programmer-agent/skills/ampa-programming/SKILL.md
  - /tmp/ai-maestro-assistant-manager-agent/skills/amama-agent-management/SKILL.md

---

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-plugin/skills/debug-hooks/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The examples section provides two usage examples but does not show the expected output or result description after the code block for either.
Severity: HIGH

File: /tmp/ai-maestro-plugin/skills/debug-hooks/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section links to `references/REFERENCE.md` but does not embed its Table of Contents.
Severity: MEDIUM

File: /tmp/ai-maestro-plugin/skills/docs-search/SKILL.md
Location: allowed-tools
Spec rule violated: Always use scoped: `Bash(script-name:*)`, `Bash(curl:*)`, `Bash(jq:*)`, etc.
What the code does: Uses `Bash(docs-*:*)` which is a wildcard for script name, but `docs-search.sh` is a specific script. It should be `Bash(docs-search.sh:*)`.
Severity: MEDIUM

File: /tmp/ai-maestro-plugin/skills/docs-search/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The examples section provides three usage examples but does not show the expected output or result description after the code block for any of them.
Severity: HIGH

File: /tmp/ai-maestro-plugin/skills/docs-search/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section links to `references/REFERENCE.md` but does not embed its Table of Contents.
Severity: MEDIUM

File: /tmp/ai-maestro-plugin/skills/mcp-discovery/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The examples section provides two usage examples but does not show the expected output or result description after the code block for either.
Severity: HIGH

File: /tmp/ai-maestro-plugin/skills/mcp-discovery/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section links to `references/REFERENCE.md` but does not embed its Table of Contents.
Severity: MEDIUM

File: /tmp/ai-maestro-plugin/skills/planning/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The examples section provides two usage examples but does not show the expected output or result description after the code block for either.
Severity: HIGH

File: /tmp/ai-maestro-plugin/skills/planning/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section links to `references/REFERENCE.md` but does not embed its Table of Contents.
Severity: MEDIUM

File: /tmp/ai-maestro-plugin/skills/team-governance/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The examples section provides two usage examples but does not show the expected output or result description after the code block for either.
Severity: HIGH

File: /tmp/ai-maestro-plugin/skills/team-governance/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section links to `references/REFERENCE.md` but does not embed its Table of Contents.
Severity: MEDIUM

File: /tmp/ai-maestro-plugin/skills/team-kanban/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The examples section provides three usage examples but does not show the expected output or result description after the code block for any of them.
Severity: HIGH

File: /tmp/ai-maestro-plugin/skills/team-kanban/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section links to `references/api-reference.md` and `references/github-sync.md` but does not embed their Tables of Contents.
Severity: MEDIUM

SUMMARY:
- CRITICAL: 0
- HIGH: 6
- MEDIUM: 7
- LOW: 0

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-plugin/skills/debug-hooks/SKILL.md  
**Location**: Checklist section  
**Spec rule violated**: "Must start with: "Copy this checklist and track your progress:""  
**What the code does**: Checklist section dives directly into `- [ ]` items without the required starting phrase.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/debug-hooks/SKILL.md  
**Location**: Resources section  
**Spec rule violated**: "In the `## Resources` section, every referenced .md file must have its TOC embedded - Format: indented bullets under the link listing all headings from the referenced file" (with example showing `- [Full Reference](...) — Complete...` followed by indented `- Section Name`)  
**What the code does**: Uses a single flat bullet `- [Detailed Reference](references/REFERENCE.md) - Hook Event Reference, PreToolUse Permission Decisions, ...` with comma-separated list after a dash, no indented sub-bullets under the link.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/docs-search/SKILL.md  
**Location**: Checklist section  
**Spec rule violated**: "Must start with: "Copy this checklist and track your progress:""  
**What the code does**: Checklist section dives directly into `- [ ]` items without the required starting phrase.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/docs-search/SKILL.md  
**Location**: Resources section  
**Spec rule violated**: "In the `## Resources` section, every referenced .md file must have its TOC embedded - Format: indented bullets under the link listing all headings from the referenced file" (with example showing `- [Full Reference](...) — Complete...` followed by indented `- Section Name`)  
**What the code does**: Uses a single flat bullet `- [Detailed Reference](references/REFERENCE.md) - CLI Commands, Document Types, ...` with comma-separated list after a dash, no indented sub-bullets under the link.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/mcp-discovery/SKILL.md  
**Location**: Checklist section  
**Spec rule violated**: "Must start with: "Copy this checklist and track your progress:""  
**What the code does**: Checklist section dives directly into `- [ ]` items without the required starting phrase.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/mcp-discovery/SKILL.md  
**Location**: Resources section  
**Spec rule violated**: "In the `## Resources` section, every referenced .md file must have its TOC embedded - Format: indented bullets under the link listing all headings from the referenced file" (with example showing `- [Full Reference](...) — Complete...` followed by indented `- Section Name`)  
**What the code does**: Uses a single flat bullet `- [Detailed Reference](references/REFERENCE.md) - Plugin-based discovery, Output formats, ...` with comma-separated list after a dash, no indented sub-bullets under the link.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/planning/SKILL.md  
**Location**: Checklist section  
**Spec rule violated**: "Must start with: "Copy this checklist and track your progress:""  
**What the code does**: Checklist section dives directly into `- [ ]` items without the required starting phrase.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/planning/SKILL.md  
**Location**: Resources section  
**Spec rule violated**: "In the `## Resources` section, every referenced .md file must have its TOC embedded - Format: indented bullets under the link listing all headings from the referenced file" (with example showing `- [Full Reference](...) — Complete...` followed by indented `- Section Name`)  
**What the code does**: Uses a single flat bullet `- [Detailed Reference](references/REFERENCE.md) - The 6 Rules, 3-Strike Protocol, ...` with comma-separated list after a dash, no indented sub-bullets under the link.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/team-governance/SKILL.md  
**Location**: Checklist section  
**Spec rule violated**: "Must start with: "Copy this checklist and track your progress:""  
**What the code does**: Checklist section dives directly into `- [ ]` items without the required starting phrase.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/team-governance/SKILL.md  
**Location**: Resources section  
**Spec rule violated**: "In the `## Resources` section, every referenced .md file must have its TOC embedded - Format: indented bullets under the link listing all headings from the referenced file" (with example showing `- [Full Reference](...) — Complete...` followed by indented `- Section Name`)  
**What the code does**: Uses a single flat bullet `- [Detailed Reference](references/REFERENCE.md) - Governance API endpoints, Team management, ...` with comma-separated list after a dash, no indented sub-bullets under the link.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/team-kanban/SKILL.md  
**Location**: Checklist section  
**Spec rule violated**: "Must start with: "Copy this checklist and track your progress:""  
**What the code does**: Checklist section dives directly into `- [ ]` items without the required starting phrase.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-plugin/skills/team-kanban/SKILL.md  
**Location**: Resources section  
**Spec rule violated**: "In the `## Resources` section, every referenced .md file must have its TOC embedded - Format: indented bullets under the link listing all headings from the referenced file" (with example showing `- [Full Reference](...) — Complete...` followed by indented `- Section Name`)  
**What the code does**: Uses two flat bullets `- [API Reference](references/api-reference.md) — Endpoints, Task Lifecycle, ...` and `- [GitHub Sync Reference](references/github-sync.md) — Setup, Field Mapping, ...` each with comma-separated lists after em-dash, no indented sub-bullets under either link.  
**Severity**: MEDIUM  

## SUMMARY  
CRITICAL: 0  
HIGH: 0  
MEDIUM: 12  
LOW: 0