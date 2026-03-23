# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:10.409Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-audit-skill-suggester-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-audit-skill-suggester-2026-02-27.md
Line 105: **Marketplace Version (emasoft-plugins):** 1.9.5
Line 324: **IMPORTANT**: This plugin (`perfect-skill-suggester`) is an **independent** AI Maestro plugin distributed via its own GitHub repo (`https://github.com/Emasoft/perfect-skill-suggester`). It is NOT part of the emasoft-plugins marketplace. Any references to the emasoft-plugins marketplace inside this repo are bugs that need to be fixed.
Line 326: **Emasoft Marketplace Contamination: CRITICAL**
Line 328: The README and CI workflow still contain **15+ references** to the emasoft-plugins marketplace that are incorrect for the AI Maestro version:
Line 331: - Line 79: `claude plugin marketplace add emasoft-plugins --url https://github.com/Emasoft/emasoft-plugins`
Line 332: - Line 82: `claude plugin install perfect-skill-suggester@emasoft-plugins --scope user`
Line 333: - Lines 100-114: Update instructions referencing `emasoft-plugins` marketplace
Line 334: - Lines 118-125: Uninstall instructions referencing `emasoft-plugins`
Line 335: - Lines 141-158: Troubleshooting sections referencing `~/.claude/plugins/cache/emasoft-plugins/`
Line 337: **CI workflow contamination:**
Line 338: - `.github/workflows/notify-marketplace.yml`: `MARKETPLACE_REPO: 'emasoft-plugins'`
Line 340: **Required fix**: All emasoft-plugins marketplace references should be replaced with the correct AI Maestro marketplace or direct GitHub repo installation. Installation instructions should reference `ai-maestro-plugins` or direct `--plugin-dir` loading.
Line 365: **C1: Emasoft Marketplace Contamination (15+ references)**
Line 366: The README, installation/update/uninstall instructions, troubleshooting sections, and CI workflow (`.github/workflows/notify-marketplace.yml`) all reference the `emasoft-plugins` marketplace. This plugin is an independent AI Maestro plugin and should NOT reference the emasoft marketplace. All 15+ references need to be replaced with the correct AI Maestro marketplace or direct repo installation. See Section 8.2 for full breakdown.
Line 442: - `README.md` — 12 lines referencing `emasoft-plugins` marketplace
Line 443: - `.github/workflows/notify-marketplace.yml` — `MARKETPLACE_REPO: 'emasoft-plugins'`
Line 446: - Line 79: Replace `claude plugin marketplace add emasoft-plugins --url https://github.com/Emasoft/emasoft-plugins` with `claude plugin marketplace add ai-maestro-plugins --url https://github.com/Emasoft/ai-maestro-plugins` (or direct repo installation)
Line 447: - Line 82: Replace `claude plugin install perfect-skill-suggester@emasoft-plugins --scope user` with `claude plugin install perfect-skill-suggester@ai-maestro-plugins --scope user`
Line 448: - Lines 100-114: Update all `emasoft-plugins` references in update instructions
Line 450: - Lines 141-158: Update troubleshooting sections — replace `~/.claude/plugins/cache/emasoft-plugins/` with correct cache path
Line 453: - `.github/workflows/notify-marketplace.yml`: Change `MARKETPLACE_REPO: 'emasoft-plugins'` to `MARKETPLACE_REPO: 'ai-maestro-plugins'`
Line 508: AI_MAESTRO_PATHS = [
Line 509:     # AI Maestro bundled plugin skills
Line 510:     os.path.expanduser('~/.claude/plugins/cache/ai-maestro/*/skills/'),
```