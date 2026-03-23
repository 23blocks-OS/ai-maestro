# Haephestos (Agent Creation Helper) Architecture Investigation

**Investigator**: Claude Code
**Date**: 2026-03-11
**Status**: READ-ONLY Analysis (Research Only)

---

## Executive Summary

Haephestos is a **temporary, hidden Claude Code session** that runs in a tmux session (`_aim-creation-helper`) for the duration of the agent creation dialog. It is NOT a regular agent and has a highly specialized architecture:

- **Hidden session**: Not shown in the agent list or UI
- **Terminal-based**: All communication is via tmux `sendKeys()` + `capturePane()` polling
- **Terminal parsing**: Sophisticated extraction of response state and structured data from terminal output
- **Temporary**: Destroyed when the dialog closes
- **Not registered**: No entry in the agent registry (unregisterable: true in persona)

The system combines **terminal output parsing** with a **polling-based chat UI** to create the illusion of a responsive AI agent, while actually analyzing raw terminal output to:
1. Detect when Claude has finished responding (vs still thinking/running tools)
2. Extract structured config suggestions from `json:config` blocks in terminal output
3. Track file attachments and manage temporary storage

---

## Section 1: CURRENT ARCHITECTURE

### How Haephestos Currently Works

#### Lifecycle:
1. User clicks "Create Agent" → UI mounts `AgentCreationHelper` component
2. Component calls `POST /api/agents/creation-helper/session`
3. Service creates hidden tmux session `_aim-creation-helper` in project root
4. Claude Code is launched with `--agent haephestos-creation-helper --model sonnet --tools Read,Glob,Grep,Agent --permission-mode bypassPermissions`
5. Frontend polls status endpoint until Claude shows input prompt (`>` or `❯`)
6. User types message → calls `POST /api/agents/creation-helper/chat` → message sent via `tmux send-keys`
7. Frontend polls `GET /api/agents/creation-helper/response` repeatedly (~800ms interval) until response is complete
8. Response captured from tmux terminal, parsed, suggestions applied to config panel
9. User clicks "Create Agent" → UI calls backend to actually create the agent from the config draft
10. Component unmounts → fires `DELETE /api/agents/creation-helper/session` → tmux session killed

#### Key Architecture Principle:
- **Not streaming**: No WebSocket or real-time terminal streaming
- **Polling-based**: Frontend repeatedly queries API until state changes
- **Terminal-centric**: All data comes from parsing `tmux capture-pane` output
- **Async detection**: Response completion detected by looking for shell prompt, not explicit signaling

### Terminal Parsing & Pattern Detection

The core parsing logic in `detectResponseState()` uses a **multi-layered detection strategy**:

#### 1. Thinking Indicators (Lines ~177-193)
Detects if Claude is still processing:
- **Spinner + word pattern**: `\S+…\s+\(\d+[ms]` (e.g., "thinking… (3s · 120 tokens)")
- **Keyword scan**: lowercase match for "thinking", "analyzing", "generating", "processing"
- **Tool execution hint**: "esc to interrupt" (but NOT "esc to cancel" which means user can cancel)

#### 2. Active Tool Execution Markers (Lines ~239-280)
Scans ENTIRE captured output for:
- `+N more tool uses` or `+N more tool use` (collapsed tool output)
- `ctrl+o to expand` (hint that tool output is hidden)
- `ctrl+b ctrl+b` (run in background hint)
- `⎿ <TOOL>(` where TOOL is Read, Write, Edit, Bash (active tool invocation line)

**Critical detail**: Only treat tool markers as "still running" if they appear AFTER the last separator pair (i.e., in the current response region, not a historical one).

#### 3. Response Delimiter Detection (Lines ~235-260)
Finds separator lines that delimit response boundaries:
- Pattern: `^[─╌═]{10,}` (10+ repeated characters)
- Excludes lines ending with `╮╯┤│` (box-drawing chars used by cost boxes)
- Requires 2+ separators to confirm response completion (top separator + bottom separator)

#### 4. Claude v2.x Terminal Layout Recognition (Lines ~311-333)
The layout (bottom-up) is:
```
⏵⏵ bypass permissions...  ← chrome bar
🤖 Sonnet 4.6 ...           ← status bar
─────────────────────────   ← bottomSep (separators[0])
❯                           ← input prompt
─────────────── agent ──    ← topSep (separators[1])
[Claude's response]         ← what we extract
─────────────────────────   ← prevSep (separators[2])
```

Check: Input prompt area (between topSep and bottomSep) should contain only `>` or `❯` optionally followed by user text.

#### 5. Response Boundary Extraction (Lines ~335-385)
Once separators are found:
- **Normal case** (3+ separators): Response is between `separators[2]` and `separators[1]`
- **First response** (2 separators): Find user message line (starts with `❯ ` or `> ` + text), then find response marker (`⏺`) after it
- **Stop says marker**: Look for `⎿  Stop says:` and truncate response there (cost box stripping)

---

### Config Extraction Mechanism

#### Two-Strategy Parsing (`parseConfigBlocks` function, Lines ~93-170)

**Strategy 1: Fenced Code Blocks** (Lines ~135-151)
```typescript
const configBlockRe = /```json:config\s*\n([\s\S]*?)```/g
```
- Detects `json:config` markdown code fences
- Works if Claude's terminal renderer preserves fences
- Immediately tries to parse and validate content

**Strategy 2: Raw JSON Array Detection** (Lines ~153-209)
- **Why needed**: Claude Code's terminal renderer strips markdown fences, so `json:config` blocks appear as indented JSON text
- **Detection**: Finds lines starting with `[` (possibly after `⏺` response marker)
- **Bracket tracking**: Counts `[` and `]` across lines to find complete JSON array
- **Line joining**: Joins wrapped lines with spaces (terminal breaks long JSON strings)
- **Validation**: Parses and checks that all objects have `{action, field, value}` shape
- **Cleanup**: Removes config block lines from displayed response

#### Expected Format
```json
[
  {"action": "set", "field": "name", "value": "my-agent"},
  {"action": "set", "field": "program", "value": "claude-code"},
  {"action": "add", "field": "skills", "value": {"name": "tdd", "description": "..."}},
  {"action": "remove", "field": "skills", "value": "old-skill"}
]
```

**Valid actions**:
- `set` - for scalar fields (name, program, model, role, workingDirectory, teamId, programArgs)
- `add` - for array fields (skills, plugins, mcpServers, hooks, rules, tags)
- `remove` - for array fields

---

## Section 2: FILES & COMPONENTS

### Complete File Inventory

| File | Purpose | Key Exports | LOC | Dependencies |
|------|---------|-------------|-----|--------------|
| `services/creation-helper-service.ts` | Core backend orchestration | `createCreationHelper()`, `deleteCreationHelper()`, `getCreationHelperStatus()`, `sendMessage()`, `captureResponse()` | ~697 | agent-registry, agent-runtime, fs, types/agent |
| `components/AgentCreationHelper.tsx` | React chat UI component | Main component (default export) | ~931 | React, Framer Motion, react-markdown, react-syntax-highlighter, lucide-react, AgentConfigPanel |
| `app/api/agents/creation-helper/session/route.ts` | Session lifecycle API | POST (create), DELETE (destroy), GET (status) | ~64 | creation-helper-service, NextResponse |
| `app/api/agents/creation-helper/chat/route.ts` | Message sending API | POST handler | ~38 | creation-helper-service, NextResponse |
| `app/api/agents/creation-helper/response/route.ts` | Response capture API | GET handler | ~26 | creation-helper-service, NextResponse |
| `app/api/agents/creation-helper/file-picker/route.ts` | File upload API | POST handler | ~80 | fs/promises, NextResponse |
| `agents/haephestos-creation-helper.md` | Agent persona file | N/A (instruction/markdown) | ~340 | N/A |
| `tests/services/creation-helper-service.test.ts` | Unit tests | Test suite (vitest) | ~500+ | vitest, mocks |

### Service Layer: creation-helper-service.ts

**Key Constants**:
- `SESSION_NAME = '_aim-creation-helper'` - tmux session identifier
- `SESSION_LABEL = 'Agent Creation Helper'` - display name
- `AGENT_FILE_NAME = 'haephestos-creation-helper.md'` - persona file
- `MODEL = 'sonnet'` - Claude model (for intelligent suggestions)
- `TOOLS = 'Read,Glob,Grep,Agent'` - read-only tools (no modifications)
- `PERMISSION_MODE = 'bypassPermissions'` - bypass permission checks
- `ANSI_RE = /\x1B(?:\[[?]?[0-9;]*[a-zA-Z]|\].*?(?:\x07|\x1B\\)|\(B)/g` - ANSI code stripper

**Public Functions**:
- `createCreationHelper()` - Creates session, registers agent, launches Claude (POST handler)
- `deleteCreationHelper()` - Kills session, deregisters agent, cleans up (DELETE handler)
- `getCreationHelperStatus()` - Checks if session exists, polls for readiness (GET handler)
- `sendMessage(text)` - Sanitizes and relays user message to tmux (POST handler)
- `captureResponse()` - Captures pane, parses response, extracts config (GET handler)

**Internal Functions** (not exported):
- `sessionExists()` - Checks tmux for session
- `sourceAgentFile()` - Path to repo-checked-in persona file
- `deployedAgentFile()` - Path to `.claude/agents/` deployment location
- `deployAgentFile()` - Copies persona file to `.claude/agents/` for `claude --agent`
- `removeAgentFile()` - Cleans up deployed file
- `sanitizeInput(text)` - Strips null bytes, control chars, bidi-override chars
- `stripAnsi(text)` - Removes ANSI escape codes from captured output
- `parseConfigBlocks(text)` - Extracts json:config blocks and returns clean text + suggestions
- `detectResponseState(lines)` - Detects thinking vs complete, extracts response text
- `simpleHash(text)` - djb2 hash for stale response detection

**Private State**:
- `staleResponseHash: string | null` - Tracks response hash before sending new message to prevent duplicate captures

### Component Layer: AgentCreationHelper.tsx

**UI Structure**:
- Header: Status indicator (Starting/Online/Error)
- Main body (two-column):
  - Left: Chat display + message input + attachment panel
  - Right: AgentConfigPanel (config draft editor)
- Footer: Cancel + Create Agent buttons

**Key State Variables**:
- `messages: ChatMessage[]` - Conversation history
- `inputText: string` - Current message being typed
- `sessionState: 'starting' | 'ready' | 'error'` - Session lifecycle
- `sessionError: string | null` - Error message if session fails
- `waitingForResponse: boolean` - Currently polling for response
- `config: AgentConfigDraft` - Agent configuration being built
- `showAttachments: boolean` - Show/hide attachment panel
- `isProfileGenerating: boolean` - Generating profile via PSS
- `isUploading: boolean` - Uploading file
- File paths & display names: `agentDescPath`, `designDocPath`, `existingProfilePath` + display variants

**Key Functions**:
- `startSession()` - POSTs to create session, polls status until ready
- `captureInitialGreeting()` - Polls for Claude's initial greeting after session starts
- `sendUserMessage(text)` - Sanitizes, sends message, polls for response with idle timeout (resets on thinking)
- `applySuggestions(suggestions)` - Applies config updates (set/add/remove operations)
- `handleGenerateProfile(mode)` - Triggers PSS profiling (CREATE/EDIT/ALIGN modes)
- `uploadFile(file, pathSetter, displaySetter)` - POSTs file to upload endpoint
- `handleFileChange()` - File input change handler

**Polling Intervals**:
- `STATUS_POLL_INTERVAL = 1000ms` - How often to check if session is ready
- `RESPONSE_POLL_INTERVAL = 800ms` - How often to check for response completion
- `RESPONSE_TIMEOUT_MS = 120_000ms` - Idle timeout (resets each time thinking is detected)
- `STARTUP_TIMEOUT_MS = 30_000ms` - Max wait for session startup

**Polling Lifecycle**:
1. On mount: Start status polling (checks ready flag)
2. Once ready: Start response polling for initial greeting
3. On message send: Snapshot current response hash, start response polling with idle timeout
4. During polling: If thinking detected, reset idle timeout (allows long-running sub-agents like PSS)
5. When response complete: Stop polling, display message, apply suggestions

### API Routes

#### POST /api/agents/creation-helper/session
- **Handler**: `createCreationHelper()`
- **Returns**: `{ success, agentId, name, status: 'starting'|'online', created: boolean }`
- **Actions**: Deploy agent file, create tmux session, register in agent registry, launch Claude

#### DELETE /api/agents/creation-helper/session
- **Handler**: `deleteCreationHelper()`
- **Returns**: `{ success: boolean }`
- **Actions**: Kill tmux session, deregister agent, clean up deployed files

#### GET /api/agents/creation-helper/session
- **Handler**: `getCreationHelperStatus()`
- **Returns**: `{ success, agentId, name, status: 'offline'|'starting'|'ready'|'thinking', ready: boolean }`
- **Logic**: Checks session exists, captures pane, detects response state

#### POST /api/agents/creation-helper/chat
- **Body**: `{ message: string }`
- **Handler**: `sendMessage(text)`
- **Returns**: `{ success: boolean }`
- **Actions**: Sanitize, snapshot response hash, send to tmux

#### GET /api/agents/creation-helper/response
- **Handler**: `captureResponse()`
- **Returns**: `{ text, configSuggestions, isComplete, isThinking }`
- **Logic**: Capture pane, detect state, parse config, return clean text + suggestions

#### POST /api/agents/creation-helper/file-picker
- **Body**: `FormData` with "file" field
- **Returns**: `{ path: string, filename: string }`
- **Upload dir**: `~/.aimaestro/tmp/creation-helper/`
- **Max size**: 1MB
- **Extensions**: `.md`, `.txt`, `.toml`
- **Filename**: `<random-hex>-<sanitized-original>`

---

## Section 3: KEY FEATURES THAT ARE NOT JUST CHAT

### 1. Terminal Output Parsing

**What patterns are detected?**

| Pattern | Regex/Logic | Purpose |
|---------|------------|---------|
| Spinner + word | `\S+…\s+\(\d+[ms]` | Claude is thinking |
| Tool marker | `+\d+ more tool uses` | Collapsed tool output |
| Separator line | `^[─╌═]{10,}$` (but not `[╮╯┤│]$`) | Response boundary |
| Input prompt | `^[>❯]` or `^[>❯]\s+\S` | Ready for input |
| Cost box marker | `⎿  Stop says:` | Truncation point |
| Response marker | `^⏺` | Start of response text |
| Tool invoke | `^\s*⎿\s+(Read\|Write\|Edit\|Bash)\(` | Active tool invocation |

### 2. Config Suggestion Extraction

**Three sources of structured data**:
1. **Fenced json:config blocks** - Regex matching (fallback if source is raw markdown)
2. **Raw JSON arrays in terminal** - Bracket tracking (primary method when fences are stripped)
3. **Validation** - All objects must have `{action, field, value}` shape

**Processing pipeline**:
```
Terminal output
  ↓
stripAnsi() → remove color codes
  ↓
Strategy 1: Regex for fenced blocks
  ↓ (if found)
Strategy 2: Raw JSON detection
  ↓ (if not found)
Validate structure
  ↓
Return { cleanText, suggestions[] }
```

### 3. Response State Detection

**Three possible states**:

1. **Thinking** - Claude is still processing
   - Has thinking indicator OR
   - Has active tool call in current response region (after last separator)
   - Keywords: thinking, analyzing, generating, processing
   - `esc to interrupt` (but not `esc to cancel`)

2. **Complete** - Response is ready
   - Has 2+ separators AND
   - Has prompt between top 2 separators AND
   - No thinking indicators

3. **Initial** - No response yet (first interaction)
   - Fewer than 2 separators OR
   - No prompt between separators

### 4. File Upload/Attachment Handling

**Upload flow**:
1. User clicks "Upload" button next to field
2. Hidden `<input type="file">` triggered
3. User selects file (`.md`, `.txt`, `.toml`)
4. File POSTed to `/api/agents/creation-helper/file-picker`
5. Server:
   - Validates extension and size (max 1MB)
   - Generates sanitized filename: `<4-byte-hex>-<original-name>`
   - Saves to `~/.aimaestro/tmp/creation-helper/<filename>`
   - Returns `{ path, filename }`
6. Frontend stores server-side path, displays in attachment panel

**Three attachable files**:
- **Agent description** (`.md`) - For NEW agent profiling (CREATE mode)
- **Existing profile** (`.toml`) - For EDIT or ALIGN modes
- **Design document** (`.md`) - For alignment and context

### 5. Profile Generation Workflow (PSS Integration)

**Three modes**:

| Mode | Requires | Optional | Message Format |
|------|----------|----------|-----------------|
| CREATE | Agent description | Design doc | `[PROFILE REQUEST] mode: create \| Agent description: /path` |
| EDIT | Existing profile | Design doc | `[PROFILE REQUEST] mode: edit \| Existing profile: /path` |
| ALIGN | Existing profile + Design doc | None | `[PROFILE REQUEST] mode: align \| Existing profile: /path \| Design document: /path` |

**PSS Integration** (per Haephestos persona):
- Haephestos spawns the `pss-agent-profiler` agent using the **Agent** tool
- Passes AGENT_PATH, REQUIREMENTS_PATHS, INDEX_PATH, OUTPUT_PATH via environment
- PSS reads skill index, analyzes agent description + design requirements
- PSS generates/updates `.agent.toml` profile
- Haephestos reads the result and sends back `json:config` suggestions
- UI applies suggestions to config panel

### 6. Stale Response Tracking

**Problem solved**: After sending a new message, the same response text is still visible in the terminal until Claude starts typing. Without tracking, the UI would immediately show "response complete" before Claude has actually started.

**Solution**: Use a hash fingerprint:
1. **Before sending message**: Capture terminal, parse response (if complete), hash it → `staleResponseHash`
2. **After message sent**: Each poll checks hash of captured response
3. **If hash matches**: Still showing old response → return `isComplete: false`
4. **If hash differs**: New response arrived → clear tracking, return response

**Hash function**: djb2 (simple, fast, good distribution):
```typescript
function simpleHash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}
```

---

## Section 4: DATA EXTRACTION & STRUCTURED OUTPUT

### What Structured Data is Extracted from Claude's Responses?

| Data | Source | Type | Usage |
|------|--------|------|-------|
| `responseText` | Text between separators (ANSI-stripped, cost-box-trimmed) | string | Displayed in chat, part of conversation history |
| `configSuggestions[]` | Parsed from `json:config` blocks | Array<{action, field, value}> | Applied to config panel via `applySuggestions()` |
| `isThinking` | Presence of thinking indicators or active tool markers | boolean | UI shows "Thinking..." spinner, resets idle timeout |
| `isComplete` | Presence of 2+ separators and prompt | boolean | UI enables input, stops polling |
| `text` (captureResponse) | Clean response without config blocks | string | Returned to frontend for display |

### How json:config Parsing Works

**Input** (from Claude):
```json
[
  {"action": "set", "field": "name", "value": "backend-api"},
  {"action": "set", "field": "model", "value": "claude-opus-4-5"},
  {"action": "add", "field": "skills", "value": {"name": "tdd", "description": "Test-driven development"}},
  {"action": "add", "field": "rules", "value": "Always write tests before implementation"}
]
```

**Output** from `parseConfigBlocks()`:
```typescript
{
  cleanText: "Here is my suggested configuration...",  // Config blocks removed
  suggestions: [
    { action: 'set', field: 'name', value: 'backend-api' },
    { action: 'set', field: 'model', value: 'claude-opus-4-5' },
    { action: 'add', field: 'skills', value: { name: 'tdd', description: '...' } },
    { action: 'add', field: 'rules', value: 'Always write tests...' }
  ]
}
```

### What Happens with Parsed Suggestions?

Frontend applies them via `applySuggestions()`:

```typescript
const applySuggestions = useCallback((suggestions: ConfigSuggestion[]) => {
  setConfig(prev => {
    const next = { ...prev }
    for (const s of suggestions) {
      if (s.action === 'set') {
        // Direct assignment
        (next as Record<string, unknown>)[s.field] = s.value
      } else if (s.action === 'add') {
        // Push to array with deduplication by .name
        const arr = next[s.field as keyof AgentConfigDraft]
        if (Array.isArray(arr)) {
          const item = s.value
          if (typeof item === 'string') {
            if (!(arr as unknown[]).includes(item)) {
              (next as Record<string, unknown>)[s.field] = [...arr, item]
            }
          } else {
            // {name, description} shape
            if (!(arr as ConfigItem[]).find(x => x.name === item.name)) {
              (next as Record<string, unknown>)[s.field] = [...arr, item]
            }
          }
        }
      } else if (s.action === 'remove') {
        // Filter array by name
        const arr = next[s.field as keyof AgentConfigDraft]
        if (Array.isArray(arr)) {
          const name = typeof s.value === 'string' ? s.value : s.value.name
          (next as Record<string, unknown>)[s.field] = arr.filter((x: string | ConfigItem) =>
            typeof x === 'string' ? x !== name : x.name !== name
          )
        }
      }
    }
    return next
  })
}, [])
```

**Fields affected**: name, program, model, role, workingDirectory, teamId, skills, plugins, mcpServers, hooks, rules, tags, programArgs

---

## Section 5: WHAT WOULD REMAIN WITH TERMINAL-BASED APPROACH

### Architecture Change Scenario
If Haephestos becomes a **regular agent with its own terminal tab** (not hidden, not temporary):

### What Functionality Would Still Be Needed

1. **Terminal Parsing Logic** (UNCHANGED)
   - `detectResponseState()` - Still needed to know when response is complete
   - `parseConfigBlocks()` - Still needed to extract config suggestions
   - `stripAnsi()` - Still needed to clean output
   - Separator line detection - Still needed for boundary finding
   - Response state machine (thinking vs complete) - Still needed

2. **Session Management** (MOSTLY UNCHANGED)
   - Tmux session creation - Still needed
   - Agent file deployment - Still needed (or handled by agent system)
   - Environment variable setup - Still needed

3. **Response Capture** (MOSTLY UNCHANGED)
   - `capturePane()` polling - Still needed (unless replaced with WebSocket streaming)
   - Stale response tracking - Still needed (unless streaming)
   - Cost box stripping - Still needed
   - Response text extraction - Still needed

### What Would Change

1. **Session Lifecycle**
   - **Before**: Temporary session, created on dialog mount, destroyed on unmount
   - **After**: Persistent session (or ephemeral but managed by agent system), survives dialog close
   - **Impact**: Session cleanup logic moves from component unmount to agent deletion

2. **UI Integration**
   - **Before**: Dedicated modal with chat history, config panel, attachments
   - **After**: Shared TerminalView component (like other agents), separate config panel component
   - **Impact**: Split concerns - terminal display vs config management

3. **Message Relay**
   - **Before**: API endpoint that relays sanitized text to tmux
   - **After**: Could use existing WebSocket terminal or continue with tmux (simpler)
   - **Impact**: No change if keeping tmux; WebSocket approach requires different polling

4. **File Uploads**
   - **Before**: POSTs to `/api/agents/creation-helper/file-picker`, stored in temp dir
   - **After**: Could use agent's working directory or shared temp storage
   - **Impact**: Need to decide where to store files, how to pass paths to Claude

5. **Config Suggestions Application**
   - **Before**: Done by React component (`applySuggestions()`)
   - **After**: Could remain same OR move to API endpoint for consistency
   - **Impact**: No functional change; architectural choice

### What Would Break

1. **Temporary System Agent Status**
   - The persona file specifies `temporary: true, registerable: false, messageable: false, teamAssignable: false`
   - A regular agent would have different constraints
   - Solution: Update persona file OR create separate persona for persistent Haephestos

2. **Isolation Constraints**
   - **Before**: Haephestos never appears in agent lists, can't receive messages
   - **After**: Would appear in lists, receive messages (unless marked hidden)
   - **Impact**: UI changes to hide/show agent

3. **Permissions Model**
   - **Before**: `permission-mode: bypassPermissions` (special mode for helper)
   - **After**: Would need to handle permissions like other agents
   - **Impact**: May need reduced tool set or explicit permissions

4. **Ownership Model**
   - **Before**: `owner: 'system'` in agent creation
   - **After**: Would be owned by current user
   - **Impact**: Governance model changes

5. **Response Capture Timing**
   - **Before**: Component unmounts → immediate cleanup
   - **After**: Agent persists → when does cleanup happen? On logout? On browser close?
   - **Impact**: Dangling sessions possible if not careful

---

## Section 6: CRITICAL CHALLENGES TO SWITCHING

### Challenge 1: Terminal Parsing Remains Critical

**Current state**: Terminal parsing is the CORE mechanism for:
- Detecting when Claude finishes responding (no explicit API signal)
- Extracting structured suggestions from text output
- Knowing if Claude is thinking or ready for input

**With terminal-based approach**: These challenges REMAIN unchanged
- Still need separator detection (no change)
- Still need thinking indicator detection (no change)
- Still need json:config parsing (no change)
- Still need response text extraction (no change)

**Why this matters**: The terminal output parsing is NOT dependent on the hidden session model. It would work exactly the same if Haephestos was a regular agent.

### Challenge 2: Session Lifecycle Management

**Current complexity**:
- Session created on dialog mount
- Session destroyed on dialog unmount
- If unmount fails, session leaked (mitigated by "fire-and-forget" DELETE)
- No recovery from crashes

**With persistent agent**:
- Who creates the session? (Agent system? Haephestos itself?)
- When is session destroyed? (Agent hibernation? Explicit delete?)
- How to prevent session leaks? (Heartbeat checks? Age limits?)
- How to recover from crashes? (Restart checks?)

**Solution approach**:
- Let agent system manage session (create on agent start, destroy on agent stop)
- Use standard agent lifecycle (hibernation, wakeup)
- Add session validation in status checks

### Challenge 3: Response Detection via capture-pane (No Streaming)

**Current approach**: No WebSocket streaming, just tmux capture-pane polling
```
Frontend → GET /api/response
  ↓
Backend → tmux capture-pane
  ↓
Parse & return { isComplete, text, suggestions }
  ↓
Frontend → repeat if !isComplete
```

**Why polling is necessary**:
- No explicit signal from Claude Code that response is complete
- Only indicator is the shell prompt (`>` or `❯`) returning
- Must detect this via terminal parsing

**With persistent agent**: Could switch to WebSocket streaming
- TerminalView already streams output in real-time
- Could listen for prompt return on WebSocket instead of parsing
- Less fragile than separator line detection
- But changes architecture significantly

**Recommendation**: Keep polling approach (simpler, compatible with current system)

### Challenge 4: File Upload Storage

**Current**:
- Files saved to `~/.aimaestro/tmp/creation-helper/`
- Cleaned up when session destroys
- Temporary paths passed to Claude

**With persistent agent**:
- Can't use temp dir (persists across sessions)
- Options:
  1. Use agent's working directory
  2. Use session-specific temp dir (with cleanup logic)
  3. Use shared uploads dir in AI Maestro
- Must ensure cleanup doesn't leave orphaned files

### Challenge 5: Polling Loop Design

**Current**:
- Component mounts → starts polling
- Component unmounts → stops polling
- UI fully controls polling lifecycle

**With persistent agent**:
- Agent persists between UI sessions
- Polling would need to continue even if UI closed
- Or: Accept that UI closing stops polling (session can't receive responses)
- Or: Move polling to backend (server-driven updates via WebSocket)

**Recommendation**: Keep component-driven polling but add recovery (heartbeat check if polling stops)

---

## Section 7: FILES NOT YET EXAMINED

These files REFERENCE Haephestos but are not core:

- `app/page.tsx` - Triggers creation helper modal via CreateAgentModal component (in AgentList.tsx)
- `components/AgentList.tsx` - Contains `CreateAgentModal` which mounts `AgentCreationHelper` when "New Agent" is clicked
- `lib/agent-registry.ts` - Lists excluded agent names including 'haephestos-creation-helper' (not registered)
- `services/headless-router.ts` - Routes include creation-helper API endpoints (needed in headless mode)
- `docs_dev/archive/creation-helper-state-machine-route.ts` - OLD version (keep for reference)

---

## Section 8: SUMMARY TABLE

### What Makes Haephestos Unique

| Aspect | Haephestos | Regular Agent |
|--------|-----------|---------------|
| Session | Hidden, temporary tmux | Visible, persistent (or ephemeral) |
| Registration | Not in registry | In registry with ID |
| Messaging | No AMP messaging | Can receive messages |
| UI | Dedicated modal + config panel | Shared TerminalView |
| Lifecycle | Dialog lifetime | Agent creation to deletion |
| File uploads | Temp storage `~/.aimaestro/tmp/` | Working directory or custom |
| Parsing | Terminal parsing is core | Terminal parsing still needed |
| Response detection | Polling-based state machine | Polling-based OR WebSocket streaming |
| Tools | Read, Glob, Grep, Agent | Configurable |
| Permissions | Bypass mode | Standard permissions |

---

## Conclusion

**Switching Haephestos from hidden session to persistent agent is architecturally feasible BUT requires careful design**:

1. **Terminal parsing stays the same** - Not a blocker, already handles complexity
2. **Session management changes** - Must integrate with agent lifecycle system
3. **Lifecycle cleanup changes** - No longer destroyed on dialog close
4. **UI integration changes** - Uses shared TerminalView, separate config panel
5. **File storage changes** - Can't use temp dir, needs different strategy
6. **Persona changes** - Update temp/registerable/messageable/teamAssignable flags

**The core intelligence (terminal parsing, config extraction) would NOT change. The challenge is re-architecting the lifecycle and UI integration, not the terminal analysis.**

