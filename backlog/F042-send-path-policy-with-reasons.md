# F042 - Who may message whom: a policy checked on every send, with a reason on every denial

**Status:** In Progress (phase 1 shipped in 0.106.222: rules file, one check on every send path, "why" API. Phases 2a and 2b shipped in 0.106.229 as F118 step 1: version 2 rules with deny, ask and allow, rule ids, decision log, audit mode, lint, tests in the file. No editor yet)
**Type:** Feature
**Created:** 2026-10-27
**Source:** `CamiloCaceres/lolad`, `SPEC.md` and `internal/policy` (read 2026-10-27 by a reviewer; not run).
**Next (spec):** `docs/SPEC-POLICY-RULES.md` (2026-11-18): phase 2 and later, the decision model (deny, ask, allow; no order; phase 1 files compiled at load), decision log, audit mode, tests, layers across hosts, and governance (F118).

## The idea

lolad keeps teams, heads and ordered rules in one file (`org.yaml`). Every message, from the user, an agent or a trigger, goes through one provider that checks the rules first. A denied message is refused with a plain reason, the denial is logged, and the dashboard shows a Traffic page and a who-can-message-whom matrix. `lolad org check <from> <to>` answers "why not". First matching rule wins; then user defaults, vertical links (a head and their members), open teams, independents.

## For AI Maestro

Teams exist here, and AMP delivery is open between any two agents the sender can address. Before any design: find out what we enforce today (team membership, hosts, governance) and what an agent can reach. Then decide whether a send-path policy is wanted at all (the fleet trusts its network by design), and if so keep it opt-in.

Parts worth taking even without enforcement: a refusal always carries a reason an agent can read (see B006, refusals leave no readable record), and a "why can't A reach B" check.

## Decisions to make

- Whether enforcement is wanted, or only explanation.
- Where rules live (team record, a file) and who may edit them.

## Phase 1 (0.106.222)

Reread lolad at its 2026-11-12 HEAD (`2649a3f`); `internal/policy` has not changed since our first read except a test fix. What we built:

- **One module.** `lib/policy.ts` (rules, validation, evaluation; pure) and `lib/policy-check.ts` (`checkPolicy(from, to, action)` with this host's file, registry and teams). Rules go in order, first match wins, and no match allows. No file means no rules, which is the behaviour before F042.
- **Rules file per host:** `~/.aimaestro/policy.json`, `{ "rules": [ { "from", "to", "allow", "both"?, "action"?: "message" | "call", "note"? } ] }`. Patterns: `*`, `person:*`, `agent:*`, `person:<id>`, `agent:<name or id>`, `agent:<name>@<host>`, `team:<name or id>`, `host:<id>`. A file that does not parse or validate applies no rules and reports the error (`GET /api/policy`, log).
- **Where it is checked:** `/api/v1/route` (agents, people, mesh forwards; before a person's mailbox and before an agent's delivery or forward), federation delivery, `sendFromUI` and `forwardFromUI` (`/api/messages`, `/api/agents/:id/messages`, meetings, device input), the chat (`server.mjs` `sendChatMessage`, also reactions and typed answers), the REST chat and the companion (`services/agents-chat-service.ts`), device input (`lib/device-events.ts`, before the speaking side), and `POST /api/calls` (action `call`).
- **Across hosts:** each host enforces its own file on the traffic it handles. The sender's host checks before sending; the recipient's host checks before delivering, and its 403 `policy_denied` comes back to the sender unchanged (it used to be queued for a retry). So a rule about who may reach an agent goes on the agent's host, which sees every message to it.
- **Why:** `GET /api/policy/check?from=&to=[&action=call]` asks this host and the sender's and recipient's hosts (`localOnly=1` between hosts, so they never loop).

### What we took from lolad, and what we changed

- Taken: ordered rules, first match wins, a reason on every decision, the denial recorded (our `amp-refusals.jsonl`), a "check" answer, a system sender that always passes.
- Changed: lolad has one user and fixed defaults (user to agents, vertical links, open teams, independents), and its default between agents in different teams is deny. We have many people and an open default; a last `* -> *` deny rule makes it closed, so there is no second defaults language. lolad drops the domain from every name (`dev@a` and `dev@b` are one participant); we keep the host (`agent:dev@host-b`). lolad has one daemon; we have several hosts, each with its own file. lolad's reason is a rule index; ours also names the host, the sender and the recipient.
- Not taken (yet): the who-can-message-whom matrix and the Traffic page; editing rules from the UI; heads and vertical links.

### Known limits

- The dashboard has no login, so its chat and composer send as "an unidentified person": rules for `person:<id>` cannot apply there, only `person:*` and `*`. The phone app's AMP messages are signed, so they carry the person.
- Agents read a refusal through `amp-send.sh`, which prints the `error` code (`policy_denied`) and not the `message`. The fix is one line upstream (`agentmessaging/claude-plugin`: prefer `.message`); until then the reason is in the 403 body, the refusals log and `/api/policy/check`.
- A refused device input is dropped with its reason in the log; the person at the device hears nothing.

## Next: what an agent may do

No backlog item covers per-agent allowed actions toward other parties (F067 governs tools, folders and commands inside the agent). Proposal: grow the `action` field here instead of a new system: `device` (use one of its devices), `wake` (wake another agent), `task` (put a card on another agent's board), each checked at the one place that does it. Then the matrix view and a rule editor in Settings.
