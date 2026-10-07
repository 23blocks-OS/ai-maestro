# B009 - A request for an unknown agent id creates an agent and a database folder

**Status:** Done (0.60.4)
**Type:** Bug (correctness, input validation)
**Created:** 2026-10-07
**Found by:** Claude, while verifying the #539 fix on mac-mini (2026-10-07)

## Problem

`AgentRegistry.getAgent(id)` (`lib/agent.ts`) is get-or-create. For an id it did not hold in memory it built an `Agent`, which opened `~/.aimaestro/agents/<id>/agent.db` and wrote a `status.json`, with no check that the id belongs to an agent. Every service that loads an agent from a URL id inherited that:

- `POST /api/agents/does-not-exist/subconscious` answered `{"success":true,...}` and left `~/.aimaestro/agents/does-not-exist/` behind (reproduced on mac-mini).
- The same held for the memory, graph, docs, skills, tracking and conversation-message routes (28 service functions).
- The id was joined into a path unchecked (`path.join(home, '.aimaestro', 'agents', id)`), so an id such as `..` resolved outside the agents directory.
- A mistyped or hostile id leaves a stray database folder, and holds one of the 10 LRU agent slots. A real host has more agent folders than registry entries (this Mac: 182 folders, 106 registered), so some of that may already be debris. Nothing was deleted by this fix.

## Fix

- `lib/agent.ts`: `isSafeAgentId` (a plain name: no separators, no `.`/`..`, at most 128 characters), `isKnownAgentId` (registered, including soft-deleted, or already has a folder on disk), `AgentNotFoundError`. `getAgent` refuses an unknown id before it evicts or creates anything.
- `services/agent-guard.ts`: `unknownAgentResult(id)` returns a 404 `agent_not_found`. Called before each agent load in the docs, graph, memory, skills, subconscious and conversation-message services. A test counts loads against guards per service file, so a new service that forgets fails CI.
- Existing data keeps working: a registered agent, a soft-deleted one, and an orphaned folder all still load.

## Not done

- Existing stray folders are not cleaned up. They cannot be told apart from orphaned memory an operator may want. A report ("folders with no registry entry") would be a separate feature.
- The server-side wake and startup paths load agents by registered ids and are unchanged.
