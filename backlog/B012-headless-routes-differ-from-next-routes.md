# B012 - Headless routes behave differently from the Next.js routes

**Status:** Done (0.62.0; open: headless agent file upload)
**Type:** Bug
**Created:** 2026-10-07
**Found by:** read-only audit comparing 221 route pairs (about 205 read side by side), 2026-10-07. Items 1 and 2 were re-read by hand; the rest are the auditor's reading and must be re-read before fixing.

None of our hosts run headless (checked 2026-10-07: mac-mini runs full mode, `MAESTRO_MODE` unset; see the memory note). These bugs affect people who run `yarn headless`. Related: #539, fixed in 0.60.3 (two instances of the same mistake), which is why the audit was done.

## Breaks the endpoint
1. `POST /api/hosts`: headless calls `addNewHost(body)` (`services/headless-router.ts` about line 1228); the service wants `{host, syncEnabled}`, so adding a host fails and `?sync=false` is dropped (verified).
2. `PATCH /api/sessions/:id/rename`: headless reads `body.name`, Next reads `body.newName` (verified).
3. `GET /api/agents/:id/graph/query`: Next maps `?q=` to `queryType`; headless passes the raw query, so every call fails.
4. `DELETE /api/sessions/restore`: headless registers `DELETE /api/sessions/([^/]+)` first, so `restore` runs `deleteSession('restore')`.
5. `PUT /api/agents/:id/skills/settings`: Next passes `body.settings`; headless passes the whole body, nesting the settings one level too deep.
6. `DELETE /api/agents/:id/graph/code`: Next reads `?project=`, headless `?projectPath=`.
7. `POST /api/conversations/parse`: Next reads `body.conversationFile`, headless `body.filePath`.
8. `POST /api/agents/:id/memory/consolidate`: Next reads query params `dryRun`, `provider`, `maxConversations`; headless reads the body, so `?dryRun=true` runs for real.
9. `POST /api/agents/:id/index-delta`: same, `dryRun` and `batchSize`; a dry run really indexes.
10. `GET /api/agents/:id/search`: Next reads `?role=` and `?conversation_file=`; headless `roleFilter` and `conversationFile`.

## Drops an option or changes a default
11. `POST /api/agents/:id/heartbeat`: headless omits `claudeSessionId`, so session-id capture never happens.
12. `POST /api/agents/:id/wake` and `/hibernate`: Next lowercases the program, type-checks the body and proxies to the remote host when the agent lives elsewhere; headless does none of that and acts locally.
13. `GET /api/agents/:id/graph/code`, `graph/db`, `docs`: Next defaults `action` to `stats` and parses `depth` and `limit` to numbers; headless passes strings and no default.
14. `GET /api/marketplace/skills`: `includeContent` arrives as a string, so `false` is truthy.
15. `DELETE /api/agents/:id/skills`: `?type=` dropped.
16. `GET /api/sessions/:id/command` (deprecated): headless omits `success:true`.

## Routes missing on headless (checked by running a headless server, 2026-10-07: 404)
`GET /api/messages/pending-wakes`, `POST /api/telemetry/v1/logs` and `/metrics`; by the audit's reading also `POST /api/agents/:id/files`, `GET` and `POST /api/agents/:id/schedule`, `POST /api/debug/client-event`, and the AMP attachment routes (`/api/v1/attachments/...`).

## Cosmetic or latent
Invalid JSON gives a generic 500 on headless where Next gives 400 on several v1 routes; path params are not URL-decoded in the headless router; `email-index` reads the federated flag from the query string instead of a header; `DELETE /api/agents/:id/repos` passes an empty url instead of a 400.

## Plan
Do not fix route by route. Put both routers behind one route manifest (method, path, parameter source, service, argument mapping) and generate or verify both from it; add a test that fails when the two disagree (see F029). Then fix the list above through that.
