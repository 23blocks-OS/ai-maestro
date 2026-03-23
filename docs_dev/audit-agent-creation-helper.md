# Audit Report: AgentCreationHelper Component

**Date:** 2026-02-27
**Auditor:** Claude Opus 4.6
**Files Audited:**
- `/Users/emanuelesabetta/ai-maestro/components/AgentCreationHelper.tsx` (752 lines)
- `/Users/emanuelesabetta/ai-maestro/agents/haephestos-creation-helper.md` (159 lines)
- `/Users/emanuelesabetta/ai-maestro/components/AgentConfigPanel.tsx` (350 lines)
- `/Users/emanuelesabetta/ai-maestro/components/AgentList.tsx` (onComplete handler, lines 1518-1565)
- `/Users/emanuelesabetta/ai-maestro/app/api/sessions/create/route.ts` (42 lines)
- `/Users/emanuelesabetta/ai-maestro/app/api/agents/creation-helper/route.ts` (API route, partial)

---

## Summary

The AgentCreationHelper is a modal-based guided conversation flow for creating new agents. It uses a local state machine (no LLM call) to walk users through purpose detection, naming, skills, MCP servers, rules, and review. A right-side config panel shows the draft configuration in real time. The persona file (`haephestos-creation-helper.md`) describes a richer LLM-backed conversational assistant, but the UI implements a hardcoded keyword-matching flow instead. There is a significant gap between what the persona promises and what the UI delivers.

**Overall Assessment:** Functional for basic happy-path agent creation but has multiple gaps in feature coverage, a dead conversation state, silently dropped config fields, and zero accessibility support. 7 CRITICAL, 8 HIGH, 11 MEDIUM, 6 LOW findings.

---

## 1. Functional Completeness

### FINDING F-01: 6 of 12 config fields are silently discarded on creation [CRITICAL]

The `onComplete` handler in `AgentList.tsx` (lines 1518-1565) only passes these fields to the `/api/sessions/create` endpoint:
- `name` -- used
- `workingDirectory` -- used
- `program` -- used
- `programArgs` -- used

And then separately applies `skills` via a marketplace lookup.

**The following fields configured in the conversation are SILENTLY DISCARDED:**
- `model` -- set to `claude-sonnet-4-5` in INITIAL_CONFIG but never sent to the API
- `plugins` -- populated by profile suggestions but never applied
- `mcpServers` -- user explicitly configures these in the MCP step but they are never applied
- `hooks` -- shown in the config panel but never configurable or applied
- `rules` -- user explicitly adds custom rules but they are never applied
- `tags` -- auto-populated from profiles but never applied

This means a user who spends time configuring MCP servers and custom rules will have those silently lost after clicking "Create Agent." This is deceptive UX.

**Impact:** User-configured data is silently lost. The user believes their agent has MCP servers and rules, but it does not.

### FINDING F-02: No conversation step for plugins [CRITICAL]

`ConversationStep` type includes `'plugins'` but there is no `case 'plugins':` in the `processMessage` switch statement (line 292). The conversation flow goes: `purpose -> name -> skills -> mcp -> rules -> review`. Plugins are skipped entirely.

The persona file (line 94) lists plugins as step 4 of Phase 2. The profiles all have `plugins: []` so no plugins are ever suggested either.

### FINDING F-03: No conversation step for program selection [HIGH]

The persona (line 91) lists program selection as step 1 of Phase 2 (claude-code, codex, aider, cursor, gemini, terminal). The UI hardcodes `program: 'claude-code'` in `INITIAL_CONFIG` and never asks the user to choose.

### FINDING F-04: No conversation step for model selection [HIGH]

The persona (line 92) lists model selection as step 2 of Phase 2 (claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5). The UI hardcodes `model: 'claude-sonnet-4-5'` and never asks.

### FINDING F-05: No conversation step for hooks [HIGH]

The persona (line 96) lists hooks as step 6. The config panel displays a "Hooks" section with an empty placeholder. But there is no way to add hooks through the conversation, and no profiles include hooks.

### FINDING F-06: No conversation step for workingDirectory [HIGH]

The config panel shows "Dir" as "(not set yet)" but the conversation never asks for it. The persona does not explicitly mention it either, but the API supports it and it's a critical field for agent functionality.

### FINDING F-07: No conversation step for programArgs [MEDIUM]

`AgentConfigDraft` includes `programArgs?: string` and the API accepts it, but the conversation never asks for it.

### FINDING F-08: No conversation step for tags [MEDIUM]

Tags are auto-populated from profiles but the user is never told about them and has no way to add/remove tags through conversation. The config panel displays tags with remove buttons, but the "remove from panel" functionality is the only way to interact with tags.

---

## 2. UX Issues

### FINDING UX-01: Dead state -- 'plugins' step is unreachable but exists in type [CRITICAL]

If any future code change accidentally sets `step = 'plugins'`, the user will be stuck in a dead state where all input falls through to the `default: break` case with no response. The `getPlaceholder` and `getStepLabel` functions also have no case for `'plugins'`, so the fallback "Type a message..." placeholder gives no guidance.

### FINDING UX-02: Double-submit not fully guarded [MEDIUM]

The `handleSend` function checks `sending` state, but `processMessage` is async with `await addAssistantMessage(...)` calls that use `setTimeout`. Between the time `setSending(true)` is called and the assistant message is added, a rapid second click could queue another `processMessage` because React state batching may not have flushed `sending=true` to the next render yet. The `sending` flag is set but the input is only cleared synchronously -- the `disabled={sending}` prop relies on a re-render.

**Mitigation:** Consider using a `useRef` for the `sending` flag to get synchronous reads, or disable the button via a ref immediately.

### FINDING UX-03: Name validation silently transforms input [MEDIUM]

Line 318: `const trimmed = userText.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')`. If the user types "My API Builder", it becomes "my-api-builder" silently. The user sees their original text in the chat bubble but the config panel shows the transformed name. The assistant message says `"my-api-builder" — nice name!` but the user typed something different. This transformation should be explained to the user.

### FINDING UX-04: Empty name after transformation not handled well [LOW]

If the user types "!!!", it becomes "---" after transformation (all special chars replaced with dashes). This is a valid-looking but semantically empty name. The `if (!trimmed)` check on line 319 only catches completely empty strings, not strings that are all dashes.

### FINDING UX-05: No way to go back to a previous step [MEDIUM]

The conversation flow is strictly forward. If the user makes a mistake in the name step and moves to skills, there's no "go back" command. The review step allows some changes (name, add/remove skills) but not a full re-do of earlier steps.

### FINDING UX-06: Review step only handles skill changes [MEDIUM]

The review step (lines 453-486) handles:
- Accept/create (line 455)
- Generic "change" prompt (line 460)
- Add skill (line 462)
- Remove skill (line 470)
- Change name (line 476)

But it does NOT handle:
- Change program
- Change model
- Add/remove MCP servers
- Add/remove rules
- Add/remove tags
- Change workingDirectory

The user is told "tell me what you'd like to change" but most changes are not actually supported.

### FINDING UX-07: Cancel/close has no confirmation dialog [LOW]

Closing the modal (clicking X or the backdrop) immediately discards all configuration with no "Are you sure?" prompt. If the user has spent several minutes configuring, this is a frustrating data loss.

### FINDING UX-08: Config panel is hidden on mobile [MEDIUM]

Line 190 of AgentConfigPanel.tsx: `className="hidden md:block w-80 ..."`. On screens smaller than `md` breakpoint (768px), the entire config panel is invisible. The user has no way to see what's being configured.

---

## 3. Robustness

### FINDING R-01: Module-level counter `msgIdCounter` leaks across component instances [MEDIUM]

Line 162: `let msgIdCounter = 0` is at module scope. If the user opens the creation helper, closes it, and opens it again, the counter continues incrementing from the previous value. This is not a bug per se (IDs are still unique due to the random suffix) but is an unexpected pattern. If hot module reloading resets the module, IDs could collide.

### FINDING R-02: `applySuggestions` mutates array elements in place [HIGH]

Lines 236-244: The `add` action does `(arr as ConfigItem[]).push(item)`. This mutates the existing array in `next`, which was shallow-copied from `prev`. But `next` is a shallow copy -- the array references are the same as in `prev`. This means the previous state's arrays are being mutated.

```typescript
const next = { ...prev }  // shallow copy
// next.skills === prev.skills (same reference!)
(arr as ConfigItem[]).push(item)  // mutates both next.skills AND prev.skills
```

This violates React's immutability contract. It may work in practice because the state setter is functional, but it can cause subtle bugs with React's concurrent features, `useMemo`, or any code that compares previous vs current state.

**Fix:** Deep-copy array fields before mutating: `next[field] = [...arr]` before pushing.

### FINDING R-03: `addAssistantMessage` creates a new Promise on every call but has no abort mechanism [LOW]

If the component unmounts while a `setTimeout` is pending (user closes modal quickly), the `setMessages` call will fire on an unmounted component. React 18 suppresses the warning, but it's still a no-op write to stale state.

### FINDING R-04: Stale closure risk in `processMessage` [MEDIUM]

The `processMessage` callback depends on `[step, config, applySuggestions, addAssistantMessage, onComplete]`. The `config` dependency means `processMessage` is recreated on every config change. But between the time the user sends a message and the async processing completes, `config` could have changed (e.g., the user removes an item from the config panel while the assistant message is being generated). The `onComplete(config)` call on line 459 uses the `config` from the closure, which may be stale.

### FINDING R-05: `onComplete` can be called twice [HIGH]

There are two paths to `onComplete`:
1. Line 459: In the `'review'` case, after detecting accept keywords, `setTimeout(() => onComplete(config), 800)` is called.
2. Line 710: The "Create Agent" button calls `onComplete(config)` directly when `canAccept` is true.

If the user types "accept" and then quickly clicks the "Create Agent" button within 800ms, `onComplete` fires twice, potentially creating two agents. The `step === 'done'` check on line 498 prevents further `handleSend` calls but does NOT disable the Accept button (the button checks `canAccept` which depends on `step === 'review'` -- once step becomes `'done'`, the button is disabled, but there's a race window).

---

## 4. Security

### FINDING S-01: ReactMarkdown XSS surface is well-mitigated [OK - Informational]

Good practices observed:
- `react-markdown` v10+ does NOT render raw HTML by default
- No `rehype-raw` plugin is imported
- Link URLs are validated against `SAFE_URL_PROTOCOL` (https, http, mailto, #)
- Images from markdown are blocked (`img: () => null`)
- External links get `rel="noopener noreferrer" referrerPolicy="no-referrer"`
- Input is sanitized for control chars, null bytes, and bidi overrides

### FINDING S-02: Unsafe type cast via `as Record<string, unknown>` [MEDIUM]

Line 234: `(next as Record<string, unknown>)[s.field] = s.value` allows setting ANY field on the config object, not just the defined fields. If a ConfigSuggestion were crafted with `field: '__proto__'` or `field: 'constructor'`, this could lead to prototype pollution.

In the current codebase, suggestions are only generated internally (from profiles and keyword matching), so this is not externally exploitable. But if the system were ever extended to accept suggestions from the persona's LLM output (as the persona file suggests on lines 139-147), this would become an injection vector.

### FINDING S-03: No input length limit [MEDIUM]

The textarea has `max-h-20` for visual height capping, but no `maxLength` attribute. A user could paste a very long string (megabytes) which would be stored in the messages array, rendered in the DOM, and potentially cause performance issues or memory exhaustion.

---

## 5. Accessibility

### FINDING A-01: Zero ARIA attributes in entire component [CRITICAL]

Neither `AgentCreationHelper.tsx` nor `AgentConfigPanel.tsx` contains a single `aria-*` attribute, `role` attribute, or `tabIndex`. This is a significant accessibility failure for a modal dialog.

**Missing:**
- Modal overlay: needs `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- Close button: needs `aria-label="Close"`
- Send button: needs `aria-label="Send message"`
- Chat messages area: needs `role="log"`, `aria-live="polite"` for screen reader announcements
- Input textarea: needs `aria-label` (placeholder is not a sufficient accessible label)
- Config panel remove buttons: need `aria-label` (currently only have `title`)
- Loading indicator: needs `aria-busy="true"`, `aria-label="Sending..."`
- Step indicator: needs `role="status"`, `aria-live="polite"`

### FINDING A-02: No focus trap in modal [CRITICAL]

The modal is a `fixed inset-0` overlay but has no focus trap. Tab navigation will escape the modal into background content. This is a WCAG 2.1 Level A failure (Success Criterion 2.4.3).

### FINDING A-03: No keyboard shortcut to close modal [LOW]

The modal has no `Escape` key handler. Users must click the X button or backdrop to close.

### FINDING A-04: Color contrast concerns [LOW]

Multiple text elements use very low-contrast colors:
- `text-gray-600` on dark backgrounds (steps like `text-[9px] text-gray-600`)
- `text-[10px] text-gray-500` for timestamps
- `text-[11px] text-gray-500` in config panel labels

These likely fail WCAG AA contrast requirements (4.5:1 for normal text, 3:1 for large text).

---

## 6. Code Quality

### FINDING CQ-01: `SyntaxHighlighter` double-cast via `unknown` [MEDIUM]

Lines 13-19: `const SyntaxHighlighter = _SyntaxHighlighter as unknown as React.ComponentType<{...}>`. This is a known workaround for `react-syntax-highlighter` type lag. It's documented with a comment but should be tracked for removal when the upstream types are fixed.

### FINDING CQ-02: Unused import `Check` is only used in one place but `Loader2` is only used in one place too [OK - Informational]

All imports appear to be used. No dead imports detected.

### FINDING CQ-03: `ConversationStep` type includes 'plugins' but has no handler [HIGH]

(See UX-01 above.) The type definition creates an expectation that doesn't match the implementation. Either remove `'plugins'` from the union type or implement the handler.

### FINDING CQ-04: Duplicate `ConfigSuggestion` type definition [MEDIUM]

`ConfigSuggestion` is defined both in `AgentCreationHelper.tsx` (line 30) and `app/api/agents/creation-helper/route.ts` (line 7). The API route version has a stricter `field` type (`'name' | 'program' | 'model' | ...` union) while the component version has `field: string`. This means the component can generate invalid field names that the stricter type would catch.

### FINDING CQ-05: Duplicate `AgentConfigDraft` type definition [MEDIUM]

`AgentConfigDraft` is defined in both `AgentConfigPanel.tsx` (line 21) and `app/api/agents/creation-helper/route.ts` (line 13). These should be in a shared types file.

### FINDING CQ-06: `HAEPHESTOS_AVATAR_FULL` constant is unused [LOW]

Line 53: `const HAEPHESTOS_AVATAR_FULL = '/avatars/haephestos.png'` is defined but never referenced. Only `HAEPHESTOS_AVATAR_THUMB` is used in the template.

### FINDING CQ-07: `detectProfile` regex matches partial words [LOW]

Line 157: `\b(writ|document|...)` -- `\b` with a partial stem like `writ` will match "writing", "written", "writ" but also "writ of habeas corpus." Line 158: `analy` matches "analyze" and "analysis" but also "analytical." These are probably fine for a keyword detector but could be more precise.

---

## 7. Integration Correctness

### FINDING I-01: Config panel reflects all changes correctly [OK]

The `AgentConfigPanel` receives `config` as a prop and renders all sections (name, program, model, role, workingDirectory, skills, plugins, mcpServers, hooks, rules, tags). The `onRemove` callback correctly propagates back to `applySuggestions` in the parent. This integration works.

### FINDING I-02: "Create Agent" button does NOT pass model, rules, tags, mcpServers, hooks, plugins [CRITICAL]

(See F-01 above.) The `onComplete` callback in `AgentList.tsx` destructures `config` but only sends 4 of 12 fields to the API. The skills are applied in a separate best-effort call. All other fields are lost.

### FINDING I-03: Skills matching relies on exact name match against marketplace catalog [MEDIUM]

Lines 1546-1547 of `AgentList.tsx`: `const wantedNames = new Set(config.skills.map(s => s.name))`. This matches by exact `name` property. If the marketplace catalog uses different naming conventions (e.g., the catalog has `"ai-maestro:default:tdd"` as the name but the profile uses `"tdd"`), the match will fail silently.

### FINDING I-04: API route `ConversationStep` type differs from component type [MEDIUM]

The API route (`creation-helper/route.ts` line 27) defines:
```typescript
type ConversationStep = 'greeting' | 'purpose' | 'skills' | 'plugins' | 'mcp' | 'rules' | 'review' | 'done'
```
The component (line 43) defines:
```typescript
type ConversationStep = 'greeting' | 'purpose' | 'name' | 'skills' | 'plugins' | 'mcp' | 'rules' | 'review' | 'done'
```
The API route is **missing the 'name' step**. If these types were ever shared, this mismatch would cause type errors.

---

## 8. Missing Features (Persona vs UI Gap Analysis)

| Feature | Persona Describes | UI Implements | Gap |
|---------|-------------------|---------------|-----|
| Purpose Discovery (Phase 1) | Keywords -> category | Keyword regex -> profile | Minor: persona is richer but regex covers basics |
| Program selection | Step 1 of Phase 2 | Hardcoded to `claude-code` | **FULL GAP** |
| Model selection | Step 2 of Phase 2 | Hardcoded to `claude-sonnet-4-5` | **FULL GAP** |
| Skills configuration | Step 3 of Phase 2 | Add/remove/list in skills step | Implemented |
| Plugins configuration | Step 4 of Phase 2 | Skipped entirely | **FULL GAP** |
| MCP Servers | Step 5 of Phase 2 | Implemented with known server list | Implemented |
| Hooks configuration | Step 6 of Phase 2 | Not configurable at all | **FULL GAP** |
| Rules | Step 7 of Phase 2 | Implemented in rules step | Implemented |
| Working directory | Implied by agent config | Not in conversation | **FULL GAP** |
| Review & refinement (Phase 3) | Full config review, swap any element | Only name/skills changes in review | **PARTIAL GAP** |
| Governance awareness | Explains roles, constraints | Sets `role: 'member'` hardcoded | OK (correct behavior per governance) |
| JSON config blocks in output | Lines 139-147 describe JSON actions | UI parses NO JSON from persona output | See Finding 9-01 |
| Conversational depth | Full ChatGPT-like responses | Hardcoded template strings | **ARCHITECTURE GAP** |

---

## 9. Persona-UI Alignment

### FINDING P-01: Persona describes LLM-backed conversation but UI is a state machine [CRITICAL]

The persona file (`haephestos-creation-helper.md`) is written as a system prompt for an LLM:
- "You are Haephestos, the AI Agent Forge Master" (line 16)
- "Ask clarifying questions when the user's needs are ambiguous" (line 23)
- Response format instructions for markdown, tables, code blocks (lines 27-77)
- "be as thorough as any ChatGPT-like assistant would be" (line 39)

But the UI component (`AgentCreationHelper.tsx`) **does not call any LLM**. It uses hardcoded regex patterns and template strings. The entire persona file is **dead configuration** -- loaded nowhere, used nowhere in this component.

The API route at `/api/agents/creation-helper/route.ts` DOES define a server-side chat handler that could be LLM-backed, but the component never calls it.

### FINDING P-02: JSON config block parsing is a dead feature [HIGH]

The persona (lines 139-147) instructs the LLM to emit structured JSON blocks like:
```json
{"action": "set", "field": "name", "value": "my-agent"}
```

The API route defines a `ConfigSuggestion` type matching this format. But the UI component generates suggestions internally via `applySuggestions()` -- it never parses JSON from any LLM output. If the persona were connected to an LLM, the JSON blocks it outputs would render as plain text in the chat and never be parsed.

### FINDING P-03: Code syntax highlighting is over-engineered for current use [LOW]

The component includes Prism.js syntax highlighting via `react-syntax-highlighter` (200+ language support) for rendering assistant messages. But since the assistant messages are hardcoded templates that never contain fenced code blocks, the syntax highlighter is never exercised. It adds bundle size for no current benefit. It would be useful if the LLM-backed conversation were connected.

---

## Severity Summary

| Severity | Count | Key Findings |
|----------|-------|-------------|
| CRITICAL | 7 | F-01 (6 fields silently discarded), F-02 (no plugins step), UX-01 (dead plugins state), A-01 (zero ARIA), A-02 (no focus trap), I-02 (fields lost on create), P-01 (persona is dead config) |
| HIGH | 8 | F-03 (no program step), F-04 (no model step), F-05 (no hooks step), F-06 (no workingDir step), R-02 (array mutation), R-05 (double onComplete), CQ-03 (type without handler), P-02 (dead JSON parsing) |
| MEDIUM | 11 | F-07 (no programArgs), F-08 (no tags step), UX-02 (double-submit), UX-03 (silent name transform), UX-05 (no back navigation), UX-06 (limited review changes), UX-08 (mobile hidden panel), R-01 (module counter), R-04 (stale closure), S-02 (unsafe cast), S-03 (no input length limit), CQ-01 (double cast), CQ-04 (duplicate type), CQ-05 (duplicate type), I-03 (skills name match), I-04 (type mismatch) |
| LOW | 6 | UX-04 (dash-only name), UX-07 (no cancel confirm), A-03 (no Escape key), A-04 (color contrast), CQ-06 (unused constant), CQ-07 (partial word regex), P-03 (over-engineered highlighting), R-03 (no abort) |

---

## Recommended Priorities

### Immediate (blocks correct behavior)
1. **Fix F-01/I-02:** The `onComplete` handler in AgentList.tsx must apply `model`, `rules`, `tags`, `mcpServers`, `hooks`, `plugins` to the created agent. This likely requires new API endpoints or extending the existing ones.
2. **Fix R-02:** Deep-copy arrays in `applySuggestions` before mutating.
3. **Fix R-05:** Prevent double `onComplete` calls (disable Accept button immediately on accept keyword, or use a ref guard).

### Short-term (feature gaps)
4. Add conversation steps for program, model, and workingDirectory.
5. Either implement the plugins step or remove `'plugins'` from the `ConversationStep` type.
6. Add basic accessibility: `role="dialog"`, `aria-modal`, focus trap, Escape key handler.

### Medium-term (architecture)
7. Decide whether the creation helper should be LLM-backed (using the persona + API route) or remain a state machine. The current hybrid where persona exists but is unused is confusing.
8. If keeping the state machine: remove the persona file and API route to reduce confusion.
9. If moving to LLM: connect the component to `/api/agents/creation-helper` and implement JSON suggestion parsing.

### Long-term (polish)
10. Consolidate duplicate type definitions into a shared types file.
11. Add mobile-responsive config panel (drawer/bottom sheet).
12. Add confirmation dialog on cancel.
13. Add step navigation (back button or breadcrumb).
