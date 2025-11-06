# JSONL Conversation Structure: Complete Data Inventory

**Author:** AI Maestro Analytics Team
**Date:** 2025-11-03
**Purpose:** Document all data captured in Claude Code's JSONL conversation files

## Overview

Claude Code stores every conversation in JSONL (JSON Lines) format at:
```
~/.claude/projects/<project-path>/<session-uuid>.jsonl
```

Each line is a complete JSON object representing one message/event in the conversation.

## Message Type Distribution (Real Data)

From analyzing `1e8544aa-de65-4f54-8691-4d138836c981.jsonl` (471KB conversation):

| Message Type | Count | Purpose |
|-------------|-------|---------|
| `assistant` | 2,926 | Claude's responses (text + tool uses) |
| `user` | 2,047 | User inputs + tool results |
| `tool_use` | 1,785 | Tool invocations |
| `tool_result` | 1,784 | Tool execution results |
| `text` | 1,462 | Text content blocks |
| `file-history-snapshot` | 301 | File state snapshots |
| `system` | 30 | System messages |
| `create` | 54 | File creation events |
| `update` | 2 | File update events |
| `summary` | 1 | Conversation summary |

## Core Message Schema

Every JSONL line contains these **top-level fields**:

```json
{
  "uuid": "string",                    // Unique message ID
  "parentUuid": "string",              // Previous message ID (conversation chain)
  "sessionId": "string",               // Session UUID
  "timestamp": "2025-10-29T04:41:30.541Z",  // ISO 8601 timestamp
  "type": "user" | "assistant" | "system",
  "message": { /* Message content */ },
  "cwd": "/path/to/working/directory", // Current working directory
  "gitBranch": "feature/branch-name",  // Active git branch
  "version": "2.0.28",                 // Claude Code version
  "userType": "external",              // User type identifier
  "isSidechain": false,                // Thread branching flag
  "requestId": "req_...",              // API request ID (assistant only)
  "toolUseResult": { /* Tool metadata */ }  // Tool execution details
}
```

## 1. User Messages

**Type:** `"type": "user"`

Represents user input OR tool results sent back to Claude.

### User Input Message
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Help me implement a new feature"
  },
  "timestamp": "2025-10-29T04:41:30.541Z",
  "uuid": "...",
  "cwd": "/Users/...",
  "gitBranch": "main"
}
```

### Tool Result Message
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "tool_use_id": "toolu_01GU6p2oVL684bnAsjUKMoJH",
        "type": "tool_result",
        "content": "File contents or command output...",
        "is_error": false
      }
    ]
  },
  "toolUseResult": {
    // Tool-specific metadata (see section 4)
  }
}
```

## 2. Assistant Messages

**Type:** `"type": "assistant"`

Claude's responses, including text AND tool invocations.

### Text Response
```json
{
  "type": "assistant",
  "message": {
    "model": "claude-sonnet-4-5-20250929",
    "id": "msg_016TFuhMPk5vPCswMnYVyWuA",
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "I'll help you with that..."
      }
    ],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": {
      "input_tokens": 4,
      "cache_creation_input_tokens": 352,
      "cache_read_input_tokens": 70236,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 352,
        "ephemeral_1h_input_tokens": 0
      },
      "output_tokens": 114,
      "service_tier": "standard"
    }
  },
  "requestId": "req_011CUaskeUr1UKvF85VmEUfS"
}
```

### Tool Invocation
```json
{
  "type": "assistant",
  "message": {
    "model": "claude-sonnet-4-5-20250929",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01DQ1naWmUDLcgNfBhRXzTFP",
        "name": "Bash",
        "input": {
          "command": "git status",
          "description": "Check current status"
        }
      }
    ],
    "usage": { /* Same as above */ }
  }
}
```

## 3. Token Usage Data

**Field:** `message.usage`

Every assistant message includes detailed token usage:

```json
"usage": {
  "input_tokens": 4,                          // Prompt tokens
  "cache_creation_input_tokens": 352,         // New cached tokens
  "cache_read_input_tokens": 70236,           // Reused cached tokens
  "cache_creation": {
    "ephemeral_5m_input_tokens": 352,         // 5-minute cache
    "ephemeral_1h_input_tokens": 0            // 1-hour cache
  },
  "output_tokens": 114,                       // Completion tokens
  "service_tier": "standard"
}
```

**Pricing Calculation:**
```javascript
// Sonnet 4.5 pricing (as of 2025)
const PRICING = {
  input: 0.003,          // per 1K tokens
  output: 0.015,         // per 1K tokens
  cacheWrite: 0.00375,   // per 1K tokens (cache creation)
  cacheRead: 0.0003      // per 1K tokens (cache read)
}

const cost =
  (usage.input_tokens / 1000 * PRICING.input) +
  (usage.output_tokens / 1000 * PRICING.output) +
  (usage.cache_creation_input_tokens / 1000 * PRICING.cacheWrite) +
  (usage.cache_read_input_tokens / 1000 * PRICING.cacheRead)
```

## 4. Tool Execution Metadata

**Field:** `toolUseResult`

Contains tool-specific execution details.

### Bash Tool
```json
"toolUseResult": {
  "stdout": "file1.txt\nfile2.txt\n",
  "stderr": "",
  "interrupted": false,
  "isImage": false
}
```

### Read Tool
```json
"toolUseResult": {
  "type": "text",
  "file": {
    "filePath": "/path/to/file.ts",
    "content": "file contents...",
    "numLines": 36,
    "startLine": 1,
    "totalLines": 36
  }
}
```

### Glob Tool
```json
"toolUseResult": {
  "filenames": [
    "/path/to/file1.ts",
    "/path/to/file2.ts"
  ],
  "durationMs": 86,
  "numFiles": 2,
  "truncated": false
}
```

### Write/Edit Tool
```json
"toolUseResult": {
  "type": "write",
  "filePath": "/path/to/new-file.ts",
  "linesWritten": 150,
  "durationMs": 12
}
```

### TodoWrite Tool
```json
"toolUseResult": {
  "oldTodos": [
    {"content": "Task 1", "status": "in_progress"}
  ],
  "newTodos": [
    {"content": "Task 1", "status": "completed"},
    {"content": "Task 2", "status": "pending"}
  ]
}
```

## 5. Tool Usage Breakdown (Real Data)

From the analyzed conversation:

| Tool | Invocations | % of Total | Primary Use |
|------|------------|-----------|-------------|
| Bash | 924 | 51.8% | Git commands, npm, system operations |
| Edit | 280 | 15.7% | File modifications |
| Read | 234 | 13.1% | File content inspection |
| TodoWrite | 173 | 9.7% | Task tracking |
| Write | 57 | 3.2% | File creation |
| Grep | 52 | 2.9% | Code search |
| WebFetch | 25 | 1.4% | Documentation lookup |
| Glob | 19 | 1.1% | File discovery |
| BashOutput | 9 | 0.5% | Background job monitoring |
| Task | 5 | 0.3% | Sub-agent launches |
| WebSearch | 3 | 0.2% | Web queries |
| KillShell | 3 | 0.2% | Process termination |
| ExitPlanMode | 1 | 0.1% | Planning workflow |
| AskUserQuestion | 1 | 0.1% | Interactive prompts |

**Insights:**
- Bash dominates (51.8%) - agents heavily use command line
- Edit > Write (15.7% vs 3.2%) - agents prefer modifying over creating
- TodoWrite is 4th most used - task tracking is essential
- WebFetch (25 uses) shows agents reference docs frequently

## 6. Context Tracking

### Working Directory
**Field:** `"cwd"`

Tracks where Claude is operating:
```json
"cwd": "/Users/juanpelaez/23blocks/webApps/agents-web"
```

**Use Cases:**
- Understand which project/directory agent was working in
- Track context switches between projects
- Identify multi-repo workflows

### Git Branch
**Field:** `"gitBranch"`

Tracks active branch during conversation:
```json
"gitBranch": "feature/session_persistence"
```

**Use Cases:**
- Correlate conversations with feature work
- Understand branch-based workflows
- Track feature development progress

### Claude Code Version
**Field:** `"version"`

```json
"version": "2.0.28"
```

**Use Cases:**
- Identify conversations with specific CLI versions
- Debug version-specific issues
- Track feature adoption over time

## 7. Conversation Threading

### Parent-Child Chain
**Fields:** `"uuid"` and `"parentUuid"`

Every message links to its parent, forming a conversation tree:

```
Message 1 (uuid: abc)
  └─> Message 2 (uuid: def, parentUuid: abc)
        └─> Message 3 (uuid: ghi, parentUuid: def)
              └─> Message 4 (uuid: jkl, parentUuid: ghi)
```

**Use Cases:**
- Reconstruct conversation flow
- Build conversation trees
- Track branching conversations (sidechain)

### Sidechain Flag
**Field:** `"isSidechain"`

Indicates if this is a branched conversation thread:
```json
"isSidechain": false  // Main conversation
"isSidechain": true   // Branched thread
```

## 8. API Request Tracking

**Field:** `"requestId"` (assistant messages only)

Links multiple tool uses to a single API request:
```json
"requestId": "req_011CUaTig9hqUkAQwYfV2JW9"
```

**Example:** One assistant turn invoking 3 tools sequentially:
- Read file 1: `requestId: req_ABC`
- Read file 2: `requestId: req_ABC` (same)
- Write summary: `requestId: req_ABC` (same)

**Use Cases:**
- Calculate true "assistant turns" (not just tool count)
- Understand multi-tool workflows
- Track API request batching

## 9. File History Snapshots

**Type:** `"file-history-snapshot"`

Claude Code captures file states during the conversation (301 snapshots in analyzed session).

```json
{
  "type": "file-history-snapshot",
  "message": {
    "filePath": "/path/to/modified-file.ts",
    "content": "...",
    "timestamp": "2025-10-29T04:45:12.000Z",
    "changeType": "modified"
  }
}
```

**Use Cases:**
- Reconstruct file evolution during session
- Build diff timelines
- Rollback to previous states
- Track code changes per assistant response

## 10. Model Information

**Field:** `message.model`

Tracks which Claude model was used:
```json
"model": "claude-sonnet-4-5-20250929"
```

**Possible Values:**
- `claude-sonnet-4-5-20250929` (Sonnet 4.5)
- `claude-opus-3-5-20241022` (Opus 3.5)
- `claude-haiku-3-5-20241022` (Haiku 3.5)

**Use Cases:**
- Compare model performance (Opus vs Sonnet)
- Track model costs (different pricing)
- Identify model switches mid-conversation

## 11. Stop Reasons

**Field:** `message.stop_reason`

Why the model stopped generating:
```json
"stop_reason": "end_turn"        // Natural completion
"stop_reason": "max_tokens"      // Hit token limit
"stop_reason": "stop_sequence"   // Custom stop sequence
"stop_reason": null              // Still generating (streaming)
```

## Summary: What Can We Track?

### Session-Level Metrics
- [x] Total messages (user + assistant)
- [x] Total tool invocations (by type)
- [x] Total tokens (input + output + cached)
- [x] Estimated API cost
- [x] Session duration (first timestamp → last timestamp)
- [x] Working directories used
- [x] Git branches worked on
- [x] Claude Code version

### Message-Level Metrics
- [x] Message timestamps
- [x] Response time (time between user message and assistant response)
- [x] Tool execution duration (`durationMs` in `toolUseResult`)
- [x] Tool success/error rate (`is_error` field)
- [x] Token usage per message
- [x] Cost per message

### Tool Analytics
- [x] Most used tools
- [x] Tool invocation frequency
- [x] Average tool execution time
- [x] Tool error rates
- [x] Tool usage patterns (which tools used together)
- [x] MCP tool adoption (tools starting with `mcp__`)

### Code Impact Tracking
- [x] Files read/written/edited
- [x] Number of file changes per session
- [x] Lines of code written/modified
- [x] File history snapshots

### Workflow Analysis
- [x] Bash commands executed
- [x] Git operations performed
- [x] Web searches/fetches
- [x] Task branching (Task tool usage)
- [x] Interactive prompts (AskUserQuestion)

### Cost Optimization
- [x] Cache hit rate (cache_read vs total input)
- [x] Expensive messages (high token usage)
- [x] Model switching patterns
- [x] Cost per feature/branch

## Next Steps for Implementation

1. **Phase 1: Basic Parsing**
   - Read JSONL files line-by-line
   - Parse tool_use and tool_result blocks
   - Count messages, tokens, tools

2. **Phase 2: Advanced Metrics**
   - Calculate response times
   - Track tool execution durations
   - Build tool usage distributions
   - Identify conversation threads

3. **Phase 3: Cost Analysis**
   - Parse token usage fields
   - Calculate per-message costs
   - Build cost reports
   - Track cache efficiency

4. **Phase 4: Workflow Insights**
   - Analyze Bash commands
   - Track git operations
   - Identify file change patterns
   - Build activity heatmaps

## File Structure Example

```bash
~/.claude/projects/
  -Users-juanpelaez-23blocks-webApps-agents-web/
    1e8544aa-de65-4f54-8691-4d138836c981.jsonl  # 471KB conversation
    a2b3c4d5-...-...-...-....jsonl               # Another session
    ...
```

Each project directory contains multiple conversation files (one per session).

## Parsing Performance Considerations

**File Size:** 471KB for ~2,900 messages = ~165 bytes per message average

**Parsing Strategy:**
- Use streaming JSON parser (not load entire file)
- Process line-by-line with `readline` or `chokidar`
- Build incremental metrics (update on each new line)
- Store aggregates in SQLite for fast querying

**Watch Pattern:**
```javascript
const watcher = chokidar.watch('~/.claude/projects/*/*.jsonl', {
  persistent: true,
  ignoreInitial: false,
  awaitWriteFinish: {
    stabilityThreshold: 500,
    pollInterval: 100
  }
})
```
