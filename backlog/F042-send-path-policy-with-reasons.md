# F042 - Who may message whom: a policy checked on every send, with a reason on every denial

**Status:** Todo (idea from reading lolad; not designed here)
**Type:** Feature
**Created:** 2026-10-27
**Source:** `CamiloCaceres/lolad`, `SPEC.md` and `internal/policy` (read 2026-10-27 by a reviewer; not run).

## The idea

lolad keeps teams, heads and ordered rules in one file (`org.yaml`). Every message, from the user, an agent or a trigger, goes through one provider that checks the rules first. A denied message is refused with a plain reason, the denial is logged, and the dashboard shows a Traffic page and a who-can-message-whom matrix. `lolad org check <from> <to>` answers "why not". First matching rule wins; then user defaults, vertical links (a head and their members), open teams, independents.

## For AI Maestro

Teams exist here, and AMP delivery is open between any two agents the sender can address. Before any design: find out what we enforce today (team membership, hosts, governance) and what an agent can reach. Then decide whether a send-path policy is wanted at all (the fleet trusts its network by design), and if so keep it opt-in.

Parts worth taking even without enforcement: a refusal always carries a reason an agent can read (see B006, refusals leave no readable record), and a "why can't A reach B" check.

## Decisions to make

- Whether enforcement is wanted, or only explanation.
- Where rules live (team record, a file) and who may edit them.
