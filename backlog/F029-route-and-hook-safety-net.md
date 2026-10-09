# F029 - A test safety net for routes, headless mode and the hook

**Status:** Done (0.62.0; coverage reporting not done, needs a dev dependency)
**Type:** Feature (test infrastructure)
**Created:** 2026-10-07
**Requested by:** Juan, 2026-10-07 ("why are the tests not getting those errors?")

## Why the tests missed #539, #551 and B009-B012 (measured 2026-10-07)

- Before 2026-10-07 no test imported `services/headless-router.ts` (about 220 routes).
- Only 8 test files touch any of the 145 `app/api` route files; 15 of 39 service files are referenced by any test. The suite tests library functions, not the HTTP layer.
- There is no coverage configuration, so the blind spots are invisible.
- Tests use made-up inputs against mocks (the tracking tests used invented agent ids, which is how B009 hid).
- The hook is tested by its pure helpers, never by a replayed event sequence with the status checked after each step.
- CI runs lint, vitest and the installer scripts. It never boots a server.

## Work

1. **Route manifest test.** One table of routes shared by the Next routes and the headless router (or a test that parses both), failing when a pair differs in method, path, parameter source or arguments.
2. **Headless smoke test in CI.** Boot `server.mjs` with `MAESTRO_MODE=headless` on a temporary `HOME` and call every route with an empty and a hostile payload; assert no 500s and no files outside the temporary directory.
3. **Coverage report** with vitest v8 in CI, a floor on `services/` and `app/api/`, and the report attached to the PR.
4. **Hook event-replay tests.** Captured sequences (Claude, Codex, Grok) replayed through the hook with the state asserted after each event. The Grok captures are in `tests/fixtures/grok`.
5. **Hostile-id tests** for every value that becomes a path, a tmux name or a shell argument; extend the B009 "every service checks the id" scan to routes and lib writers.
6. **Argument-level assertions** instead of response-only assertions where a route hands arguments to a service (pattern in `tests/headless-router-args.test.ts`).

## Order

Do items 4 and 5 with the B011 and B010 fixes, items 1 and 2 with B012.
