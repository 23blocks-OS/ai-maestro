# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:40.205Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-integrator-plugin-analysis.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-integrator-plugin-analysis.md
Line 22: - **1 main agent** (`amia-integrator-main-agent.md`) -- orchestrator type, Opus model
Line 105: - **No hardcoded `amp-send.sh` or `amp-inbox.sh` calls** in agent definitions or skill SKILL.md files
Line 118: - This VIOLATES the Plugin Abstraction Principle (should use `amp-send.sh` or `amp-*` scripts)
Line 129: - "Execute curl POST to AI Maestro API" -- describes direct API calls instead of using `agent-messaging` skill or `amp-send.sh`
Line 144: - Plugin mutual exclusivity -- AMIA only loads `ai-maestro-integrator-agent`, never other role plugins
Line 167: - **No `team-governance` skill reference** -- the plugin does not reference or discover AI Maestro's `team-governance` skill for permission checks, COS assignment, or governance requests.
Line 170: - **No governance request flow** -- if AMIA needs to do something outside its role, it sends an AI Maestro message manually rather than using the governance request API.
Line 183: | `ci_webhook_handler.py:41` | `http://localhost:23000` | Direct API default (should use env var only, or `amp-send.sh`) |
Line 186: | `phase-procedures.md:95,145` | "Execute curl POST to AI Maestro API" | References direct API calls in documentation |
Line 192: | All agent .md files | Role permission matrices | Governance rules are textual instructions, not discovered from `team-governance` skill |
Line 201: | Message templates | `ai-maestro-integrator` | Self-reference hardcoded |
Line 223: - Does NOT use `aimaestro-agent.sh` CLI for any agent lifecycle operations
Line 232: - Should use `amp-send.sh` from `~/.local/bin/` instead
Line 247: - The main agent is `amia-integrator-main-agent.md` (follows old naming, not `main-agent`)
Line 250: - `ci_webhook_handler.py` enforces localhost-only (`AIMAESTRO_API` must be localhost/127.0.0.1/::1)
Line 260: | Plugin hooks/scripts MUST NOT call API directly | **FAIL** | `ci_webhook_handler.py` calls `/api/messages` directly |
Line 263: | Governance rules discovered at runtime | **FAIL** | Role boundaries hardcoded in .md files, not discovered from `team-governance` skill |
Line 264: | AI Maestro plugin is the exception | N/A | This is NOT the AI Maestro plugin, so violations apply |
Line 270: 1. **Replace direct API calls** in `ci_webhook_handler.py` with `amp-send.sh` calls
Line 271: 2. **Add `team-governance` skill reference** to agents -- discover governance rules at runtime instead of hardcoding
Line 276: 5. **Update `phase-procedures.md`** to reference `agent-messaging` skill instead of "curl POST to AI Maestro API"
Line 287: 10. **Rename main agent** from `amia-integrator-main-agent` to `main-agent` per convention
Line 291: - `agents/amia-integrator-main-agent.md` -- Main orchestrator (Opus)
```