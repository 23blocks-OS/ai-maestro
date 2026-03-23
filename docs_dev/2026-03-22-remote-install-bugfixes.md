# Bug Fixes: scripts/remote-install.sh

**Date:** 2026-03-22
**Source review:** `.rechecker/reports/rck-20260322_171538_606726-[LP00002-IT00002-FID00005]-review.md`

## Bugs Fixed

### 1. `act3_clone_and_build` — `@`-delimiter conflict in gateway `.env` sed substitutions (high)

**Location:** Lines ~1062 and ~1068 (gateway install loop, `.env` file setup)

**Problem:** `portable_sed "s@AIMAESTRO_API=.*@AIMAESTRO_API=http://127.0.0.1:${PORT}@"` used `@` as the sed delimiter. While the URL `http://127.0.0.1:PORT` does not normally contain `@`, using an inconsistent delimiter (the rest of the script uses `|`) is error-prone and the `@` form is not standard. If any future value in the PORT variable or the URL pattern were to contain `@`, sed would silently produce a malformed substitution.

**Fix:** Changed both sed expressions to use `|` as delimiter, consistent with every other `portable_sed` call in the script. Updated the inline comment to reflect the correct rationale.

```bash
# Before
portable_sed "s@AIMAESTRO_API=.*@AIMAESTRO_API=http://127.0.0.1:${PORT}@" .env
portable_sed "s@DEFAULT_AGENT=.*@DEFAULT_AGENT=mailman@" .env

# After
portable_sed "s|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|" .env
portable_sed "s|DEFAULT_AGENT=.*|DEFAULT_AGENT=mailman|" .env
```

---

### 2. `act4_start_and_register` — Unescaped `SELECTED_GATEWAYS` in sed replacement (medium)

**Location:** Line ~1205 (`portable_sed "s|{{SELECTED_GATEWAYS}}|${SELECTED_GATEWAYS}|g"`)

**Problem:** `SELECTED_GATEWAYS` was used raw (unescaped) as the replacement string in a `|`-delimited sed expression. If `SELECTED_GATEWAYS` ever contained `|`, `\`, `&`, or other sed metacharacters, the sed command would be malformed or produce incorrect output. The existing `safe_dir` variable demonstrated the correct pattern — escaping before use — but that same treatment was not applied to `SELECTED_GATEWAYS`.

**Fix:** Added a `safe_gateways` variable using the same escaping pattern already used for `safe_dir`, and replaced the raw `${SELECTED_GATEWAYS}` reference with `${safe_gateways}` in the `portable_sed` call.

```bash
# Added (after safe_dir computation)
local safe_gateways
safe_gateways=$(printf '%s' "$SELECTED_GATEWAYS" | sed 's/[][\.*^$|&\\/]/\\&/g')

# Changed
portable_sed "s|{{SELECTED_GATEWAYS}}|${safe_gateways}|g" "$AGENT_DIR/CLAUDE.md"
```

---

### 3. `act5_grand_finale` — Inconsistent quoting of `INITIAL_PROMPT` in `tmux new-session` (medium)

**Location:** Two `tmux new-session` calls in the "session does not exist" and "session exists but attach failed" branches.

**Problem:** The `tmux new-window` call (the "already in tmux" branch) correctly used `"$AI_TOOL '$INITIAL_PROMPT'"` — single quotes around the prompt so that tmux's shell receives it as one properly-quoted argument. However, both `tmux new-session` calls used `"$AI_TOOL \"$INITIAL_PROMPT\""` — escaped double quotes. While this also works in practice for the current prompt value (no apostrophes), it is inconsistent with the established pattern and would break if `INITIAL_PROMPT` ever contained a double-quote character, since the outer shell double-quoting would allow the inner `\"` to be misinterpreted.

**Fix:** Changed both `tmux new-session` invocations to use the same `'$INITIAL_PROMPT'` single-quote form as `tmux new-window`, making all three call sites consistent.

```bash
# Before (both new-session calls)
"$AI_TOOL \"$INITIAL_PROMPT\""

# After (both new-session calls)
"$AI_TOOL '$INITIAL_PROMPT'"
```

---

## No Other Occurrences Found

- Grep for `portable_sed.*s@` → 0 matches (no remaining `@`-delimiter sed calls)
- Grep for `AI_TOOL.*INITIAL_PROMPT.*\\\"` → 0 matches (no remaining escaped-double-quote form)
- Grep for `portable_sed.*SELECTED_GATEWAYS` → 1 match, now uses `safe_gateways`
