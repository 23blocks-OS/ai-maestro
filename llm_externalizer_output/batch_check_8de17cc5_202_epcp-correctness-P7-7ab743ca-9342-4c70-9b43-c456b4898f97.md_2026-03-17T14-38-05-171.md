# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:38:05.171Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P7-7ab743ca-9342-4c70-9b43-c456b4898f97.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P7-7ab743ca-9342-4c70-9b43-c456b4898f97.md
1: # Code Correctness Report: server-scripts
16: - **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1082-1097
40: - **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
56: - **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:27-31
69: - **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:738-758
92: - `/Users/emanuelesabetta/ai-maestro/app/plugin-builder/page.tsx` -- No issues. Clean component with proper validation and memoization.
93: - `/Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx` -- No issues. Correct runtime guard for `params.id` (MF-004 comment). Proper error/loading states.
94: - `/Users/emanuelesabetta/ai-maestro/app/teams/page.tsx` -- No issues. Good input validation, proper dialog accessibility (aria attributes), keyboard handling (Escape).
95: - `/Users/emanuelesabetta/ai-maestro/install-messaging.sh` -- No issues. Well-structured with `set -e`, proper quoting, safe temp directory handling, atomic skill installs.
96: - `/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-inbox.sh` -- No issues. Proper `set -e`, input validation for `--limit`, clean jq usage with base64 encoding for safe line processing.
97: - `/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-register.sh` -- No issues. Good input validation (user key format check), registration file secured with `chmod 600`, proper HTTP status code handling.
98: - `/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-send.sh` -- No issues. Comprehensive validation (priority, type, JSON context), proper attachment security (MIME blocking, digest verification, size limits), content security applied before delivery.
99: - `/Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh` -- No issues. Proper regex escaping for version dots, cross-platform sed with `_sed_inplace`, idempotency guard when version matches.
100: - `/Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh` -- No issues. Good error handling with trap, root user warning, safe partial-install cleanup (only removes under `$HOME`), cross-platform package manager detection.
101: - `/Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh` -- No issues. Simple and correct. Uses `exec` for proper signal forwarding.
102: - `/Users/emanuelesabetta/ai-maestro/update-aimaestro.sh` -- No issues. Proper stash handling, build failure tracking without aborting, PM2 ecosystem config reload detection.
```