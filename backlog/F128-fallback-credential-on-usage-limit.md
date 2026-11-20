# F128 — Switch to a fallback credential when a session hits its usage limit

**Status:** Done (0.106.241)
**Type:** Feature
**Created:** 2026-11-19

## Description

When a Claude Code session reaches its account's usage limit, AI Maestro sees it and moves that agent (or its crew) to the next credential profile in a configured fallback list, then restarts the agents that are idle. Agents that are working stay where they are; the credential check shows them as `mismatch` until they restart (0.106.237).

Proposed setting, from the field: `credential.fallback = [<profile>, ...]` on the agent record, plus a crew-level default.

## Why It's Needed

Field report, 2026-11-18/19: eleven agents on one subscription token hit the account's usage window twice in five hours. The whole crew, its GM included, stopped for 28 minutes and then for three hours. Today the switch is done by hand (or by a 15-minute schedule as a stopgap).

## Business Case

- Reliability: a crew that shares one account stops at once; a fallback keeps it working.
- Less operator load: no manual rotation at night.

## Implementation Plan

- Detection: the pane line Claude Code prints when the limit is reached (read from the pane, the same way as permission prompts), or rate-limit headers where a gateway exposes them. Find which is reliable before building.
- Real samples so far (2026-11-19, Claude Code 2.1.328, a subscription token):
  - `claude -p` reply, exit code 1: `You've hit your monthly spend limit · raise it at https://claude.ai/settings/usage?from=cc_cli_limit_message · your 5-hour limit resets 8:20am (America/Denver)`. One line names two limits: the monthly spend limit and the 5-hour window.
  - Inside a running session, as the model saw it: `Usage limit reached; a short grace allowance remains, then this turn is cut off without warning.` This is text in the conversation, not necessarily the pane line; the pane line is still to capture.
  - A field watcher matched the first with `usage limit|hit your limit|limit reached|resets? (at )?[0-9]|rate.?limit|429` and moved 11 agents to the fallback token; all 11 read `match` after restart (the 0.106.237 check).
- Open: the reset time is in the text ("resets 8:20am (America/Denver)"), so a switch back can be scheduled from it.
- `lib/agent-credential.ts`: `fallback` list in `parseCredential` (vault names only, same checks as `secret`).
- The switch reuses the existing `credential switch` path, with `--restart` for idle agents only.
- Record each automatic switch in the agent's log so the operator sees why it moved.
- Open: when to move back (the window resets), and whether a crew moves together or agent by agent.
- Effort: M.

## As built (0.106.241)

- **Only the agent's own credentials.** `credential.fallback` is a list of up to 5 vault names on the agent (oauth-token, api-key or gateway). On a limit the agent moves to the first entry that exists in the vault and is not itself at its limit, never to anything else: no other agent's token, no crew pool, never the host's own login. The used name goes to the end of the list, so the set of names never changes. With nothing free the agent waits and the server log says so.
- **Granting is governed.** A change that adds a vault name to an agent (its credential or its list) is the governance action `secret.grant` (F118), so a rule can deny it or ask a manager. The automatic move between listed names is AI Maestro's own action and needs no approval.
- **Signal.** The line Claude Code writes into the conversation file: `{"type":"system","subtype":"informational","content":"Usage limit reached · continuing automatically at 5:20pm · esc to cancel"}` (and "... again"), cleared by "Usage limit reset". Found in field transcripts: 871 such lines. The reset time comes from the text; without one, 5 hours.
- **Watcher.** `services/credential-fallback-service.ts`, once a minute, on the agent's host, for agents with a list and a running terminal. It acts only on a limit newer than the agent's last move (`credentialSwitch`, shown as `lastSwitch` on `GET /api/agents/:id/credential`), restarts the agent in the same conversation (`restartAgentResuming`) and, 20 s later, tells it in the chat to continue.
- **CLI.** `--fallback A,B` on `create`, `update` and `credential switch` (plugin 1.19.23).
- **Not built:** a crew default (set the list on each agent, for example with `credential switch --crew ... --fallback ...`); moving back to the first credential when its window opens (the list rotates instead); gateway rate-limit headers; editing the list in the dashboard.

