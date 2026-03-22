# Fix Report: AgentBadge.tsx — Wrong session source for online/hibernated status

**File fixed:** `/Users/emanuelesabetta/ai-maestro/components/AgentBadge.tsx`
**Date:** 2026-03-22

## Bug Fixed (High Severity)

The component was using `agent.sessions?.[0]` (the stored `AgentSession` config array element) as the source of truth for runtime online/offline status. This is wrong.

The `Agent` type has two distinct fields:
- `agent.sessions: AgentSession[]` — stored session configuration; its presence means the agent has been configured and can be hibernated/woken
- `agent.session?: AgentSessionStatus` — runtime live tmux session status, populated by the API at query time (not persisted)

Using `agent.sessions?.[0].status` for the live status check produces incorrect results: it reads stale/persisted status instead of the current live tmux session status. An agent that was offline when last saved would always appear offline even if it is currently online.

Every other file in the codebase uses `agent.session?.status` (singular) for live status:
- `app/page.tsx:750`
- `components/AgentList.tsx:532, 1125, 1240`
- `app/zoom/page.tsx:284`
- `components/MobileHostsList.tsx:304`

## Changes Made

1. **Removed** local `session` variable (`agent.sessions?.[0]`) from `AgentBadge` component body.
2. **Changed** `isOnline` to use `agent.session?.status === 'online'` (runtime status).
3. **Changed** `getStatusInfo(session, ...)` call to `getStatusInfo(agent.session, ...)`.
4. **Updated** `getStatusInfo` parameter type from `AgentSession | undefined` to `AgentSessionStatus | undefined` to match what is now passed.
5. **Updated** import: replaced `AgentSession` with `AgentSessionStatus` from `@/types/agent`.

## Skipped (Low Severity / Judgment Calls)

- `boxShadow` color mapping (low severity style issue — skipped per instructions)
- `isEmoji` regex refinement (low severity, speculative — current implementation works correctly for all practical emoji inputs)
- Gemini's "double isHibernated calculation" finding was a false positive: `getStatusInfo` already accepted `isHibernated` as a parameter and did not recalculate it internally.
