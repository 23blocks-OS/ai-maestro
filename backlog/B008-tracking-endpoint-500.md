# B008 — GET /api/agents/:id/tracking returns 500 for every agent

**Status:** Done (v0.50.1)
**Type:** Bug
**Created:** 2026-10-05

## Description

`GET /api/agents/:id/tracking` answered every agent with
`500 "Failed to get tracking: Expression contains unevaluated constant"`.
The handler is `getTracking` in `services/agents-memory-service.ts`, which
calls `getAgentFullContext` and `getAgentWorkHistory` in `lib/cozo-schema.ts`.

Verified against a copy of a real agent database with cozo-node:

1. `getAgentFullContext` failed with `eval::not_constant`. Its last clause,
   `?[type, data] <- [['agent', agent], ...]`, put rule names inside a
   constant list. Cozo only accepts literal values there.
2. `getAgentWorkHistory` failed with `eval::named_field_not_found`. It wrote
   `count(claude_session_id)` in the rule body over a variable the body never
   bound. Aggregates belong in the rule head.
3. The `agents` relation these queries read does not exist in real databases
   (`query::relation_not_found`). The schema is from the first WorkTree design,
   and only `initializeTracking` (POST) creates it. Real databases do have
   `sessions` and `projects`, but from the simple schema
   (`lib/cozo-schema-simple.ts`) with different columns, and POST skips a
   relation that already exists.
4. The only caller, `components/AgentGraph.tsx` (`detectProjectPath`), reads
   `data.projects`. The endpoint returned `{context, history}`, so the call has
   never matched its shape; it swallowed the failure.

Not a regression of 0.49.9 to 0.50.0.

## Why It's Needed

A 500 on every agent is noise in the logs and hides real failures, and the
graph view never found the project path it was asking for.

## Business Case

Small fix, removes a permanent error and makes the code graph's project
detection work.

## Implementation Plan (done)

- `getAgentFullContext` runs four separate queries (agent, current session,
  all sessions, all projects) and returns them as one object.
- `getAgentWorkHistory` counts Claude sessions in a rule head, keeps sessions
  with no Claude sessions (count 0) and with no matching project (null name).
- `hasTrackingSchema` checks every tracking relation exists with the columns
  the queries read. When it does not, GET returns 200 with
  `{success: true, agent_id, initialized: false, context: null, history: [], projects}`.
- GET always carries a top-level `projects` array, newest first, read from
  the `projects` relation in either schema (tracking schema filtered by
  agent_id, simple schema as is), or `[]` when there is none.
- POST `initializeTracking` is unchanged.
- Tests: `tests/tracking-endpoint.test.ts` runs the real queries against an
  in-memory Cozo database.
