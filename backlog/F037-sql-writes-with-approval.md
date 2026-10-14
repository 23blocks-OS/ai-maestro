# F037 - Let the SQL skill change data, but only with a person's approval

**Status:** In Progress (the write door and terminal approval shipped in agentic-sql 1.3.0 / plugin 1.8.0 / AI Maestro 0.68.0; the AI Maestro card, the Claude Code mod and the support hand-off are open)
**Type:** Feature (extends the agentic-sql skill and its `safe-psql` wrapper)
**Created:** 2026-10-12
**Requested by:** Juan, 2026-10-12 ("sometimes the SQL queries will actually update and write data, is that considered, and still possible?")

## Where we are today

The `agentic-sql` skill is read-only on purpose. Three things enforce it: the database login can only `SELECT`; the wrapper (`safe-psql`) refuses anything that is not one plain `SELECT`; and it refuses to run at all if the login could write. So an agent cannot change data through the skill, however it phrases the request. That is the guarantee, and it must not weaken.

Real support work sometimes needs a change: "set this customer's plan back to Pro", "fix this wrong email", "mark these 40 rows as reviewed". Today a person does those by hand, or an agent is given a general database login with no checks. The second is the dangerous one, and it is what people do when the safe path has no way to write.

## The idea in plain words

Add a second, separate door for writes, with a person standing at it.

- The read door stays exactly as it is.
- The write door uses a different database login that can change only the tables you list, never everything.
- The agent never decides to write by itself. It proposes one change. The system shows exactly what would happen. A person approves that exact change. Only then does it run.

## How it would work

1. **A separate command and a separate login.** `safe-psql-write`, with its own connection variable (for example `ACME_WRITE_DATABASE_URL`, kept in the secret vault, F033). The read command refuses to use a write login and the write command refuses to use a read login, so they cannot be mixed up.
2. **What it accepts.** One `INSERT` or one `UPDATE`, and an `UPDATE` must have a `WHERE`. A `DELETE` is accepted **only if the person who set the skill up turned hard delete on** (it is off by default, see Settings below), and then it also needs a `WHERE`, the same row cap and the same approval. Never `TRUNCATE`, schema changes, functions that are not on the allow-list, or tables that are not on the write list. Values are passed to the database separately from the SQL (as in the read path), so a bad value cannot become a command.
3. **A dry run first.** The change runs inside a transaction, the system records how many rows it touched and the before and after of each, and then rolls everything back. Nothing is saved yet. If the number of rows is above a limit (default 25, set per table), it stops and says so.
4. **Approval, through whichever door the person has.** The agent gets a request id, not the power to continue. Only a person can approve, and what they see is the same everywhere: the statement, the rows that would change (before and after), which database and environment, how many rows. The approval is tied to the exact statement and expires (10 minutes by default); changing one character needs a new request. Three ways to approve, so the skill works with or without AI Maestro:
   - **a. In the terminal, anywhere (the base, needs nothing else).** `safe-psql-write approve <id>` shows the dry run and asks the person to type the environment name. It reads the answer from the real terminal (`/dev/tty`), not from the pipe the agent's commands use, so an agent running a command cannot answer for the person. With no terminal available it refuses and says "run this yourself in a terminal". This is the path for people using Claude Code, Codex or any other agent on their own.
   - **b. A card in the AI Maestro chat**, when AI Maestro is present (the same kind of card as the secrets request).
   - **c. A card inside Claude Code** through a Claude Code mod shipped with the skill, like the secrets mod, so the person never leaves the session. It needs a Claude Code version that supports mods; if it is absent, (a) still works.
   Any person with access to the terminal, the AI Maestro chat or the Claude Code session may approve; it does not have to be the owner. The agent never approves its own request.
5. **Run once.** On approval the wrapper repeats the dry-run check, runs the change, saves it, and prints the real row count. If the row count differs from the dry run, it rolls back instead of saving.
6. **A record.** Each request writes a line: who asked, which agent, the statement shape and parameter names (never the values), rows touched, who approved, when. Same rule as the read log: no personal data in the log.
7. **Staging by default.** Production needs an extra confirmation on the card (type the environment name). A read replica can never be written to, and the wrapper refuses it.

## What this does not protect against

- A wrong change that a person approves. The card makes the effect visible, which is the best defense, but it is still a person's decision.
- Triggers and side effects in the database that run on the dry run too (they roll back with it, but they can take locks or call out). The write list should only include tables whose triggers are known.
- A write login that is too broad. The setup instructions must say, in the same way the read role instructions do, how to create a login limited to listed tables and columns.

## Decisions (Juan, 2026-10-12)

1. **Hard delete is a setting, off by default.** Whoever sets the skill up chooses. Soft delete (an `UPDATE` that sets a flag) works without turning it on.
2. **Any person can approve**, not only the owner. The agent cannot approve its own request.
3. **Approval cards also appear in Claude Code** (a mod), as well as in AI Maestro.
4. **The skills must work without AI Maestro**, because many people use them without it. So the base approval is the terminal one (4a); AI Maestro and the Claude Code mod are nicer doors to the same approval.
5. **The default row limit stays at 25**, settable per table.
6. **The support skill only writes through `agentic-sql`.** One door. `agentic-support` hands the proposed change over and never holds a write login.

## Settings (one file in the project, for example `.safe-psql/write.yaml`)

```yaml
allow_hard_delete: false          # global switch; default false
default_max_rows: 25
approval_ttl_minutes: 10
environments:                      # production needs the extra confirmation
  production: { confirm_by_typing: true }
tables:
  customers: { insert: true, update: [plan, email], delete: false, max_rows: 25 }
  notes:     { insert: true, update: true,          delete: true,  max_rows: 100 }   # delete works only if allow_hard_delete is true
```

A table or column that is not listed cannot be written. `delete: true` on a table does nothing unless the global switch is also on, so one line cannot turn deletion on by accident.

## What this protects, honestly

The approval stops an agent that tries the sanctioned path (including one steered by text in a customer report) from changing data without a person. It does not stop someone who deliberately works around the tool on the same machine, because the agent and the person share one user account. The same limit applies to the secret vault (F033). The database login's own limits (listed tables and columns only) are the real backstop.

## Work

1. (Done) Decide the open questions; see Decisions.
2. Wrapper: `safe-psql-write` with the rules above, in the `agentic-sql` repo, with tests (every refused shape, the dry run, the row count mismatch, expiry, replay of an old approval, a write login in the read command and the reverse).
3. Approval endpoint and chat card in AI Maestro, modeled on the secret requests (`lib/secret-requests.ts`, `SecretRequestCard`). Headless router parity.
4. Skill text: when to propose a write, what to put in the request, how to read the dry run, never retry with a wider statement.
5. The Claude Code mod for the approval card, and the AI Maestro card, both calling the same approval step as the terminal one.
6. Role setup instructions for the write login, and a test against a throwaway Postgres like the read wrapper's.
7. `agentic-support`: hand a proposed change to `agentic-sql`; remove any idea of holding a write login.
8. Docs and the plugin release chain.

## Related

F033 (secret vault, source of the approval-card pattern and where the write login lives), F029 (route parity), `docs/AGENT-PROGRAMS.md` is unrelated. The read-only guarantee in `agentic-sql` 1.2.x is the baseline this must not weaken.

## Progress

- 2026-10-12: **Shipped** in agentic-sql 1.3.0: `safe-psql-write` (propose, approve, apply, reject, status, list), the settings file (`examples/write.example.yaml`), terminal approval on the real terminal (refused for piped input and inside agent sessions), dry run rolled back, row-count check on apply, request tied to the exact statement, expiry, a log without values, sanitised approval screen, and a refusal of any login that can write unlisted tables (the read door now refuses any login that can write). 62 tests, including approval through a pseudo-terminal. Plugin 1.8.0; the AI Maestro installer puts `safe-psql-write` on the PATH (0.68.0).
- A bug found while reviewing: the read door sent a literal `%` as `%%` when a query had no parameters. Fixed in the same release.
- **Open:** the AI Maestro chat approval card (modeled on the secret requests, headless parity), the Claude Code approval mod, the `agentic-support` hand-off text, and a live test of a write against a real staging database.
- 2026-10-14: **The AI Maestro card shipped in 0.79.0** (desktop and phone chat, API with headless parity). Approval is accepted from a real browser page plus the typed environment name; see the changelog for the honest limit. Fixtures taken from the real wrapper. **Open:** the Claude Code approval mod, the skill text (`docs/F037-agentic-sql-card-handoff.md` is the brief), the `agentic-support` hand-off, and a live test of a write against a real staging database.
