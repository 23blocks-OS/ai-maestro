# F037 - Let the SQL skill change data, but only with a person's approval

**Status:** Todo (design for review; nothing built)
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
2. **What it accepts.** One `INSERT` or one `UPDATE`, and an `UPDATE` must have a `WHERE`. No `DELETE`, no `TRUNCATE`, no schema changes, no functions that are not on the allow-list, no touching tables that are not on the write list. Values are passed to the database separately from the SQL (as in the read path), so a bad value cannot become a command.
3. **A dry run first.** The change runs inside a transaction, the system records how many rows it touched and the before and after of each, and then rolls everything back. Nothing is saved yet. If the number of rows is above a limit (default 25, set per table), it stops and says so.
4. **Approval.** The agent gets a request id, not the power to continue. A person sees a card in the AI Maestro chat (the same kind of card as the secrets request): the statement, the rows that would change, before and after, which database and which environment. They press Approve or Reject. The approval is tied to the exact statement and expires (for example in 10 minutes); changing one character needs a new approval. The agent cannot approve its own request.
5. **Run once.** On approval the wrapper repeats the dry-run check, runs the change, saves it, and prints the real row count. If the row count differs from the dry run, it rolls back instead of saving.
6. **A record.** Each request writes a line: who asked, which agent, the statement shape and parameter names (never the values), rows touched, who approved, when. Same rule as the read log: no personal data in the log.
7. **Staging by default.** Production needs an extra confirmation on the card (type the environment name). A read replica can never be written to, and the wrapper refuses it.

## What this does not protect against

- A wrong change that a person approves. The card makes the effect visible, which is the best defense, but it is still a person's decision.
- Triggers and side effects in the database that run on the dry run too (they roll back with it, but they can take locks or call out). The write list should only include tables whose triggers are known.
- A write login that is too broad. The setup instructions must say, in the same way the read role instructions do, how to create a login limited to listed tables and columns.

## Open questions for Juan

1. Should `DELETE` ever be possible? The safer pattern is "soft delete" (an `UPDATE` that sets a flag), which the design already allows. A hard delete would need its own, stricter rule.
2. Who may approve: only you, or any human operator? And does a request from agent A need approval from the person who owns agent A (links to per-agent scoping in F033)?
3. Should the card appear only in the AI Maestro chat, or also as a prompt inside Claude Code through the mod, as the secrets request does?
4. The default limit of 25 rows: right for your tables?
5. Do you want the support skill (`agentic-support`) to be able to propose a write directly, or only through `agentic-sql`? Recommended: only through `agentic-sql`, so there is one door.

## Work

1. Decide the open questions above.
2. Wrapper: `safe-psql-write` with the rules above, in the `agentic-sql` repo, with tests (every refused shape, the dry run, the row count mismatch, expiry, replay of an old approval, a write login in the read command and the reverse).
3. Approval endpoint and chat card in AI Maestro, modeled on the secret requests (`lib/secret-requests.ts`, `SecretRequestCard`). Headless router parity.
4. Skill text: when to propose a write, what to put in the request, how to read the dry run, never retry with a wider statement.
5. Role setup instructions for the write login, and a test against a throwaway Postgres like the read wrapper's.
6. Docs and the plugin release chain.

## Related

F033 (secret vault, source of the approval-card pattern and where the write login lives), F029 (route parity), `docs/AGENT-PROGRAMS.md` is unrelated. The read-only guarantee in `agentic-sql` 1.2.x is the baseline this must not weaken.
