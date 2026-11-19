# Spec: policy rules and governance

**Status:** Phase 1 is PR #113 (F042, 0.106.222). Phases 2a and 2b shipped in 0.106.229 (F118 step 1), with the recommendations of section 14 for questions 1, 2, 3 and 9; section 16 says what was built and what was left out. Phase 4 (approvals for `ask`) shipped in 0.106.230 (F118 step 2), with the recommendations of section 14 for questions 4 and 7; section 17 says what was built, the signed-answer contract for the app, and the plan for moving F033 and F037 into the store. Phases 2c, 3, 5 and 6 are proposals. Backlog: F042 (who may reach whom), F118 (governance actions and approvals), F066 (audit trail), F067 (agent governance profiles), F043 (federation between people).
**Goal:** one small rules engine that answers two questions with a reason: "may A do this to B?" and "who must approve it?". The same engine serves messages and calls (F042), agent actions (device, wake, task) and governance (configuration changes, permission modes, secrets).

Examples use neutral names: the company Acme, the people Alice and Bob, the agents `payroll`, `dev` and `support`, the hosts `host-a` and `host-b`.

## 1. Goals and non-goals

**Goals**

1. Every decision has a reason that a person can read. "Why was this blocked?" has one answer, from every host that took part.
2. A person who is not a policy expert can read and edit the rules.
3. Rules from several places (the organization, the host, the agent) combine without surprises.
4. A change can be tried before it is enforced (audit mode), and tested (test cases in the file).
5. Files written for phase 1 keep working, with the same decisions.
6. Three effects: allow, deny and ask (a person approves first).

**Non-goals**

1. No login. The network is the trust boundary (CLAUDE.md). The rules are policy in a trusted network, not a defence against a hostile device on that network.
2. No general policy language (Rego, Cedar, XACML). The pattern language stays small, so that a person can read it and a tool can check it.
3. The engine does not decide tool calls inside an agent. Claude Code, Codex and others have their own permission rules. F067 writes those rules from the agent's profile. Our engine decides only what AI Maestro itself does: deliver, call, wake, change a setting.
4. No operating-system isolation between agents on one host (B021).

## 2. What we took from lolad, and what we changed

lolad (`CamiloCaceres/lolad`, Go, MIT, read at `2649a3f`, 2026-11-12) keeps teams and ordered rules in `org.yaml`. `internal/policy/policy.go` checks every send: the system sender passes, then the rules in order (first match wins, `both` matches the reverse), then fixed defaults (user to agents, agents to user, vertical head links, open teams, independents), then deny with "default: no path". Every send path calls this one check. A denial is a 403 with the reason and an event. The dashboard has a who-can-message-whom matrix and a test box. Federation holds the first message from an unknown remote sender until the user allows or blocks that sender.

| lolad | AI Maestro phase 1 (PR #113) | This spec |
|---|---|---|
| One check inside `Send`, on every path | Same: `checkPolicy` on every send path | Same, and one check for each new action at the place that does it |
| Ordered rules, first match wins | Same | Kept for version 1 files. Version 2 files: no order, deny wins (section 3) |
| Fixed defaults (vertical, open teams, independents); final default deny | Default allow; a last `* -> *` deny rule closes it | Default per file (`allow` or `deny`). Vertical links and closed teams become relations in rules (`rel:manager`, `rel:teammate`), not a second language |
| One user | Many people; `person:<id>` | Same, and roles and organizations as subjects |
| Names lose their domain (`dev@a` = `dev@b`) | `agent:dev@host-b` keeps the host | Same |
| Reason = rule index | Reason names the rule, the host and both parties | Rules have stable ids, so a reason survives edits |
| Denial event | `amp-refusals.jsonl` | One decision log per host (section 6) |
| Held mail from unknown remote senders | Not built (F043) | The `ask` effect on `message` holds a message until approval |
| Matrix and test box | `GET /api/policy/check` only | Matrix, editor, test cases, "why" panel (section 12) |

What we did not take: lolad's one-team-per-agent rule (our teams overlap), and its team tree (we have organizations, teams and manager links instead).

## 3. The decision model

### 3.1 What the research says

Section 15 has the sources. In short:

- **Ordered, first match wins** is the firewall model (iptables, nftables) and XACML's `first-applicable`. It is easy to explain ("rule 3 decided"). But the result depends on the order, a rule can hide a later rule without any warning (shadowing), and two rule lists cannot be joined without choosing an order. Studies of real firewall configurations found anomalies such as shadowing in every configuration they tested (Al-Shaer and Hamed).
- **Deny wins, no order** is the model of AWS IAM (an explicit deny overrides any allow), Google Cloud IAM deny policies (deny is checked first), Cedar (`forbid` overrides `permit`) and XACML `deny-overrides`. The result does not depend on the order of rules or files. So rules from many sources combine safely: a lower layer cannot open what a higher layer closed. Cedar shows that this model can be analysed by a tool, and its answer lists every policy that decided.
- **Allow only, no deny** is Kubernetes RBAC ("permissions are purely additive"). It is simple, but it cannot express "everyone except".
- **A third effect, ask.** Claude Code evaluates deny, then ask, then allow; the first match in that order decides, and "an allow rule can't carve an exception out of a deny rule". MCP says there SHOULD always be a human in the loop who can deny a tool call. OWASP LLM06 (Excessive Agency) recommends human approval for high-impact actions. Amazon Bedrock AgentCore Policy puts a Cedar check outside the agent, on every tool call.
- **Trying rules first.** Gatekeeper has `dryrun` and `warn`; Kubernetes admission policies have `Audit` and `Warn`; AgentCore has `LOG_ONLY` and `ENFORCE`. OPA writes a decision log with the input, the result and the policy revision, and has `opa test` for policy tests.

### 3.2 Recommendation

**Version 2 files use deny-wins with three effects, and the order of rules does not matter.**

1. If any rule that applies says `deny`, the answer is deny.
2. Otherwise, if any rule that applies says `ask`, the answer is ask (a person must approve).
3. Otherwise, if any rule that applies says `allow`, the answer is allow.
4. Otherwise the file's `default` decides (`allow` or `deny`; `allow` when it is not set).

An exception goes in the rule itself (`except`), not in a rule above it. "Nobody may message payroll, except the finance team" is one rule. This is how Google Cloud IAM writes exceptions (exception principals) and how Cedar writes them (`unless`).

**Why we change from phase 1:**

1. **Layers.** Governance needs rules from three places: the organization, the host and the agent's profile (F067). With deny-wins, the layers combine without an order. With first match, every layer needs a place in one list, and a person must know that place to read any rule.
2. **Ask.** A third effect needs a precedence. Deny, then ask, then allow is the order Claude Code users already know, and F067 writes Claude Code rules from the same profile. One mental model for both.
3. **Shadowing goes away.** An earlier rule cannot hide a later one. What is left (an allow that a deny always covers, a rule that matches nothing) is easy to find (section 8).
4. **Explanations get better.** The answer lists every deny rule that matched, on every host, not only the first.

**Cost:** a person who wants "everyone but Alice" writes an `except`, not two rules in order. The editor (section 12) writes the `except` for them.

### 3.3 Phase 1 files keep working

A file with no `version`, or `"version": 1`, keeps first-match semantics. At load, the engine compiles it into version 2 rules with the same decisions:

- Under first match, rule *i* with `allow: false` denies a request when it matches the request and no earlier allow rule matched. (An earlier deny rule that matched denies too, so it does not change the result.)
- So each version 1 deny rule becomes a version 2 deny rule whose `except` lists the earlier allow rules (with their `from`, `to`, `action` and `both`).
- Version 1 allow rules have no effect under the default allow. They are kept as allow rules for the "why" answer ("Allowed by rule 2").
- Compiled rules get the ids `rule-1`, `rule-2` and so on, so a reason still says "rule 3", as today.

A property test runs random rule lists and random requests through both evaluators and compares the results. The Doctor shows "This policy file uses version 1 (rules in order). Convert it?" and the converter writes the version 2 file with a backup. A person never has to convert.

There is one evaluator (version 2). Version 1 is only a load format.

### 3.4 Layers

| Layer | Where it lives | Who edits it | Moves with |
|---|---|---|---|
| Organization | `~/.aimaestro/policy/org.json`, copied to every host (section 10) | Whoever the `policy.edit` rules allow | The Town |
| Host | `~/.aimaestro/policy.json` (phase 1 path) | Same | The host |
| Agent | The agent's governance profile (F067), in the agent's folder | Same, with approval when F067 protects it | The agent (agents move between hosts) |

Each layer gives its own answer (deny, ask, allow or "no rule applies", then its default). The final answer is the strictest: deny if any layer denies, else ask if any layer asks, else allow. A layer with `"default": "deny"` therefore limits everything below it to what it allows. This is how AWS combines an identity policy with a service control policy: the action must be allowed by both.

Phase 1 has only the host layer. Nothing changes until another layer has a file.

## 4. The rule format (version 2)

```json
{
  "version": 2,
  "default": "allow",
  "rules": [
    {
      "id": "payroll-finance-only",
      "effect": "deny",
      "from": "*",
      "to": "agent:payroll",
      "actions": ["message", "call"],
      "except": [{ "from": "team:finance" }, { "from": "person:alice" }],
      "note": "Payroll answers the finance team only"
    },
    {
      "id": "wake-needs-manager",
      "effect": "ask",
      "from": "agent:*",
      "to": "agent:*",
      "actions": ["wake"],
      "except": [{ "from": "rel:manager" }],
      "approvers": ["rel:manager"],
      "note": "An agent may wake another agent only with that agent's manager's approval"
    },
    {
      "id": "no-full-autonomy",
      "effect": "ask",
      "from": "*",
      "to": "org:acme",
      "actions": ["agent.mode"],
      "when": { "mode": "fullAutonomy" },
      "approvers": ["rel:manager"],
      "proof": "signed",
      "mode": "audit",
      "note": "Full autonomy at Acme needs the manager's signed approval"
    }
  ],
  "tests": [
    { "from": "person:bob", "to": "agent:payroll", "action": "message", "expect": "deny" },
    { "from": "agent:dev@host-a", "to": "agent:payroll@host-b", "action": "message", "expect": "deny" },
    { "from": "person:alice", "to": "agent:payroll", "action": "call", "expect": "allow" }
  ]
}
```

### 4.1 Fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable name, `[a-z0-9-]`, unique in the file. Reasons and logs use it. |
| `effect` | yes | `allow`, `deny` or `ask`. |
| `from`, `to` | yes | A subject pattern (4.2). One pattern or a list (any of them). |
| `actions` | no | A list of actions (4.3). Every action when left out. |
| `both` | no | Also match the reverse direction (phase 1, from lolad). |
| `except` | no | A list of `{ from?, to?, actions?, both? }`. The rule does not apply when one entry matches. A field left out matches everything. |
| `when` | no | Conditions on the request details, one level, equality only (for example `{ "mode": "fullAutonomy" }`). |
| `approvers` | for `ask` | Who may approve (section 11). |
| `proof` | no | `any` (default) or `signed`: the approval must be signed on a paired device (AMP spec 13). |
| `expires` | no, on `ask` | How long the request waits for an answer: `30m`, `2h`, `1d`. 30 minutes when left out (section 17.5). |
| `mode` | no | `enforce` (default) or `audit`: log what the rule would do, do not apply it (section 7). |
| `note` | no | Plain text, up to 300 characters, shown in the reason. |

The file can also have `"mode": "audit"` at the top, for every rule.

### 4.2 Subjects

| Pattern | Matches |
|---|---|
| `*` | Every person and every agent. Never AI Maestro itself, which always passes (as in lolad and phase 1). |
| `person:*`, `person:<id>` | People; one person by directory id. A person the host cannot name (the dashboard today) matches only `person:*` and `*`. |
| `agent:*`, `agent:<name or id>`, `agent:<name>@<host>` | Agents; one agent on any host; one agent on one host. |
| `team:<name or id>` | The agents in a team. |
| `org:<id>` | The agents tagged `org:<id>` and the people whose `orgs` list it. |
| `role:<role>` | Agents with that role (`manager`, `chief-of-staff`, `member`), and people whose `role` is that text. |
| `host:<id>` | Parties on that host. |
| `rel:manager`, `rel:owner`, `rel:teammate` | Relations between the two parties: the sender is the target's manager (`humanManager` or `managerAgentId`), its owner, or in a team with it. Only in `from` and in `approvers`. |

Relations are the small part of the Zanzibar idea that we need: a check that follows a link between two records. lolad's vertical links become `rel:manager` rules. A closed team (`types/team.ts` declares `type: 'closed'` and `chiefOfStaffId`, and nothing enforces them today) becomes rules: deny `*` to `team:x`, except `rel:teammate` and the chief of staff.

### 4.3 Actions

| Action | Phase | Checked where | `to` is |
|---|---|---|---|
| `message` | 1 (built) | Every send path (PR #113) | person or agent |
| `call` | 1 (built) | `POST /api/calls` | person or agent |
| `device` | 2 | The device controller, before it runs a command | the device's owner, with `device:<id>` |
| `wake` | 2 | The wake flow (`lib/wake-flow.ts`), on the agent's host | agent |
| `task` | 2 | Card creation on another agent's board | agent |
| `agent.create`, `agent.delete`, `agent.move` | 4 | The agent services, on the owning host | agent or org |
| `agent.mode` | 4 | Wake and settings, when the permission mode goes up | agent |
| `agent.config` | 4 | The protected-file writer (F067) | agent |
| `secret.use`, `secret.grant` | 4 | The vault (F065) | `secret:<name>` |
| `sql.write` | 4 | The F037 approval step | agent |
| `policy.edit` | 3 | The policy editor and `PUT /api/policy` | `host:<id>` or `org:<id>` |

Actions with a dot are governance actions (section 11). An unknown action in a file is an error, so a typo does not turn into "rule never applies".

## 5. Explanations

Every check returns:

```json
{
  "effect": "deny",
  "reason": "person:bob may not message agent:payroll@host-b: blocked by payroll-finance-only on host-b: Payroll answers the finance team only",
  "rules": [{ "id": "payroll-finance-only", "layer": "host", "host": "host-b", "effect": "deny" }],
  "audit": [],
  "policy": { "host": "sha256:…", "org": "sha256:…" },
  "host": "host-b"
}
```

- `rules` lists every rule that decided, not only the first (Cedar returns all determining policies).
- `audit` lists the rules in audit mode that would have changed the answer: "Would be blocked by `x` (audit only)".
- `policy` names the hash of each layer, so a log line says exactly which rules were in force.
- A denial stays a 403 `policy_denied` with `message` (phase 1 shape). `details` adds `ruleIds`. `details.rule` (the number) stays for version 1 files.
- An `ask` is a 202 `approval_pending` with the request id, the approvers and the reason. The caller does not retry; it waits for the answer or the expiry.
- `GET /api/policy/check` keeps its phase 1 shape and adds the same fields. It still asks the hosts of both parties (`localOnly=1` between hosts).

## 6. The decision log

One append-only file per host: `~/.aimaestro/policy/decisions-YYYY-MM.jsonl`.

- **Always logged:** every deny, every ask and its answer, every audit-mode hit.
- **Allows:** not logged by default (volume). A setting turns them on for a time, for the "what if" replay.
- **One line:** time, host, action, both parties (labels, not message text), effect, rule ids, layer hashes, mode, and for an ask the approver and the proof.
- **Never:** message text, secret values, command arguments (the same rules as `docs/SPEC-AUDIT-TRAIL.md`).
- Phase 1 refusals in `amp-refusals.jsonl` stay; this log replaces them later.
- When the audit trail (F066) is on, each decision is also an audit event, and the agent's audit links to it.

This follows OPA's decision logs: one event per decision with the input, the result and the policy revision.

## 7. Audit mode (try before enforce)

- A rule or a whole file can have `"mode": "audit"`. The engine evaluates it, logs what it would do, and does not apply it.
- The "why" answer and the matrix show audit rules in a separate colour: "would block".
- **What-if replay.** Before a person saves a change in the editor, the engine runs the new rules against the decision log of the last 7 days and shows which past decisions would change. This needs allows in the log; without them, the editor says which kinds of traffic it could not replay.

Practice: Gatekeeper `dryrun` and `warn`, Kubernetes `Audit` and `Warn`, AgentCore `LOG_ONLY`.

## 8. Checks on the rules (lint)

The pattern language is small, so the checks are exact, not guesses. They run when the file loads, in the editor before a save, and in the Doctor.

**Errors (the file does not load):** bad JSON, a missing field, an unknown action or effect, a duplicate id, an `ask` with no approvers, a `rel:` pattern in `to`.

**Warnings:**

1. **Dead allow.** An allow rule that a deny rule always covers. Under deny-wins it can never take effect. This is the version 2 form of shadowing.
2. **Redundant rule.** A rule that another rule with the same effect covers.
3. **Exception that matches nothing**, and a rule whose `except` covers all of the rule.
4. **Unknown names.** A person, agent, team or organization that the directory does not know (lolad does the same). A warning, not an error: the agent can be on another host or not created yet.
5. **Version 1 files:** classic shadowing (an earlier rule covers a later rule with a different effect) and redundancy (Al-Shaer and Hamed).
6. **Failing tests** (below).

## 9. Policy tests

- A file can carry `tests`: `{ from, to, action, when?, expect }`, where `expect` is `allow`, `deny` or `ask`.
- The engine runs them on load, in the editor before a save, and in the Doctor. A failing test is a warning in the file and an error in the editor (the editor does not save until the person fixes it or removes the test).
- The tests run with the current directory (people, agents, teams). So a test can also fail because the directory changed, not the rules. That is useful: it says "this rule no longer does what you meant".
- Our own tests in `tests/policy.test.ts` keep the phase 1 cases and add: the version 1 to version 2 property test, layers, `except`, `ask`, audit mode and each lint warning.

This follows `opa test` and Cedar's validation: policies are code, and code has tests.

## 10. Several hosts

**Where the check runs (PEP and PDP).** XACML separates the enforcement point (the code that blocks or lets through) from the decision point (the code that evaluates). Here both are the same library on each host. There is no network call on the hot path.

- **Messages and calls:** as in phase 1. The sender's host checks before it sends. The recipient's host checks before it delivers. Each host applies its own layers. The stricter answer wins, because either host can refuse.
- **Agent actions and governance actions:** the agent's own host decides (the owning-host pattern), because it does the action. A request from another host carries who asked. The answer comes back with its reason.
- **Approvals:** the host that decides keeps the pending request. The approval card reaches the approver through the usual paths (chat card, phone push).

**Keeping layers the same on every host.**

- The organization layer is copied to every host, the way the audit setting is (`docs/SPEC-AUDIT-TRAIL.md` section 2): saving on any host writes the file there and sends it to every peer; a host that was offline gets it later; the newest `updatedAt` wins.
- Each host shows the hash it enforces. Settings shows "applied on 3 of 3 hosts". The Doctor reports a host whose hash differs.
- The host layer stays on its host. The agent layer moves with the agent.
- Two hosts can disagree for a short time after a change. With deny-wins, the cost is small: a host with the old organization layer can still deny, but it cannot open what the new layer closed, because the recipient's host checks too.

**A broken file.** Phase 1 applied no rules when the file did not load. Since 0.106.229 (open question 3): the host keeps the last version that loaded and applies it until the file is fixed. That version is also saved next to the file (`policy.json.last-good`, mode 600), so it survives a restart. Only with no good version in memory or on disk, no rules apply. The Doctor's `policy` check reports the error either way (warn with the last good version, fail with none).

## 11. Governance: the same engine for approvals

### 11.1 What a governance action is

A governance action changes what an agent is, what it may do, or the rules themselves: creating, deleting or moving an agent; raising its permission mode; changing its `CLAUDE.md` or settings; giving it a secret; writing to a database (F037); editing the policy. These are the actions with a dot in section 4.3.

### 11.2 What exists today

- **Roles and managers.** An agent has `role` (`manager`, `chief-of-staff`, `member`), `owner`, `humanManager` (a person id) and `managerAgentId`. A person has `role` (free text, "a policy hook for later"), `orgs` and `managerPersonId`. A message from an agent's `humanManager` carries operator authority (`lib/amp-trust.ts`).
- **Teams and organizations.** Teams (`lib/team-registry.ts`) have `type: 'open' | 'closed'` and `chiefOfStaffId`, but nothing enforces `closed`. Organizations (`lib/org-registry.ts`) are records behind `org:` tags. F074 (people see only their organizations) is a view filter, not a permission.
- **Permission modes.** Five modes (`supervised` to `fullAutonomy`), shown as Careful, Balanced and Hands-off (`lib/freedom.ts`).
- **Approval cards.** Tool approvals from the pane (`lib/pane-approval.mjs`), secret requests (F033, `lib/secret-requests.ts`) and SQL writes (F037, an approval tied to the exact statement, with an expiry).
- **Plans, not built:** F066 (audit trail, who authorized what), F067 (governance profiles, protected files, escalation, weekly check), F065 (secret scopes and grants, approval by the manager on the phone).

There is no common place that says who may approve what. Each approval card has its own rule (F037: any person; F065: the manager).

### 11.3 The proposal

1. **Ask is the approval.** A rule with `"effect": "ask"` and `approvers` says that the action needs a person's yes. The engine does not know cards; it returns `ask` with the approvers. The place that does the action (the PEP) opens the approval, using the card it already has.
2. **Approvers** are subject patterns: `rel:manager` (the target agent's manager: `humanManager`, else `managerAgentId`), `rel:owner`, `person:<id>`, `role:<role>`, `org:<id>`. An agent can be an approver only when a rule names it (for example `agent:ops-lead`). An agent never approves its own request.
3. **Proof.** `"proof": "signed"` means the yes must be signed on a paired device (AMP spec 13), as F067 wants for protected files. Without it, a click in the dashboard counts, and the record says "unverified person" (no login). This is the honest limit.
4. **One approval store.** The secret and SQL requests become kinds of one request store: id, action, parties, rule ids, approvers, proof, expiry, answer. One card component per kind can stay.
5. **Answers:** `once` (this request), `for <time>`, or `always`. Under deny-wins, an allow rule cannot override an ask rule (as in Claude Code). So `always` adds an `except` entry to the ask rule, in the right layer, with a note "approved by Alice on 2026-11-20". That edit is itself a `policy.edit`.
6. **No approval waits forever.** Expiry (default 30 minutes, set per rule), then F067's escalation: a push to the approver, a call (`call-a-person`), then the coordinator. An expired request is a deny with the reason "no approval in 30 minutes".
7. **Where ask cannot work** (a device input with no screen, a message from federation in phase 1), ask is a deny with the reason "needs approval, not possible here". For federation, F043's held messages are the ask path.
8. **Ask on a message is a held message.** This is lolad's federation hold, in general: the message waits until the approver allows it.
9. **Records.** Every ask, answer and expiry goes to the decision log, and to the audit trail (F066) when it is on: "who authorized it" becomes the approver and the rule.

### 11.4 What stays outside the engine

- Tool calls inside an agent: the program's own rules (Claude Code `permissions`, sandbox). F067 writes them from the same profile. The deny, ask, allow order is the same in both, so one profile reads the same way in both.
- Operating-system isolation: containers and the sandbox (B021).

## 12. The UI

1. **Settings > Policy.** The rules of each layer as sentences: "Nobody may message or call payroll, except the finance team and Alice. (Payroll answers the finance team only.)" Add, edit, delete, audit on or off. Lint warnings and tests next to the rule. Save runs the tests and shows the what-if replay. Every save keeps a version (F090).
2. **Matrix.** People and agents down the side, agents across the top, one action at a time. Each cell shows allow, deny, ask or "would deny" (audit). Hover shows the reason. Clicking a cell opens the rule (lolad's matrix, with our layers).
3. **Test box.** From, to, action: the full answer from section 5, from every host that takes part.
4. **"Why" on every refusal.** The composer, the chat and the call screen show the reason and a link to the test box, filled in.
5. **Approvals.** The existing cards, plus one list of pending approvals for each approver, in the dashboard and the app.
6. **Who is typing.** Juan's next step for phase 1: the dashboard chat carries the person who types (F074's "I am …" choice), so `person:<id>` rules apply there. Until then, the dashboard is an unidentified person.

## 13. Phases

| Phase | Content | Size |
|---|---|---|
| 1 (PR #113) | Host file, ordered rules, `message` and `call`, a reason on every denial, `GET /api/policy/check` | done |
| 1b | The dashboard chat carries which person is typing (with F074) | S |
| 2a | Rule ids, the decision log, `tests` in the file, lint for version 1 files | done (0.106.229) |
| 2b | Version 2: deny, ask, allow; `except`; version 1 compiled at load; property test; converter in the Doctor; audit mode | done (0.106.229), except the converter |
| 2c | Actions `device`, `wake`, `task`, in that order, each at its one place | M |
| 3 | Settings > Policy editor, matrix, test box, "why" links, what-if replay, `policy.edit` | M |
| 4 | Ask with approvals: one request store, approvers, proof, expiry and escalation, answers once / for a time / always, held messages | done (0.106.230, section 17), except call and coordinator escalation and the app's signed answers |
| 5 | Governance actions (section 4.3), the agent layer from F067 profiles, closed teams as rules, `rel:` subjects | L |
| 6 | The organization layer copied to every host, hashes in Settings, Doctor drift check, last good version | M |

Phase 2b can ship before 2c. Phase 4 needs 2b. Phase 5 needs 4 and F067's profile record.

## 14. Open questions for Juan

Each has a recommendation.

1. **Change the model for version 2 to "deny wins, no order"?** Recommended: yes. Version 1 files keep their meaning forever (compiled at load). Reasons in section 3.2.
2. **Default when no rule applies?** Recommended: `allow` for every action, as in phase 1, so nothing changes until someone writes a rule. A file can set `"default": "deny"`. An optional baseline template (F067's common deny rules) is offered, not applied.
3. **A broken file: no rules, or the last good version?** Phase 1 applies no rules. Recommended: keep the last version that loaded and apply it; apply no rules only when there never was a good version. The Doctor reports the error in both cases. This keeps an approval rule working while someone fixes a typo.
4. **Who approves by default?** Recommended: the target agent's manager (`humanManager`, else `managerAgentId`), then its owner. "Any person" only when a rule says so (F037 decided "any person" for SQL; that becomes its rule).
5. **Must governance approvals be signed on a phone?** Recommended: yes for `agent.config`, `agent.mode` up to full autonomy, `secret.grant` and `policy.edit`; a dashboard click is enough for the others.
6. **Where do organization rules live?** Recommended: a copy on every host, newest wins, as the audit setting does. Not one home host, because a host must decide when the home host is down.
7. **May an agent approve?** Recommended: only when a rule names that agent. Never the agent that asks.
8. **Who may edit the rules, with no login?** Recommended: `policy.edit` is an action like the others. With no rule, anyone on the network can edit (as today). An organization that wants a lock adds an ask rule with `"proof": "signed"`.
9. **Log allowed decisions?** Recommended: no by default (volume); on for a time when someone wants the what-if replay.
10. **Closed teams:** enforce `type: 'closed'` through rules (phase 5), or remove the unused field? Recommended: enforce it through rules; it is lolad's open-team idea in reverse and the type already exists.

## 15. Research appendix

Read on 2026-11-18. Quotes are short and from the page named.

**Combining algorithms and evaluation order**

- XACML 3.0 core specification, OASIS. Defines `deny-overrides`, `permit-overrides`, `first-applicable`, `only-one-applicable`, ordered variants, `deny-unless-permit` and `permit-unless-deny`; the PEP, PDP, PAP and PIP roles; obligations (the PEP must carry them out) and advice (it can ignore it). https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html
- AWS IAM, policy evaluation logic. Identity and resource policies give the union of their permissions; with a permissions boundary or an SCP, the intersection; "An explicit deny in either of these policies overrides the allow." https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
- Cedar, authorization. Default deny ("no request is authorized … unless there is a specific `permit` policy"); "if any `forbid` policy evaluates to `true`, then the final result is `Deny`"; a policy that errors is skipped; the answer lists the determining policies. https://docs.cedarpolicy.com/auth/authorization.html
- Cutler et al., "Cedar: A New Language for Expressive, Fast, Safe, and Analyzable Authorization", OOPSLA 2024. Policies reduce to SMT for analysis, for example to prove that a refactored policy set grants the same permissions. https://arxiv.org/abs/2403.04651
- Google Cloud IAM deny policies. "IAM always checks relevant deny policies before checking relevant allow policies"; exception principals are not denied. https://docs.cloud.google.com/iam/docs/deny-overview
- Kubernetes RBAC. "Permissions are purely additive (there are no "deny" rules)." https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- Casbin model syntax. Policy effects: allow-override, deny-override, allow-and-deny, priority, subject priority. https://casbin.apache.org/docs/syntax-for-models/
- iptables(8). "If the packet does not match, the next rule in the chain is examined"; ACCEPT and DROP decide at once; the chain policy decides when no rule does. https://man7.org/linux/man-pages/man8/iptables.8.html
- Zanzibar, Google (USENIX ATC 2019). Relationship-based access: relation tuples between objects and users, one data model for many services. OpenFGA is an open implementation. https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/ and https://openfga.dev/docs

**Rule anomalies and tooling**

- Al-Shaer and Hamed, firewall policy anomalies: shadowing, generalization, correlation and redundancy; anomalies found in every tested configuration. Al-Shaer, Hamed, Boutaba and Hasan, "Conflict classification and analysis of distributed firewall policies", IEEE JSAC 2005. https://rboutaba.cs.uwaterloo.ca/Papers/Journals/2005/Ehab05.pdf
- OPA decision logs: one event per decision with `decision_id`, `input`, `result`, bundle revisions and a masking policy. https://www.openpolicyagent.org/docs/management-decision-logs
- OPA policy testing (`opa test`). https://www.openpolicyagent.org/docs/policy-testing
- Gatekeeper enforcement actions: `deny`, `dryrun` (violations recorded, nothing blocked), `warn`. https://open-policy-agent.github.io/gatekeeper/website/docs/violations/
- Kubernetes ValidatingAdmissionPolicy `validationActions`: `Deny`, `Warn`, `Audit`. https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/

**Policy for AI agents**

- Claude Code permissions. "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order." "An allow rule can't carve an exception out of a deny rule." Hooks cannot bypass deny and ask rules. https://code.claude.com/docs/en/permissions
- Model Context Protocol, tools (2025-06-18). "There SHOULD always be a human in the loop with the ability to deny tool invocations"; clients SHOULD confirm sensitive operations and log tool use; tool annotations are untrusted unless the server is trusted. https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- A2A specification. Servers must return an authorization error when the client lacks permission and must not reveal resources the client may not access; authorization itself is left to the implementation. https://a2a-protocol.org/latest/specification/
- OWASP Top 10 for LLM Applications, LLM06:2025 Excessive Agency. Causes: excessive functionality, permissions or autonomy. Controls: human approval for high-impact actions, authorization in downstream systems "rather than relying on an LLM", logging, rate limits. https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
- Amazon Bedrock AgentCore Policy. Cedar policies checked at the gateway, outside the agent's code, on every tool call; default deny; `LOG_ONLY` and `ENFORCE` modes; every decision logged; automated checks for policies that are too broad or never apply. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy.md, https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-enforcement-modes.md, https://aws.amazon.com/blogs/security/why-policy-in-amazon-bedrock-agentcore-chose-cedar-for-securing-agentic-workflows/

**lolad**

- `CamiloCaceres/lolad` at `2649a3f` (2026-11-12): `SPEC.md` (sections Policy and federation), `internal/policy/policy.go`. https://github.com/CamiloCaceres/lolad

## 16. As built: phases 2a and 2b (0.106.229, F118 step 1)

Code: `lib/policy.ts` (validation, the version 1 compiler, the evaluator `decide`, lint, tests, the decision log), `lib/policy-check.ts` (`checkPolicy`, which every send path calls, and the log write), `services/policy-service.ts`, `services/doctor-checks.ts` (`policy`). Tests: `tests/policy.test.ts` (phase 1, unchanged) and `tests/policy-v2.test.ts`.

- **Format:** section 4, with these limits. Subjects are the phase 1 patterns (`*`, `person:`, `agent:`, `team:`, `host:`); `org:`, `role:` and `rel:` come with governance (phase 5), and `rel:` in `to` is an error. `approvers` is required on an `ask` (patterns, `rel:manager`, `rel:owner`) and is kept for phase 4. `proof` is kept. `when` is refused as "not supported yet". Actions are `message` and `call` (`POLICY_ACTIONS`; phase 2c and 5 add names there).
- **Version 1:** compiled at load as section 3.3 says. `tests/policy-v2.test.ts` compares the compiled rules with a first-match evaluator on 2,000 random rule lists (1 to 6 rules over 12 patterns, `both` and `action` at random), for every pair of 7 parties and both actions: the same `allowed` and the same deciding rule number every time. A deliberately broken compiler fails it.
- **Explanations:** the decision has `effect`, `ruleIds` (every deciding rule; the reason names them all), `matched` (every rule that matched, with its effect and mode), `wouldBe` and `auditRuleIds` (audit), `approvers` (ask), and `rule` (the number, version 1 files). A refusal's 403 `details` adds `ruleIds` and `effect`. `GET /api/policy/check` adds `effect` (the strictest of every host).
- **Ask, in this step:** the engine returns `ask` and the check API reports it. Every send path refuses it like a deny (403 `policy_denied`), with the reason "... needs approval under <rule> (approvals arrive in F118 step 2, so for now this is refused)". There is no request store and no 202 yet. (Replaced in 0.106.230 by section 17.)
- **Audit:** `"mode": "audit"` on a rule or on the file. Audit rules never change the answer; a file in audit mode applies nothing, its default included. When they would change it, the reason ends with "(audit only: x would have it refused)", and the decision is logged.
- **Decision log:** `~/.aimaestro/policy/decisions.jsonl`, one JSON line per decision: time, host, action, both parties as labels, effect, rule ids, `wouldBe` and audit rule ids, file version and hash (`sha256:` + 16 hex). Never message text. Written for every deny, ask and audit hit; allows only when the file sets `"logAllows": true` or `"logAllows": "<ISO time>"` (until then). Past 5 MB the file moves to `decisions.1.jsonl` (one old file kept). A "why" question (`/api/policy/check`) is not logged. Phase 1's `amp-refusals.jsonl` is unchanged.
- **Lint** (`GET /api/policy` `lint`, and the Doctor): version 2, dead allow (an enforced deny or ask with no `except` covers the allow) and redundant (a rule of the same effect covers it; of two identical rules, the later is reported). Version 1, shadowed and redundant (an earlier rule covers a later one). Coverage is exact for the pattern language and says "not covered" when unsure. Not built: exceptions that match nothing, unknown names.
- **Tests in the file:** `tests` on either version, run with this host's directory by `GET /api/policy` (`tests`: each case with `got`, `pass` and the reason) and the Doctor. A test checks what the rules say, audit rules included, so a test can be written before a rule is enforced.
- **Doctor `policy` check:** fail when a file exists but no rules apply (broken, never loaded); warn when the last good version is in force, for each lint warning and for each failing test.
- **Not built:** the converter for version 1 files (`GET /api/policy` shows a version 1 file as version 2 rules, which can be copied into a version 2 file), the what-if replay, layers other than the host.

## 17. As built: phase 4, approvals (0.106.230, F118 step 2)

Juan did not answer the open questions, so this step takes the recommendations of section 14 (questions 4 and 7) and the ones in the task. Code: `lib/policy-approvals.ts` (the store, approvers, answers, signatures, the "always" edit), `lib/policy-check.ts` (`holdForApproval`, `askNotPossible`, grants and passes inside `checkPolicy`, the sweeper), `services/policy-service.ts` (list, answer, delivery of held messages, telling the sender), `components/settings/ApprovalsSection.tsx`. Tests: `tests/policy-approvals.test.ts`.

### 17.1 The request store

- One store per host: `~/.aimaestro/policy/approvals.json`, mode 600, written atomically (`lib/atomic-write.mjs`). A request has: `id` (`apr-…`), `created`, `host`, `action`, `from` and `to` (labels), `rules` (the ask rule ids), `reason`, `approvers` (resolved, 17.2), `unresolved` (patterns that named nobody, with why), `proof`, `expiresAt`, `state` (`pending`, `approved`, `refused`, `expired`), `answer` (`once` / `for` / `always` / `refuse`, `for`, `until`, `by`, `how`, `keyId`, `at`, `exceptAdded`), `held` (the path that holds the message) and `delivery` (when, ok, the error).
- A held message's payload is in its own file, `~/.aimaestro/policy/held/<id>.json`, mode 600. It is never in the store or in the decision log. It is removed when the request is refused or expires, and read and removed in one step when it is approved, so it is delivered at most once (a crash between that step and the delivery loses it, and the request says "not delivered").
- Answered and expired requests are kept 30 days; grants until they end.
- **The host that decided keeps the request** (section 10): the recipient's host for a delivery (its rules ask before it delivers), the sender's host for a send (its rules ask before it sends). A message through two hosts can wait on either, or on both, one after the other.
- **A person on another host** sees every request: `GET /api/policy/requests` asks each peer for its own (`?localOnly=1`, so two hosts never ask each other in a loop) and lists them with their `host`. The dashboard posts the answer to its own host with `host` set, and that host passes it to the owning host's `POST /api/policy/requests/:id/answer`. A phone can post to the owning host directly.

### 17.2 Approvers

| Pattern | Resolves to |
|---|---|
| `rel:manager` | The target agent's `humanManager` (a person: matched by id, display name or email; kept as typed when the directory does not know it), else its `managerAgentId` (an agent) |
| `rel:owner` | The target agent's `owner`: a person, else an agent by name, else the text as typed |
| `person:<id>` | That person |
| `person:*` | Any person (F037's rule, written explicitly) |
| `agent:<name>` | That agent, only because the rule names it. Never the agent that asked |
| `role:`, `org:` (and `team:`, `host:`, `*`, `agent:*`) | Not resolved yet. The file still loads; lint reports `approver`; a request that only they could answer is refused: "…, but no approver could be found (role:x: not supported yet), so it is refused" |

`rel:` relations need the target in this host's registry, so they resolve on the recipient's host, which is where a delivery rule should live anyway. Any approver of any deciding rule may answer (not one per rule).

### 17.3 The send paths

| Path | Ask becomes |
|---|---|
| AMP route (`/api/v1/route`, `routeMessage`) | Held. The route has checked the sender, its signature and found the recipient; it stores what the rest of the route needs (`RoutedDelivery`) and answers 202. On approval `deliverRouted` runs the same delivery code the route runs right after its check (person mailbox, mesh forward, local delivery, relay queue). A forward to a host that holds it answers 202 there, and the sending host passes that on |
| Dashboard and API sends (`sendFromUI`, `forwardFromUI`, through `POST /api/messages` and the agent message routes) | Held; the options of the send are the payload. On approval the same function runs again with `approved: <id>` |
| Dashboard chat (`server.mjs` `sendChatMessage`) and REST chat (`agents-chat-service`) | Held (the chat shows the reason in place of "sent"). On approval the text goes through `__deliverChatLine` (the server's chat path) or, without the server, the REST chat path, with the pass |
| Calls (`POST /api/calls`) | Refused at once (403 `policy_denied`) with a request in `details.request`. An approval lets the same caller call the same callee: once within the rule's expiry window, or until the end of a "for" answer |
| Device input (`lib/device-events.ts`) | Refused: "…, which is not possible here (a device input has no screen to wait for an approval)" |
| Federation (`/api/v1/federation/deliver`) | Refused: "… not possible here (a message from another provider cannot wait for an approval yet)". F043's held mail will be the ask path there |

The answer to the sender of a held message: 202 `{ error: "approval_pending", status: "held", message: "Held for approval by Alice (request apr-…, expires 2026-11-20 14:30 UTC): …", request: { id, approvers, expiresAt, held: true } }`. `amp-send` already treats 202 as sent and prints `Status: held`; it does not print `message` yet (an upstream change in agentmessaging/claude-plugin). The agent learns the outcome anyway: on approval, refusal or expiry an agent sender gets a notification from AI Maestro in its inbox ("Your message to agent:payroll was refused by …"). A person sender sees the request in Settings > Approvals.

**Exactly once.** A path that checks again on the replay (dashboard sends, chat) gets one pass: `checkPolicy(…, { approved: id })` allows the ask only if that request is approved, was answered less than 5 minutes ago, has the same parties and action, and its pass is unused; the pass is then used. The AMP route replays after its check, so it needs no pass. A second answer to the same request gets 409.

### 17.4 Answers and proof

`POST /api/policy/requests/:id/answer` with `{ answer, for?, by?, keyId?, signature?, signedAt?, host? }`:

- `once`: a held message is delivered; a call gets a one-use grant for the rule's expiry window.
- `for` (`"30m"`, `"1h"`, `"7d"`, at most 30 days): a grant `{ from, to, action, rules, until }`. `checkPolicy` consults grants after the rules: a grant turns an ask covered by the same rule ids into an allow and never opens a deny. A "why" question (`GET /api/policy/check`) uses no grant. A held message is also delivered.
- `always`: an `except` entry `{ from: [<sender>], to: [<target>], actions: [<action>], note: "approved always by <by> on <date> (request <id>)" }` goes into each ask rule that decided, in this host's file, written atomically after the new file validates, and logged as `policy.edit`. Refused, and the request stays pending, when the file is version 1 ("Convert it to version 2 first"), when the sender cannot be named (a dashboard person), or when the rule is gone. Exceptions may now carry `note`.
- `refuse`: never needs a signature.
- `by` is what the person typed; it is recorded as `"<by> (unverified)"`, or `"an unverified person"`. Whoever asked cannot answer, and `by: "agent:x"` must be one of the approvers.

**Signed proof (`"proof": "signed"`).** A dashboard click is refused with 403 `signature_required` and a plain reason. The server checks a signature from a device key that a person paired (spec 13 keys: `lib/person-devices-registry`, looked up with `personKeyFor`):

- The app signs, with the device's Ed25519 key (the same key it signs messages with), the UTF-8 string
  `aimaestro-approval/1|<host>|<request id>|<answer>|<for or empty>|<signedAt>`,
  where `<host>` is the request's `host`, `<answer>` is `once`, `for`, `always` or `refuse`, `<for>` is the duration text exactly as sent (empty unless the answer is `for`), and `<signedAt>` is RFC 3339, the same text as in the body.
- It posts `{ answer, for?, keyId, signature (base64, 64 bytes), signedAt }` to the owning host.
- The host accepts it when the key exists and is `active`, belongs to a person who is an approver of the request (or the approvers include `person:*`), the signature verifies over that string, and `signedAt` is within 5 minutes of the server clock. The answer is then recorded as `by: person:<id>`, `how: signed`, with the `keyId`. One answer per request, so no nonce is needed.
- **Missing on the app side:** the app has no approvals screen, does not handle the `approval` push, and does not sign answers. It must: list `GET /api/policy/requests?state=pending` on each host it is connected to (show those whose approvers name the person), open a request from the push's `data.requestId` and `data.hostId`, build and sign the string above, and post the answer. Until then a `signed` rule can only be refused, or answered by a client that signs.

### 17.5 Expiry, escalation, records, Doctor

- Expiry: the rule's `"expires"` (`"30m"`, `"2h"`, `"1d"`; only on an ask rule), else 30 minutes; the shortest of the deciding rules. An expired request is refused: its held message is dropped, the decision log gets `expired`, and an agent sender is told. The server sweeps once a minute and once at startup; listing and answering sweep too.
- Escalation in this step: one push, type `approval`, to the paired devices of the approvers that are people, when the request is created: title "Approval needed", body "<from> wants to <action> <to>. Open AI Maestro to answer.", `data { type: approval, requestId, hostId }`. It goes to devices that opted in to `approval`, or to `needs_you` (apps from before this type). `person:*` notifies every such device. **Next steps, not built:** ringing the approver (`call-a-person`) when the push gets no answer, then the coordinator agent; reminders before expiry.
- Records: the decision log gets one line per `ask`, `answer` (with `by` and `proof`), `expired`, `delivered` and `policy.edit` (with the request id), never message text.
- Doctor `policy-approvals`: fail when the store cannot be read (every ask is then refused, and nothing overwrites the file); warn for each pending request more than a minute past its expiry (the sweeper did not run).

### 17.6 Not in this step: moving F033 and F037 into the store

The store is ready to take other kinds, but secret requests and SQL write approvals keep their own files and cards for now. Plan:

1. **SQL writes (F037)** first, because it is an approval tied to one exact statement with an expiry, the same shape as a held message. Add an action `sql.write` (section 4.3) and a default rule `{ effect: ask, actions: [sql.write], approvers: [person:*] }` that reproduces today's "any person", so nothing changes until someone edits it. The F037 approval step calls `holdForApproval` with a held payload of kind `sql` (statement hash, database, the agent), and the card answers through `POST /api/policy/requests/:id/answer`. Its own store is read once at startup and pending items are copied in; then it is removed.
2. **Secret requests (F033)**: a request for a secret is not a message to hold; it asks a person to store a value. Keep its flow (the person types the secret into the dashboard, never into the store), and record only the approval part in the store as action `secret.grant` with no payload, so that F065's manager approval and proof rules apply. The value never enters the store or the log.
3. One card list: Settings > Approvals shows every kind, and the existing cards become views of store entries. The phone gets one list.
4. Each move has its own test that the old behaviour (who may approve, expiry) is unchanged with no rules file.

### 17.7 Limits

- No login: an unsigned answer proves nothing about who clicked. Only `"proof": "signed"` does.
- A held message keeps the envelope it had when it was held; its time is the time it was sent, not the time it was approved.
- Grants are matched on labels (`agent:dev@host-a`); an agent that moves to another host is a new party for its old grants.
