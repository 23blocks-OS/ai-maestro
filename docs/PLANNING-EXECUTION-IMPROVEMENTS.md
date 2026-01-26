# Planning & Execution Improvements

**Purpose:** Research and implementation plan for improving agent planning, task execution, and context management in AI Maestro.

**Last Updated:** 2026-01-25
**Status:** Research Phase

---

## Executive Summary

This document explores improvements to how AI Maestro agents plan and execute complex tasks. The primary inspiration comes from the "Manus-style" planning pattern that treats the filesystem as persistent memory while the context window serves as volatile working memory.

**Key Insight:** By constantly refreshing objectives into the model's recent attention span (via markdown files), agents avoid "lost-in-the-middle" issues and maintain goal alignment during long-running operations.

---

## Two Different Problems: Recall vs Execution

AI Maestro agents face two distinct "lost-in-the-middle" challenges. Our **Memory system** and the **Planning system** solve different problems:

| System | Problem | Core Question | "Lost" Symptom |
|--------|---------|---------------|----------------|
| **Memory (RAG)** | **Recall Problem** | "What do I know? What happened before?" | "I forgot we discussed this 3 weeks ago" |
| **Planning (Manus-style)** | **Execution Problem** | "What am I doing? What's the next step?" | "I forgot what I was building 10 minutes ago" |

### The Recall Problem (Memory)

When an agent needs to remember:
- Previous decisions made in past conversations
- Code patterns used elsewhere in the codebase
- User preferences expressed weeks ago
- Context from a conversation that was compacted

**Solution:** RAG with semantic search over conversation history and long-term memory consolidation.

**AI Maestro has this:** CozoDB + hybrid search + memory consolidation + subconscious indexing.

### The Execution Problem (Planning)

When an agent loses focus during complex tasks:
- Drifts from the original goal after 50+ tool calls
- Forgets phase 2 requirements while deep in phase 1 implementation
- Repeats the same error because it wasn't tracked
- Can't resume work after `/clear` or session restart

**Solution:** Persistent markdown files that are re-read before decisions and updated after actions.

**AI Maestro needs this:** The planning skill fills this gap.

### Why Both Are Needed

```
Long-term recall          Short-term focus
      │                         │
      ▼                         ▼
┌─────────────┐          ┌─────────────┐
│   Memory    │          │  Planning   │
│    (RAG)    │          │  (Files)    │
└─────────────┘          └─────────────┘
      │                         │
      ▼                         ▼
"What did we               "What am I
 decide last                supposed to
 month?"                    do next?"
```

They operate on different timescales:
- **Memory**: Days, weeks, months of history
- **Planning**: Minutes, hours of current task execution

Both suffer from attention limits, but the solutions differ:
- **Memory**: Index everything, retrieve what's relevant
- **Planning**: Keep goals visible, refresh constantly

---

## Research: Manus AI Planning Pattern

### Background

Manus AI was acquired by Meta for $2 billion in December 2025. Their core innovation was **context engineering** - a systematic approach to managing what information the model sees and when.

### The 3-File Pattern

The Manus-style planning system uses three persistent markdown files:

| File | Purpose | Update Timing |
|------|---------|---------------|
| `task_plan.md` | Phase tracking, goals, checkboxes | After each phase |
| `notes.md` / `findings.md` | Research findings, discoveries | During research |
| `progress.md` / `deliverable.md` | Session logs, errors, output | Continuously |

### Core Philosophy

> "Markdown is my 'working memory' on disk. Since I process information iteratively and my active context has limits, Markdown files serve as scratch pads for notes, checkpoints for progress, building blocks for final deliverables."

**Mental Model:**
- **Context Window** = RAM (volatile, limited, fast)
- **Filesystem** = Disk (persistent, unlimited, requires explicit read)

### Why It Works

1. **Attention Recency Bias**: By rewriting the todo list, objectives are pushed into the model's recent attention span
2. **Lost-in-the-Middle Mitigation**: Important information isn't buried in long conversation history
3. **Session Recovery**: Incomplete work can be resumed by reading plan files
4. **Error Tracking**: Persistent error logs prevent repeating mistakes
5. **Context Offloading**: Large content lives in files, not stuffing the context window

### Hook Integration (planning-with-files)

The [planning-with-files](https://github.com/OthmanAdi/planning-with-files) skill (9.7k stars) uses Claude Code hooks:

| Hook | Action |
|------|--------|
| `PreToolUse` | Re-read task_plan.md before major decisions |
| `PostToolUse` | Remind to update progress after file writes |
| `SessionStart` | Recover unsynced work from previous sessions |
| `Stop` | Verify task completion before ending |

---

## AI Maestro: Current State & Gap

### What We Have (Memory/Recall)

- **RAG System**: CozoDB with hybrid search (semantic + lexical) - `lib/cozo.ts`
- **Memory Consolidation**: Long-term memory extraction from conversations
- **Subconscious**: Background indexing of conversation history
- **Memory Skill**: Agents can search their history and consolidated memories

### What We Need (Planning/Execution)

- **Task Planning Files**: Persistent task_plan.md for complex work
- **Progress Tracking**: Error logs, phase completion, session recovery
- **Hook Integration**: Re-read goals before decisions, update after actions

### How Manus Combines Both

Manus uses a layered architecture with BOTH approaches:

1. **Event Stream**: Recent context (volatile)
2. **File-Based Planning**: Task state and progress (persistent, explicit)
3. **Knowledge Base**: Reference docs (persistent, on-demand)
4. **Vector Storage (RAG)**: Semantic retrieval (persistent, searchable)

**Key insight:** Planning files are read/written constantly during execution. RAG is queried when relevant context is needed. Different access patterns for different problems.

---

## Implementation Plan

### Phase 1: Add Planning Skill

**Effort:** Small (1-2 days)
**Priority:** High

Add the planning-with-files skill as an installable skill for AI Maestro agents.

**Files to create:**
```
skills/
  planning/
    SKILL.md           # Skill instructions
    templates/
      task_plan.md     # Template for task planning
      notes.md         # Template for research notes
```

**Installation:** Agents can install via skill system or manual copy to `~/.claude/skills/planning/`

### Phase 2: Extend Hook System

**Effort:** Medium (2-3 days)
**Priority:** Medium

Add PreToolUse and PostToolUse hooks to `ai-maestro-hook.cjs`:

```javascript
case 'PreToolUse':
    // Read task_plan.md before major tool use
    // Inject current objectives into context
    break;

case 'PostToolUse':
    // Remind agent to update progress
    // Log tool results to progress.md
    break;
```

**Current hooks we support:**
- `SessionStart` - Session initialization
- `Notification` (idle_prompt, permission_prompt) - Waiting states
- `Stop` - Session end
- `PermissionRequest` - Tool permission prompts

**Hooks to add:**
- `PreToolUse` - Before tool execution
- `PostToolUse` - After tool execution

### Phase 3: Dashboard Integration

**Effort:** Medium (2-3 days)
**Priority:** Low

Add UI support for viewing/editing planning files:

1. **Plan Viewer Panel**: Show task_plan.md status in agent metadata
2. **Progress Indicator**: Visual progress based on checkbox completion
3. **Notes Search**: Search across notes.md files for all agents

### Phase 4: Auto-Planning (Future)

**Effort:** Large
**Priority:** Future

Automatically create planning files when agents receive complex tasks:

1. Detect multi-step tasks (3+ steps, research, building)
2. Auto-generate task_plan.md with phases
3. Track completion and surface stalled tasks

---

## Related Tools

### YATL (Yet Another Task List)

[YATL](https://github.com/brianm/yatl) is a Rust CLI for file-based task tracking:

- Tasks stored as markdown in `.tasks/` directories
- Status determined by directory: `open/`, `in-progress/`, `blocked/`, `closed/`
- Git-friendly: branches and merges like code
- Dependency management: auto-unblocks when blockers close

**Potential use:** Could complement planning skill for more formal task management across agent teams.

---

## Template: task_plan.md

```markdown
# Task: [Task Name]

## Goal
[Clear statement of what success looks like]

## Status
- **Current Phase:** [1/4]
- **Started:** [timestamp]
- **Last Updated:** [timestamp]

## Phases

- [ ] Phase 1: Research & Discovery
  - [ ] Subtask 1.1
  - [ ] Subtask 1.2
- [ ] Phase 2: Implementation
  - [ ] Subtask 2.1
  - [ ] Subtask 2.2
- [ ] Phase 3: Testing & Validation
- [ ] Phase 4: Documentation & Delivery

## Key Questions
1. [Question that needs answering]
2. [Another question]

## Decisions Made
| Decision | Rationale | Date |
|----------|-----------|------|
| [Choice] | [Why] | [When] |

## Errors Encountered
| Error | Resolution | Timestamp |
|-------|------------|-----------|
| [Error description] | [How fixed] | [When] |

## Notes
- [Important observations]
```

---

## References

- [planning-with-files](https://github.com/OthmanAdi/planning-with-files) - 9.7k stars, Claude Code skill
- [Manus Technical Investigation](https://gist.github.com/renschni/4fbc70b31bad8dd57f3370239dccd58f) - Architecture deep-dive
- [YATL](https://github.com/brianm/yatl) - File-based task tracking
- [Claude Code Skills Docs](https://code.claude.com/docs/en/skills) - Official documentation

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-25 | Document research on Manus planning pattern | Understand approach before implementation |
| 2026-01-25 | Plan to add as complementary skill (not replace RAG) | Memory solves recall, Planning solves execution - different problems |
| 2026-01-25 | Clarify "Recall vs Execution" framing | Makes the distinction clear: Memory (weeks ago) vs Planning (minutes ago) |

---

## Next Steps

1. [ ] Create planning skill with templates
2. [ ] Test with manual installation on one agent
3. [ ] Gather feedback on usefulness
4. [ ] Decide on hook extensions (PreToolUse/PostToolUse)
5. [ ] Consider dashboard integration
