# Persona-First Agent Identity Redesign

**Date:** 2026-03-20
**Status:** Draft — pending project owner approval
**PR:** Separate PR from current `feature/team-governance` branch

## Summary

Redesign the agent identity system to make **Persona Name** the primary user-facing identifier, replacing the current tag-based sidebar hierarchy (derived from agent-id hyphen splitting) with a **closed-team-based** grouping. Agent-ID becomes an internal-only field.

## Motivation

The current system splits agent-id on hyphens to create a sidebar tree hierarchy (`parseNameForDisplay`). This creates several problems:

1. **Confusing naming**: Users must craft agent-ids with specific hyphen patterns to control sidebar grouping
2. **Redundant with teams**: The team system already provides organizational structure — the tag-based hierarchy duplicates it
3. **Agent-ID is not user-friendly**: Technical identifiers like `backend-tester-tommy` are shown prominently while the persona name ("Tommy") is secondary
4. **Inconsistent addressing**: Messages can use agent-id, alias, or persona name — but persona name resolution was missing (now added)

## Proposed Changes

### Phase 1: Non-Breaking UI Changes (current PR)

- [x] Show Persona Name prominently in sidebar agent cards
- [x] Show agent-id as small secondary info (not removed, just de-emphasized)
- [ ] Group sidebar by closed teams instead of tag-based hierarchy
- [ ] Update kanban task cards to show persona name + host
- [ ] Update team member lists to show persona name

### Phase 2: Breaking Changes (separate PR, needs owner approval)

#### 2a. Remove tag-based hierarchy

- Remove `parseNameForDisplay()` from `types/agent.ts`
- Remove `tags` derivation from `sessions-service.ts` (lines 355, 602)
- Remove 2-level grouping logic from `AgentList.tsx` (lines 274-290)
- Replace with single-level closed-team grouping

#### 2b. Agent-ID becomes internal-only

- Remove agent-id from AgentProfile UI (currently "Agent ID" field)
- Remove agent-id from AgentCreationWizard summary
- Keep agent-id in the registry for internal use (tmux session names, API routing)
- For agents without a Persona Name, auto-generate one from the last segment of the agent-id

#### 2c. Sidebar grouped by closed teams

```
[Team: Backend Squad]        ← collapsible
  Peter-Parker (mac-mini)
  Lucy-Bot (macbook)
  Tommy (mac-mini)

[Team: Frontend Team]        ← collapsible
  Sarah-Dev (macbook)
  Jack-The-Bot (mac-mini)

[Unassigned]                 ← agents not in any closed team
  Sammy (macbook)
  Debug-Agent (mac-mini)
```

- Only closed teams shown (open teams share agents — would duplicate cards)
- Cross-host: when viewing "All Hosts", show all team members with host suffix
- When viewing a specific host, only show members from that host
- Single level — no nested sub-groups (better usability)
- Collapsible team sections

#### 2d. Remove tag-based sidebar hierarchy UI

The AgentProfile currently has a "Sidebar Organization (Tags)" section that lets users set tags to control the sidebar tree hierarchy (first tag = folder, second = subfolder). This system is being replaced by team-based grouping:

- **Remove** the "Sidebar Organization (Tags)" section from AgentProfile.tsx (the tag editor with folder preview)
- **Remove** the sidebar tree hierarchy rendering in AgentList.tsx (`groupedAgents` logic using `tags[0]`/`tags[1]`)
- **Keep** the `tags` field on agents — but only for search/filtering purposes, NOT hierarchy
- Tags should be a flat list of searchable labels (e.g. "api", "frontend", "critical"), not structural
- The sidebar preview showing folder/subfolder structure should be removed entirely

#### 2e. Enforce Persona Name uniqueness per host

- `createAgent()` in `agent-registry.ts` must check label uniqueness on the same host
- `updateAgent()` must also check on rename
- Reject duplicate persona names with a clear error message
- Auto-migration: agents without labels get one derived from their agent-id's last segment

#### 2e. Messaging address format

- **Preferred format:** `<persona-name>@<host>` (e.g., `peter-parker@mac-mini`)
- **Legacy format still works:** `<agent-id>@<host>` (e.g., `backend-tester-tommy@mac-mini`)
- **Partial resolution:** If user omits `@host`, resolve on self-host first, then show disambiguation list if ambiguous
- **Already implemented:** Label resolution (steps 2.7 and 3.7 in resolver chain)

#### 2f. Team & Kanban display updates

- Task assignee shown as `Persona-Name (host)` instead of agent-id
- Team member lists show persona names
- All dropdowns/selectors show persona name with agent-id as tooltip

## Migration Strategy

### Existing agents without Persona Names

```typescript
// Auto-derive label from agent-id last segment
function deriveLabelFromName(agentName: string): string {
  const segments = agentName.split('-')
  const lastSegment = segments[segments.length - 1]
  // Capitalize: "tommy" → "Tommy"
  return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1)
}
```

Run this migration on startup for any agent with `label === undefined`.

### Backward compatibility

- Agent-ID remains in the registry — no schema change
- All API endpoints continue accepting agent-id
- AMP messaging continues resolving by agent-id (label is additive)
- tmux session names still use agent-id (no tmux change)
- `parseNameForDisplay()` removed but tags field preserved (manual tags still work)

## Files Affected

### Phase 1 (non-breaking)
- `components/AgentList.tsx` — sidebar grouping
- `components/team-meeting/KanbanCard.tsx` — task display
- `components/team-meeting/TaskCard.tsx` — task assignee
- `app/page.tsx` — sidebar rendering

### Phase 2 (breaking)
- `types/agent.ts` — remove `parseNameForDisplay()`
- `lib/agent-registry.ts` — enforce label uniqueness, auto-migration
- `services/sessions-service.ts` — stop deriving tags from name
- `components/AgentList.tsx` — complete rewrite of grouping logic
- `components/AgentProfile.tsx` — hide agent-id field
- `components/AgentCreationWizard.tsx` — remove agent-id from summary
- `agents/haephestos-creation-helper.md` — check persona name uniqueness

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Remove tag hierarchy | Low | Teams already exist; manual tags preserved |
| Hide agent-id | Low | Still works internally; API unchanged |
| Enforce persona uniqueness | Medium | Migration script for existing agents |
| Change messaging format | Medium | Legacy format still works; additive only |
| Team-based sidebar | Medium | Need to handle agents in 0 teams (Unassigned) |

## Open Questions for Project Owner

1. Should the agent-id field be completely hidden or shown as a read-only "technical ID" in an advanced section?
2. Should open teams also appear in the sidebar (with a note that agents may appear in multiple groups)?
3. Should the `tags` field on agents be removed entirely, or kept for manual user-defined grouping?
4. Is the `<persona-name>@<host>` format acceptable for the AMP protocol, or should we keep `<agent-id>@<host>` as the canonical wire format?
5. Should Haephestos ask the user for an agent-id, or auto-generate one from the persona name (e.g., "Peter-Parker" → `peter-parker`)?
