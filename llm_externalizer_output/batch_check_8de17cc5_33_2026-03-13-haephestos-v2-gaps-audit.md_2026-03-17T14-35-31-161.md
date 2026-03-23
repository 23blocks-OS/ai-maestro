# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:31.162Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-haephestos-v2-gaps-audit.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-haephestos-v2-gaps-audit.md
Line 15: The Haephestos persona file has been fully updated for v2.
Line 20: - Create tmux session on mount via `/api/sessions/create` with `--agent haephestos-creation-helper`
Line 29: - Minor: the TOML parsing for agent creation (lines 210-221) uses simple regex; a proper TOML parser would be more robust but is acceptable for now
Line 32: ## 2. AgentCreationHelper.tsx (`components/AgentCreationHelper.tsx`) -- V1 LEGACY
Line 39: - Imports and uses `AgentConfigPanel` (the v1 config panel)
Line 42: - The entire file. All 931 lines are v1 terminal-parsing code. The v2 architecture replaces all of this with a standard TerminalView connected to a real tmux session.
Line 43: - Still referenced by `components/AgentList.tsx` (lines 1517-1519: `showAdvancedCreateModal` renders it as a fallback) -- that reference must also be removed
Line 46: - `startSession()` -- polls `/api/agents/creation-helper/session` for readiness
Line 47: - `captureInitialGreeting()` -- polls `/api/agents/creation-helper/response`
Line 48: - `sendUserMessage()` -- sends via `/api/agents/creation-helper/chat`
Line 60: - Has "Advanced" button that navigates to `/agent-creation` (Haephestos v2)
Line 69: ## 4. AgentConfigPanel.tsx (`components/AgentConfigPanel.tsx`) -- Config Panel
Line 75: - This component is **no longer used by the v2 Haephestos flow**. The v2 right panel is `TomlPreviewPanel` which shows raw TOML content.
Line 76: - It IS still imported by `AgentCreationHelper.tsx` (v1 legacy code)
Line 77: - Once `AgentCreationHelper.tsx` is removed, this component will have no consumers
Line 80: - **The `AgentConfigDraft` type exported from this file** is also exported from `AgentCreationHelper.tsx` (line 28: `export type { AgentConfigDraft }`) -- that re-export should be removed when the v1 component is deleted
Line 82: ## 5. HaephestosLeftPanel.tsx (`components/HaephestosLeftPanel.tsx`)
Line 84: - Big Haephestos avatar/face at top
Line 101: ## 6. TomlPreviewPanel.tsx (`components/TomlPreviewPanel.tsx`)
Line 107: - Polls via `/api/agents/creation-helper/toml-preview` endpoint every 5 seconds
Line 115: ## 7. creation-helper-service.ts (`services/creation-helper-service.ts`) -- V1 LEGACY
Line 130: | `sessionExists()` | 63-66 | Check tmux session | Dead -- v2 page manages sessions directly |
Line 131: | `sourceAgentFile()` | 69-71 | Path to persona source | Dead -- v2 uses `/api/agents/creation-helper/ensure-persona` |
Line 133: | `deployAgentFile()` | 79-91 | Copy persona to .claude/agents/ | Dead -- v2 uses ensure-persona API |
Line 134: | `removeAgentFile()` | 94-101 | Cleanup deployed persona | Dead |
Line 140: | `createCreationHelper()` | 398-495 | Create session + register agent + launch claude | Dead -- v2 page does this itself |
Line 141: | `deleteCreationHelper()` | 500-528 | Kill session + cleanup | Dead -- v2 page does this itself |
Line 142: | `getCreationHelperStatus()` | 533-579 | Check if Claude is ready via capture-pane | Dead -- v2 has no readiness polling |
Line 143: | `sendMessage()` | 584-624 | Send message via tmux send-keys | Dead -- v2 types directly in terminal |
Line 144: | `captureResponse()` | 632-697 | Capture response via capture-pane + parse config blocks | Dead -- v2 has no response capture |
Line 147: - `app/api/agents/creation-helper/session/route.ts` (imports `createCreationHelper`, `deleteCreationHelper`, `getCreationHelperStatus`)
Line 148: - `app/api/agents/creation-helper/chat/route.ts` (imports `sendMessage`)
Line 149: - `app/api/agents/creation-helper/response/route.ts` (imports `captureResponse`)
Line 152: ## 8. Haephestos Persona (`agents/haephestos-creation-helper.md`)
Line 154: - Add: Instructions to write draft `.agent.toml` to `~/.aimaestro/tmp/haephestos-draft.toml`
Line 159: - New section "What You Output -- .agent.toml Draft File" with clear instructions to write to `~/.aimaestro/tmp/haephestos-draft.toml`
Line 161: - TOML format template included
Line 170: ## 9. V1 API Routes (should be deleted/archived)
Line 174: | `app/api/agents/creation-helper/session/route.ts` | **STILL EXISTS** -- uses v1 `creation-helper-service.ts` |
Line 175: | `app/api/agents/creation-helper/chat/route.ts` | **STILL EXISTS** -- uses v1 `sendMessage()` |
Line 176: | `app/api/agents/creation-helper/response/route.ts` | **STILL EXISTS** -- uses v1 `captureResponse()` |
Line 180: | `app/api/agents/creation-helper/file-picker/route.ts` | **EXISTS** -- reused by Upload button |
Line 181: | `app/api/agents/creation-helper/toml-preview/route.ts` | **EXISTS** -- new v2 endpoint |
Line 182: | `app/api/agents/creation-helper/cleanup/route.ts` | **EXISTS** -- new v2 endpoint |
Line 183: | `app/api/agents/creation-helper/ensure-persona/route.ts` | **EXISTS** -- new v2 endpoint |
Line 186: - `services/headless-router.ts` still registers the v1 routes (session, chat, response) -- those registrations must be removed when the routes are deleted
Line 192: | `components/HaephestosLayout.tsx` | **NOT CREATED** -- layout logic was inlined directly in `page.tsx` instead. This is fine architecturally; the requirement was advisory. |
Line 193: | `components/HaephestosMobileLayout.tsx` | **NOT CREATED** -- mobile layout was inlined in `page.tsx` with a `isCompact` conditional. This is fine. |
Line 204: | Create `/agent-creation` page with desktop + mobile layouts | DONE |
Line 205: | Create TomlPreviewPanel (polls .agent.toml every 5s) | DONE |
Line 206: | Create HaephestosLeftPanel (avatar + file list) | DONE |
Line 208: | Update Haephestos persona (write .agent.toml, remove json:config) | DONE |
Line 210: | Update AgentList to navigate to /agent-creation | DONE (partial -- v1 modal reference remains) |
Line 216: 1. **`services/creation-helper-service.ts`** (698 LOC) -- all terminal parsing code
Line 217: 2. **`components/AgentCreationHelper.tsx`** (931 LOC) -- v1 custom chat UI
Line 218: 3. **`app/api/agents/creation-helper/session/route.ts`** -- v1 session management
Line 219: 4. **`app/api/agents/creation-helper/chat/route.ts`** -- v1 message relay
