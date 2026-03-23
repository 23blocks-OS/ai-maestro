# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:38:24.826Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P9-R1ebfebc5-b248a4d3-a8ca-4b82-84b5-b8a4599569af.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```text
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P9-R1ebfebc5-b248a4d3-a8ca-4b82-84b5-b8a4599569af.md
Line 1: # Code Correctness Report: scripts-server
Line 3: **Domain:** scripts-server
Line 10: - **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:327-330
Line 12: - **Category:** shell
Line 22:   Callers like line 1065: `portable_sed "s|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|" .env`
Line 32: - **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:36-43
Line 34: - **Category:** logic
Line 55: - **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:190-202
Line 57: - **Category:** logic
Line 70: - **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:119
Line 72: - **Category:** logic
Line 84: - **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-helper.sh:737-739
Line 86: - **Category:** shell
Line 100: - **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:486-540
Line 102: - **Category:** logic
Line 118: - **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:327-330
Line 120: - **Category:** shell
Line 129: - **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-inbox.sh:89-93
Line 131: - **Category:** logic
Line 145: - **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
Line 147: - **Category:** shell
Line 159: - **File:** /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh:10
Line 161: - **Category:** shell
Line 173: - **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:135-138
Line 175: - **Category:** logic
Line 192: - **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:174-237
Line 194: - **Category:** logic
Line 210: - /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-register.sh -- No issues. Well-structured with proper input validation, error handling for all HTTP status codes, secure file permissions (chmod 600) for registration files.
Line 229: - My report file uses the UUID filename: epcp-correctness-P9-R1ebfebc5-b248a4d3-a8ca-4b82-84b5-b8a4599569af.md
```