# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:12.696Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-cross-refs-2026-03-06.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-cross-refs-2026-03-06.md
Line 19: | `GET /api/v1/messages/pending` | amp-fetch.sh (for AI Maestro provider) | YES |
Line 20: | `DELETE /api/v1/messages/pending` | amp-fetch.sh (for AI Maestro provider) | YES |
Line 26: These are NOT bugs -- amp-fetch.sh correctly distinguishes AI Maestro local endpoints from external provider endpoints.
Line 46: ### ai-maestro-agents-management SKILL.md references
Line 70: | aimaestro-agent.sh | YES (108 lines, modular) | YES (3877 lines, bundled) | **MISMATCH** - see F4 |
Line 76: | ai-maestro-hook.cjs | YES | NO | Hook file, not a CLI script |
Line 100: ### FINDING F4: aimaestro-agent.sh source vs installed are fundamentally different architectures
Line 109: This indicates the install script was likely updated to copy a pre-bundled version instead of the modular source. The two versions may have diverged in functionality.
Line 130: | `AMP_MAESTRO_URL` | `http://localhost:23000` | amp-helper.sh, amp-init.sh, amp-register.sh, amp-send.sh | CONSISTENT |
Line 131: | `AIMAESTRO_API_BASE` | `""` (empty) | agent-helper.sh | Falls back to `get_api_base()` which calls `get_self_host_url()` from common.sh |
Line 132: | `AIMAESTRO_AGENT` | N/A (no default) | agent-helper.sh | Falls back to `SESSION_NAME` |
Line 137: - **AMP scripts** use `AMP_MAESTRO_URL` (default: `http://localhost:23000`) directly
Line 140: - If a user has a custom URL in hosts.json, AMP scripts won't use it unless `AMP_MAESTRO_URL` is explicitly set
Line 144: The function `get_api_base()` is defined in `scripts/shell-helpers/common.sh` (main ai-maestro project), NOT in the plugin submodule. The plugin's `agent-helper.sh` depends on it via:
Line 147: source "${HOME}/.local/share/aimaestro/shell-helpers/common.sh"
Line 150: - Plugin scripts have an external dependency on AI Maestro's `common.sh`
Line 159: | `AMP_MAESTRO_URL` | NO | NO |
Line 160: | `AIMAESTRO_API_BASE` | NO | NO |
Line 162: | `AMP_MAESTRO_CALLBACK` | NO | NO |
Line 163: | `AMP_LOCAL_DOMAIN` | NO | NO |
Line 164: | `AMP_PROVIDER_DOMAIN` | NO | NO |
Line 167: `AMP_MAESTRO_URL`, `AIMAESTRO_API_BASE`, `AMP_MAESTRO_CALLBACK`, `AMP_LOCAL_DOMAIN`, and `AMP_PROVIDER_DOMAIN` are used in scripts but not documented in CLAUDE.md or any skill file.
Line 180: | F7 | LOW | Two different API base URL resolution mechanisms (AMP_MAESTRO_URL vs get_api_base()) could produce different values |
Line 186: 4. **F7/F8**: Consider unifying the API base URL resolution mechanism, or at minimum document the difference
Line 187: 5. **F9**: Document all env vars in a single reference location (CLAUDE.md or a dedicated doc)
```