# Plugin Abstraction Principle Audit — AMCOS Batch 3

**Audit Date:** 2026-02-27
**Auditor:** Claude Code (Plugin Abstraction Principle Auditor)
**Reference Standard:** `/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
**Files Audited:** 4 AMCOS skill SKILL.md entry points

---

## Summary

| File | Status | Violation Count |
|------|--------|----------------|
| `amcos-onboarding/SKILL.md` | CLEAN | 0 |
| `amcos-performance-tracking/SKILL.md` | CLEAN | 0 |
| `amcos-resource-monitoring/SKILL.md` | VIOLATIONS | 2 |
| `amcos-skill-management/SKILL.md` | VIOLATIONS | 2 |

---

## File 1: amcos-onboarding/SKILL.md

**Path:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/amcos-onboarding/SKILL.md`

**Result: CLEAN**

**Analysis:**

- No direct `curl` calls to AI Maestro API endpoints. ✓ VERIFIED
- No hardcoded governance rules or permission matrices. ✓ VERIFIED
- AMP messaging is referenced via the `agent-messaging` skill by name (line 137: "Use the `agent-messaging` skill to send an onboarding initiation message"). ✓ VERIFIED — correct abstraction pattern.
- Agent management operations reference the `ai-maestro-agents-management` skill (line 291: "use the `ai-maestro-agents-management` skill to list agents and verify the target is online"). ✓ VERIFIED — correct abstraction pattern.
- No hardcoded API URLs or CLI syntax for internal API calls. ✓ VERIFIED
- No LOCAL_REGISTRY violations (file registry paths referenced are the skill's own `references/` subdirectory, not the AI Maestro agent registry). ✓ VERIFIED
- No REDUNDANT_OPERATIONS violations. ✓ VERIFIED

**Violations:** None

---

## File 2: amcos-performance-tracking/SKILL.md

**Path:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/amcos-performance-tracking/SKILL.md`

**Result: CLEAN**

**Analysis:**

- No `curl` calls to AI Maestro API. ✓ VERIFIED
- No hardcoded governance rules or permission matrices. ✓ VERIFIED
- No AMP messaging operations are performed in this skill (performance tracking is observational/analytical). ✓ VERIFIED
- No CLI syntax calling AI Maestro internal APIs. ✓ VERIFIED
- No hardcoded agent registry lookups. ✓ VERIFIED
- No REDUNDANT_OPERATIONS violations. ✓ VERIFIED
- The skill content is purely conceptual/procedural (define metrics, collect, analyze, report) with no infrastructure-layer calls embedded. ✓ VERIFIED

**Violations:** None

---

## File 3: amcos-resource-monitoring/SKILL.md

**Path:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/amcos-resource-monitoring/SKILL.md`

**Result: VIOLATIONS FOUND — 2 violations**

---

### Violation 1

| Field | Value |
|-------|-------|
| **Type** | `HARDCODED_API` |
| **Severity** | MEDIUM |
| **Lines** | 136–146 (Example 1 bash block) |

**Offending Code (lines 136–146):**
```bash
# Check CPU usage
cpu_usage=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//')

# Check available memory
mem_free=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
mem_free_mb=$((mem_free * 4096 / 1024 / 1024))

# Check disk space
disk_free=$(df -h / | tail -1 | awk '{print $4}')

echo "CPU: ${cpu_usage}%, Memory Free: ${mem_free_mb}MB, Disk Free: ${disk_free}"
```

**Why it is a violation:**

The Plugin Abstraction Principle (Rule 2) states: "Plugin hooks call globally-installed AI Maestro scripts, never `curl` or `fetch()`." More broadly, the principle is that plugins describe WHAT to do, while global scripts describe HOW to do it.

Although these are OS-level commands rather than AI Maestro API `curl` calls, they represent embedded implementation syntax for a specific macOS platform (`vm_stat`, `top -l`). When monitoring commands change or are abstracted behind an AI Maestro monitoring script, every plugin embedding this syntax must be updated. This is the exact scenario the abstraction principle is designed to prevent.

The CLAUDE.md documents that `op-check-system-resources.md` runbook (referenced at line 184) already serves as the canonical location for this monitoring procedure. The example in SKILL.md should defer to that runbook reference rather than embedding implementation code directly.

**Severity Reasoning:** MEDIUM — this is a portability violation (macOS-specific), not a direct AI Maestro API bypass, but it violates the "describe WHAT, not HOW" principle.

**Required Change:**

Replace the embedded bash code block in Example 1 with a prose description that defers to the operational runbook:

```markdown
### Example 1: Basic System Resource Check

Use the system resource check runbook to verify current CPU, memory, and disk status.
See: [Check System Resources runbook](references/op-check-system-resources.md)

The runbook provides platform-appropriate commands for each check.
```

---

### Violation 2

| Field | Value |
|-------|-------|
| **Type** | `HARDCODED_GOVERNANCE` |
| **Severity** | LOW |
| **Lines** | 200–201, 214 |

**Offending Content:**

Line 200–201 (Operational Procedures summary):
> "Step 1: Count Active Sessions (limits: conservative 10, normal 15, max 20)"

Line 214 (Handle Resource Alert operational summary):
> "Step 1: Identify Alert Type (CPU_HIGH, MEMORY_LOW, DISK_FULL, SESSION_LIMIT, RATE_LIMIT, NETWORK_DOWN)"

**Why it is a violation:**

The Plugin Abstraction Principle (Rule 3) states: "Plugins MUST NOT hardcode governance rules, permission matrices, or role restrictions." Hardcoded instance limits (10/15/20 sessions) are operational capacity governance parameters. These values should be discovered at runtime from the AI Maestro configuration, not embedded in plugin skill files. If AI Maestro's recommended session limits change, this plugin must be manually updated.

Similarly, hardcoded alert type enumerations (CPU_HIGH, MEMORY_LOW, etc.) represent a governance/configuration contract that should be defined by AI Maestro, not duplicated in external plugins.

**Severity Reasoning:** LOW — these are numeric thresholds/enumerations in a prose summary section, not executable code. However, they do create a maintenance coupling.

**Required Change:**

Replace hardcoded limits with runtime-discovery language:

Line 200–201: Change from:
> "Step 1: Count Active Sessions (limits: conservative 10, normal 15, max 20)"

To:
> "Step 1: Count Active Sessions (compare against limits configured in the AI Maestro instance monitoring settings)"

Line 214: Change from:
> "Step 1: Identify Alert Type (CPU_HIGH, MEMORY_LOW, DISK_FULL, SESSION_LIMIT, RATE_LIMIT, NETWORK_DOWN)"

To:
> "Step 1: Identify Alert Type (refer to the [Handle Resource Alert runbook](references/op-handle-resource-alert.md) for the current alert type registry)"

---

## File 4: amcos-skill-management/SKILL.md

**Path:** `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/amcos-skill-management/SKILL.md`

**Result: VIOLATIONS FOUND — 2 violations**

---

### Violation 1

| Field | Value |
|-------|-------|
| **Type** | `CLI_SYNTAX` |
| **Severity** | HIGH |
| **Lines** | 218–231 (Example 1 bash block) |

**Offending Code (lines 218–231):**
```bash
# Install skills-ref if not present
pip install skills-ref

# Validate a skill directory
skills-ref validate /path/to/my-skill

# Expected output for valid skill
# Skill: my-skill
# Status: VALID
# Warnings: 0
# Errors: 0

# Read skill properties
skills-ref read-properties /path/to/my-skill
```

**Why it is a violation:**

The Plugin Abstraction Principle Rule 2 states that plugin hooks/scripts must not call tooling directly when global scripts exist. More broadly, the principle requires that plugins describe WHAT to do while global scripts handle HOW to do it.

The `skills-ref` tool is a third-party CLI utility (`pip install skills-ref`). Embedding its invocation syntax directly in a plugin skill means:

1. If `skills-ref` is replaced by a different validator (e.g., a future `aimaestro-skill-validate` script), all plugins with embedded `skills-ref` syntax must be updated.
2. The `pip install skills-ref` command embeds a specific package manager and installation method — this may not work in all environments (e.g., uv, conda, or systems where pip is not the preferred installer).

The operational runbook at `references/op-validate-skill.md` (referenced at line 174) is the proper canonical location for these commands. The SKILL.md should defer there rather than embedding the invocation.

**Severity Reasoning:** HIGH — this is CLI tool syntax embedded in the plugin skill, creating a direct coupling to an external tool's API surface. If `skills-ref` changes its command syntax, this example breaks silently.

**Required Change:**

Replace the embedded bash block in Example 1 with a prose description deferring to the runbook:

```markdown
### Example 1: Validating a Skill

To validate a skill directory, follow the validation runbook:
See: [Validate Skill Structure runbook](references/op-validate-skill.md)

The runbook covers installing the validation tool, running validation, interpreting output,
and reading skill properties.
```

---

### Violation 2

| Field | Value |
|-------|-------|
| **Type** | `LOCAL_REGISTRY` |
| **Severity** | MEDIUM |
| **Lines** | 258–259 (Example 3 bash block) |

**Offending Code (lines 258–259):**
```bash
# Verify index updated
cat ~/.claude/skills-index.json | jq '.skills | length'
```

**Why it is a violation:**

The Plugin Abstraction Principle prohibits plugins from directly accessing local registry paths and internal configuration files. The path `~/.claude/skills-index.json` is an AI Maestro internal file path. Embedding this path in an external plugin creates a coupling to AI Maestro's internal storage layout:

1. If AI Maestro changes the location of the skills index (e.g., to `~/.aimaestro/skills-index.json`), this plugin breaks.
2. The path may not exist in all configurations (headless mode, remote hosts, etc.).
3. This violates the principle that plugins should not reach into AI Maestro's internal state directly.

Verification of reindexing should be performed through the PSS reindex runbook at `references/op-reindex-skills-pss.md` (line 181), which should provide the canonical verification method.

**Severity Reasoning:** MEDIUM — this is a direct internal path access in an example, not in executable hook code. However, agents following this example will form a dependency on the internal path.

**Required Change:**

Replace the direct file read with a reference to the reindex runbook:

```markdown
### Example 3: Triggering PSS Reindex

To reindex skills for PSS, follow the reindex runbook:
See: [Reindex Skills for PSS runbook](references/op-reindex-skills-pss.md)

The runbook covers triggering reindex via the PSS slash command or script,
and verifying the index was updated correctly.
```

Note: The `/pss-reindex-skills` slash command reference and `python scripts/pss_reindex_skills.py` on lines 251–256 of Example 3 are acceptable — they reference stable interface points (a skill command and a local plugin script), not internal AI Maestro state.

---

## Violation Type Summary

| Violation Type | Count | Files Affected |
|----------------|-------|---------------|
| HARDCODED_API | 1 | amcos-resource-monitoring |
| HARDCODED_GOVERNANCE | 1 | amcos-resource-monitoring |
| HARDCODED_AMP | 0 | — |
| LOCAL_REGISTRY | 1 | amcos-skill-management |
| CLI_SYNTAX | 1 | amcos-skill-management |
| REDUNDANT_OPERATIONS | 0 | — |
| **Total** | **4** | **2 files** |

---

## Severity Summary

| Severity | Count |
|----------|-------|
| HIGH | 1 (CLI_SYNTAX in amcos-skill-management) |
| MEDIUM | 2 (HARDCODED_API in amcos-resource-monitoring, LOCAL_REGISTRY in amcos-skill-management) |
| LOW | 1 (HARDCODED_GOVERNANCE in amcos-resource-monitoring) |

---

## Required Actions by File

### amcos-resource-monitoring/SKILL.md

1. **Lines 136–146** (MEDIUM): Replace bash code block in Example 1 with prose deferring to `references/op-check-system-resources.md`
2. **Lines 200–201, 214** (LOW): Replace hardcoded session limits (10/15/20) and alert type enumerations with runtime-discovery language pointing to their respective runbooks

### amcos-skill-management/SKILL.md

1. **Lines 218–231** (HIGH): Replace `skills-ref` bash block in Example 1 with prose deferring to `references/op-validate-skill.md`
2. **Lines 258–259** (MEDIUM): Replace `cat ~/.claude/skills-index.json` direct path read with a reference to `references/op-reindex-skills-pss.md`

---

*End of audit report.*
