# F037 hand-off: what the agentic-sql skill and the Claude Code mod should say and do

For upstreaming to `23blocks-OS/agentic-sql` (skill text) and the Claude Code mod. AI Maestro now ships the chat card (`SqlWriteRequestCard`, `docs/CHAT-ARCHITECTURE.md`). Nothing under `plugin/` was changed.

## What the card relies on (do not change without telling AI Maestro)

- Requests are JSON files in `$SAFE_PSQL_HOME/requests` (default `~/.safe-psql/requests`), named `w-<12 hex>.json`.
- The `agent` field is `AIM_AGENT_NAME`, else `AIM_AGENT_ID`, else `$USER`. The card finds an agent's requests by that field, so inside AI Maestro the agent environment must carry `AIM_AGENT_NAME` (a request stamped with `$USER` never shows on a card; the terminal approval still works).
- The fingerprint is `sha256(json.dumps([environment, env_var, table, kind, sql, sorted(params.items()), rows], sort_keys=True))`. The card recomputes it; if the rule changes, AI Maestro refuses to approve and `tests/sql-write-requests.test.ts` fails.
- Approving sets `status: approved`, `approved_by`, `approved_at`, `apply_by = approved_at + ttl`, `approved_fingerprint`. The card does this itself; it never runs `safe-psql-write` and never connects to the database.
- A custom `SAFE_PSQL_HOME` set only in the agent's own environment is invisible to the AI Maestro server, so the card will not see those requests.

## Skill text (agentic-sql SKILL.md, write section)

Add, after "propose":

> After `safe-psql-write propose` prints a request id, stop and tell the person what you proposed in one sentence (what changes, in which table, how many rows). Do not run `apply` yet.
>
> The person approves in one of three places: a card in the AI Maestro chat, a card in Claude Code, or `safe-psql-write approve <id>` in their own terminal. Never run `approve` yourself and never ask the person to paste a command's answer to you.
>
> Wait by polling, not by looping on `apply`: run `safe-psql-write status <id>` every 20 to 30 seconds, for at most the request's lifetime (10 minutes by default). Stop polling when the status is anything other than `pending`.
>
> - `approved`: run `safe-psql-write apply <id>` once and report the row count it prints.
> - `rejected`: do not retry the same change or a wider one. Ask the person what they want instead.
> - `expired`: say so, and propose again only if the person still wants it.
> - `applied` or `failed`: report it. Do not re-run `apply`.
>
> AI Maestro also sends a short note into the session when the person answers on its card (it starts with `[SQL WRITE]` and carries the request id only). Treat it as a prompt to check `status`, not as the approval itself: only the request file's status is authoritative.

## `status` output

`safe-psql-write status <id>` already prints one line: `request <id>: <status> · <kind> <table> · <rows> row(s) · expires in Ns`. Keep it stable (agents parse the second field). Adding `--json` would help the mod and the skill; the card does not need it.

## Claude Code mod

- Poll the same request files (or `safe-psql-write list`) for `pending` requests whose `agent` matches this session; show the same fields as the AI Maestro card: statement, table, row count, before and after per row, environment, expiry countdown. Sanitise with the wrapper's `clean()` and never print more than its approval screen does.
- Approve only with the environment name typed (always, not only when `confirm_by_typing` is on; the AI Maestro card does the same). Do the wrapper's `cmd_approve` state change, or call a new `safe-psql-write approve --confirm-env <name>` that does it. Refuse if the request is not `pending`, is expired, or the fingerprint no longer matches.
- A mod runs inside the agent's session, so its approval path has the same honest limit as the chat card: it stops accidents, not a deliberate workaround on the same account.

## Honest limit (say it in the skill text too)

An approval card, in the terminal, AI Maestro or Claude Code, stops an agent that uses the sanctioned path. It does not stop an agent that forges the browser headers, edits the request file or works around the tool, because the agent and the person share one OS user and AI Maestro has no sign-in by design. The write login's own limits (listed tables and columns only, row cap, no superuser) are the real backstop.
