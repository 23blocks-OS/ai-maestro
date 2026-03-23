# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:51.911Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-PSS-changes.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-PSS-changes.md
Line 10: **Source:** `docs_dev/consolidated-aimaestro-violations-2026-02-27.md` (Section 3) + `docs_dev/decoupling-audit-PSS-raw.md`
Line 11: **Scope:** PSS plugin only — 2 violations, both in `skills/pss-agent-toml/SKILL.md`
Line 12: **Note:** PSS has no server dependencies (zero curl calls to localhost, zero AI Maestro API calls).
Line 20: - **File:** `skills/pss-agent-toml/SKILL.md`
Line 23: - **Depends on:** PSS Rust binary must gain a `--search` flag (PSS maintainer task, prerequisite). No AI Maestro server dependency.
Line 25: - **Current:** The skill embeds a raw `cat ~/.claude/cache/skill-index.json | python3 -c "import json, sys; idx = json.load(sys.stdin); ..."` block. This hardcodes the internal cache path (`~/.claude/cache/skill-index.json`), duplicates query logic already owned by the PSS Rust binary, and will silently break if the cache schema or location ever changes.
Line 35:   1. `grep -n "skill-index.json\|python3 -c\|import json, sys" skills/pss-agent-toml/SKILL.md` returns zero results.
Line 36:   2. `grep -n 'BINARY_PATH.*--search' skills/pss-agent-toml/SKILL.md` returns at least one match in the Phase 2, Step 2.2 section.
Line 42: - **File:** `skills/pss-agent-toml/SKILL.md`
Line 45: - **Depends on:** None (PSS has no server dependencies)
Line 47: - **Current:** The skill embeds explicit GitHub REST API endpoint patterns directly in the instruction text:
Line 59:   1. `grep -n 'repos/<owner>/<repo>/contents' skills/pss-agent-toml/SKILL.md` returns zero results.
Line 66: | PSS1 | `skills/pss-agent-toml/SKILL.md` | ~214–256 | LOCAL_REGISTRY | MODERATE | P1 | PSS binary `--search` flag |
Line 67: | PSS2 | `skills/pss-agent-toml/SKILL.md` | ~406, 407, 419 | API_SYNTAX | LOW | P2 | None |
Line 72: 2. **PSS1**: Once `--search` flag exists, update `skills/pss-agent-toml/SKILL.md` lines ~214–256 to call the binary instead of the inline Python block.
Line 75: Both changes are confined to a single file (`skills/pss-agent-toml/SKILL.md`) and have no dependencies on the AI Maestro server.
```