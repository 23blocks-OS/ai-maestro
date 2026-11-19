# F118 - Governance actions and approvals through the policy engine

**Status:** In Progress (spec: `docs/SPEC-POLICY-RULES.md`, sections 3, 4.3 and 11). Step 1 (version 2 rules, F042 phases 2a and 2b) shipped in 0.106.229. Step 2 (ask with approvals, phase 4) shipped in 0.106.230 (spec section 17). Next: step 3, governance actions.
**Type:** Feature
**Created:** 2026-11-18

## Description

Use the F042 rules engine for governance, not only for messages and calls:

- **Governance actions** are actions that change what an agent is or may do: `agent.create`, `agent.delete`, `agent.move`, `agent.mode` (a higher permission mode), `agent.config` (its `CLAUDE.md` and settings), `secret.use`, `secret.grant`, `sql.write` and `policy.edit`.
- **A third effect, ask.** A rule can say that an action needs a person's approval. The order is deny, then ask, then allow, as in Claude Code's permission rules.
- **Approvers** are named in the rule: the target agent's manager (`rel:manager`), its owner, a person, a role or an organization. An approval can require a signature from a paired phone (`"proof": "signed"`).
- **One request store** for approvals. The secret requests (F033) and SQL writes (F037) become kinds of it. Expiry and escalation come from F067.
- **Layers:** organization, host and agent (the F067 profile). Deny wins across layers, so a host or an agent cannot open what the organization closed.
- Every ask, answer and expiry goes to the policy decision log and to the audit trail (F066).

## Why It's Needed

- Each approval card has its own rule today: F037 lets any person approve, F065 plans the manager, F067 plans phone signatures. Nothing says in one place who may approve what.
- Team types declare `closed` and a chief of staff, and nothing enforces them.
- F067 needs a place to say "this action needs approval" that works on every host and survives an agent moving between hosts.

## Business Case

- Governed autonomy (the agent works alone inside its job, and a person approves anything outside it) is what lets a company give agents real access. It is the main argument for teams and enterprise use (F067).
- It reuses the F042 engine, the existing approval cards, person device keys (AMP spec 13), `call-a-person` and the audit trail. No second rules language.

## Implementation Plan

See `docs/SPEC-POLICY-RULES.md` section 13. In short:

1. **Version 2 rules (M, F042 phases 2a and 2b), done in 0.106.229:** deny, ask, allow; `except`; no order; version 1 files compiled at load (a property test proves the same decisions); rule ids; the decision log; audit mode; lint; tests in the file; a broken file keeps the last version that loaded. In this step an `ask` is refused at every send path with "needs approval (approvals arrive in F118 step 2)". Not built yet: `when`, `org:`, `role:` and `rel:` subjects (they come with governance actions), the converter for version 1 files, the what-if replay.
2. **Ask with approvals (M, phase 4), done in 0.106.230:** one request store per host, held messages delivered once on approval, calls refused with a request, approvers (`rel:manager`, `rel:owner`, `person:`, `agent:`), signed proof (server side; the app does not sign yet), expiry with a push to the approvers, answers once / for a time / always, Settings > Approvals. Not built: escalation by call and to the coordinator, `role:` and `org:` approvers, moving F033 and F037 into the store (plan in spec 17.6).
3. **Governance actions (L, phase 5):** checks at each place that does the action, on the agent's host; the agent layer from F067 profiles; closed teams as rules.
4. **Organization layer on every host (M, phase 6):** copied like the audit setting, hashes shown, Doctor drift check.

**Limits to state plainly:** no login, so an approval from the dashboard is "an unverified person" unless the rule asks for a signed one. Agents on one host run as the same OS user (B021).

**Related:** F042, F043, F065, F066, F067, F074, F037, F033, B021.
