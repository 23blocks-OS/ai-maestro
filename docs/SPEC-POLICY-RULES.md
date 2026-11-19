# Spec: policy rules and governance

**Status:** Phase 1 is PR #113 (F042, 0.106.222). Phases 2a and 2b shipped in 0.106.229 (F118 step 1), with the recommendations of section 14 for questions 1, 2, 3 and 9; section 16 says what was built and what was left out. Phase 4 (approvals for `ask`) shipped in 0.106.230 (F118 step 2), with the recommendations of section 14 for questions 4 and 7; since 0.106.233 an ask is an AMP quarantine on the wire. Section 17 says what was built and the plan for moving F033 and F037 into the store. Phases 2c, 3, 5 and 6 are proposals. Backlog: F042 (who may reach whom), F118 (governance actions and approvals), F066 (audit trail), F067 (agent governance profiles), F043 (federation between people).
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
| `agent.create`, `agent.delete`, `agent.move` | 4 (built, 0.106.239) | The agent services, on the owning host (section 18) | agent |
| `agent.mode` | 4 (built, 0.106.239) | Wake and settings, when the permission mode goes up | agent |
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
- A denial is a 403 `forbidden` (AMP 08) with the plain reason in `message` (`policy_denied` until 0.106.233). `details` adds `ruleIds`. `details.rule` (the number) stays for version 1 files.
- An `ask` is an AMP policy hold: 202 with `status: "quarantined"` and the `quarantine` object (section 17.3). The caller does not retry; it waits for the decision or the expiry.
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
| 4 | Ask with approvals: one request store, approvers, proof, expiry and escalation, answers once / for a time / always, held messages | done as AMP quarantine (0.106.230, wire in 0.106.233, section 17): approve releases one message once; "for a time" and "always" move to step 3 as policy edits; approval by signed message, provider notices and escalation are next |
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

## 17. As built: phase 4, ask = AMP quarantine (0.106.230, wire changed in 0.106.233, F118 step 2)

An `ask` is an **AMP policy hold**: a quarantine entry with `reason: "policy"`. Everything on the wire follows the AMP spec: [05 Routing, Status Values](https://github.com/agentmessaging/protocol/blob/main/spec/05-routing.md#status-values), [07 Security, Message Quarantine and Policy Holds](https://github.com/agentmessaging/protocol/blob/main/spec/07-security.md#message-quarantine), [08 API, Quarantine Management and Error Codes](https://github.com/agentmessaging/protocol/blob/main/spec/08-api.md). 07 lets a provider override verdicts per rule id through policy; our rules file is that policy: `deny` is a block, `ask` is a quarantine. The first version of this step (0.106.230) used its own words (`approval_pending`, `held`, `refused`, `apr-` ids, `/api/policy/requests`, a signed string of its own); 0.106.233 replaced them with AMP's.

Code: `lib/policy-approvals.ts` (the store, approvers, approve / reject), `lib/policy-check.ts` (`holdForApproval`, `askNotPossible`, the pass inside `checkPolicy`, the sweeper), `lib/policy.ts` (`policyDeniedResult`, the wire shapes), `services/policy-service.ts` (the quarantine API, delivery of a released message, telling the sender), `components/settings/ApprovalsSection.tsx`. Tests: `tests/policy-approvals.test.ts`.

### 17.1 The quarantine store

- One store per host: `~/.aimaestro/policy/quarantine.json`, mode 600, written atomically (`lib/atomic-write.mjs`).
- An entry has the AMP 07 metadata: `quarantine_id` (`qtn_<unix-ts>_<hex>`), `reason: "policy"`, `rules_triggered` (the ask rule ids), `reason_text` (the plain reason), `reviewers` (AMP addresses of the approvers: `p-<id>@<domain>` for a person, `<name>@<domain>` for an agent; `person:*` has no address and is not listed), `quarantined_at`, `expires_at`, `status`. `severity` is left out, as 07 allows for reason `policy`.
- AI Maestro's own fields: `host`, `action`, `from` and `to` (labels), `approvers` (the reviewers with names and the rule pattern each came from, 17.2), `unresolved`, `proof`, `sender` (the sender's AMP address, for the outcome notice), `held` (the path that holds the message and, when there is one, its AMP `message_id`, `from`, `to`, `subject`), `requests` (the approval request notice sent to each reviewer: `to`, `id`, `at`; not shown by the API), `decided` (`by`, `at`, `via`: `rest` or `signed-message`, and for a signed decision the signed `answer`) and `delivery`.
- `status` is exactly `pending` → `approved` | `rejected` | `expired`, one way (07 Quarantine States).
- A quarantined message's payload is in its own file, `~/.aimaestro/policy/quarantine/<id>.json`, mode 600, never in the store or the decision log. It is removed when the entry is rejected or expires, and read and removed in one step when it is approved, so it is delivered at most once (a crash between that step and the delivery loses it, and the entry says "not delivered").
- Decided and expired entries are kept 30 days.
- **The host that decided keeps the entry** (section 10): the recipient's host for a delivery, the sender's host for a send.
- The store of 0.106.230 (`approvals.json`, `held/`) is not read any more. Its requests expired 30 minutes after they were made.

### 17.2 Approvers (AMP `reviewers`)

| Pattern | Resolves to |
|---|---|
| `rel:manager` | The target agent's `humanManager` (a person: matched by id, display name or email; kept as typed when the directory does not know it), else its `managerAgentId` (an agent) |
| `rel:owner` | The target agent's `owner`: a person, else an agent by name, else the text as typed |
| `person:<id>` | That person |
| `person:*` | Any person (F037's rule, written explicitly) |
| `agent:<name>` | That agent, only because the rule names it. Never the agent that asked |
| `role:`, `org:` (and `team:`, `host:`, `*`, `agent:*`) | Not resolved yet. The file still loads; lint reports `approver`; an ask that only they could approve is a block: "…, but no approver could be found (role:x: not supported yet), so it is refused" |

07 Policy Holds, reviewers rule 3: the sender never decides on its own entry (403 `forbidden`).

### 17.3 The send paths

| Path | Ask becomes |
|---|---|
| AMP route (`/api/v1/route`, `routeMessage`) | Quarantined. The route has checked the sender, its signature and found the recipient; it stores what the rest of the route needs (`RoutedDelivery`) and answers 202. On approval `deliverRouted` runs the same delivery code the route runs right after its check ("routes the message as if it had just arrived", 08). A forward to a host that quarantines it answers 202 there, and the sending host passes that on |
| Dashboard and API sends (`sendFromUI`, `forwardFromUI`) | Quarantined; the options of the send are the payload. On approval the same function runs again with `approved: <quarantine id>` |
| Dashboard chat (`server.mjs` `sendChatMessage`) and REST chat (`agents-chat-service`) | Quarantined. The chat socket answers `chat:quarantined` (the reason and the entry) and the bubble shows "Held for approval" with no Retry; `chat:quarantineOutcome` (`quarantineId`, `delivered`, `rejected`, `expired` or `failed`) updates it. These are the dashboard's own socket events, not AMP |
| Calls (`POST /api/calls`, not AMP) | Refused at once: 403 `forbidden` with `details.quarantine_id` and `details.expires_at`. Same store, ids and states. Approving lets the same caller call the same callee once, within the rule's expiry window |
| Device input (`lib/device-events.ts`) | Refused: "…, which is not possible here (a device input has no screen to wait for an approval)" |
| Federation (`/api/v1/federation/deliver`) | Refused: "… not possible here (a message from another provider cannot wait for an approval yet)" |

**The route response** (05 Status Values, policy hold): HTTP 202

```json
{
  "id": "<message id>",
  "status": "quarantined",
  "quarantine": { "quarantine_id": "qtn_…", "reason": "policy", "rules_triggered": ["payroll-asks"], "reason_text": "Held for approval by Alice (…): …", "reviewers": ["p-alice@acme.aimaestro.local"], "expires_at": "…" },
  "message": "Held for approval by Alice (quarantine qtn_…, expires 2026-11-20 14:30 UTC): …"
}
```

`message` repeats the plain reason for the dashboard. 07 allows the sender to see `reason_text`, `rules_triggered` and `reviewers` for a policy hold (a policy is not a secret detector).

**A deny** is a block: 403 `{ error: "forbidden", message: <the plain reason>, details: { rule, ruleIds, effect, host } }` (08 Error Codes). A host reads a peer's 403 `forbidden` (or the `policy_denied` of a host before 0.106.233) as final, never retried.

**Exactly once.** A path that checks again on the release (dashboard sends, chat) gets one pass: `checkPolicy(…, { approved: id })` allows the ask only if that entry is approved, was approved less than 5 minutes ago, has the same parties and action, and its pass is unused. The AMP route releases after its check, so it needs no pass. A second decision gets 409 `quarantine_decided`.

### 17.4 The quarantine API (08 Quarantine Management)

Under the AMP provider prefix, also in headless mode:

- `GET /api/v1/quarantine?status=pending&limit=20` — `{ items, count, total }`. `status` defaults to `pending`; `limit` is 1 to 100. This host's entries and every peer's: each peer is asked with `localOnly=1` (AI Maestro's own parameter), so two hosts never ask each other in a loop; peers that do not answer are in `unreachable`.
- `GET /api/v1/quarantine/{id}[?host=]` — one entry; for a message held at the AMP route, `message: { envelope, payload }` while it is pending.
- `POST /api/v1/quarantine/{id}/approve` — releases the message, once: 200 `{ quarantine_id, status: "approved", message_id, delivered }`. A call entry answers `message_id: null, delivered: false` (the next identical call goes through).
- `POST /api/v1/quarantine/{id}/reject` — 200 `{ quarantine_id, status: "rejected" }`. The message is never delivered.
- Errors: 410 `quarantine_expired`, 409 `quarantine_decided`, 404 `not_found`, 400 `invalid_field` (a bad id, status or limit), 403 `forbidden` (the sender, an agent that is not a reviewer, or a `signed` rule).
- Body of approve and reject: `{ by?, host? }`. `host` sends the decision to the host that keeps the entry. `by` is what the person typed, recorded as `"<by> (unverified)"`, or `"an unverified person"` (no login). There are no other answers: "for a time" and "always" are rule changes, not approvals, and come back as policy edits in F118 step 3.

**`"proof": "signed"`.** An approve from the dashboard is refused (403 `forbidden`, with a plain reason). Rejecting needs no proof. Only a signed reply (17.8) approves it.

### 17.5 Expiry, notifications, records, Doctor

- Expiry: the rule's `"expires"` (`"30m"`, `"2h"`, `"1d"`; only on an ask rule), else 30 minutes; the shortest of the deciding rules. 07 lets a policy hold have a shorter TTL than 72 hours and puts the time in `expires_at`. An expired entry is not delivered, the decision log gets `expired`, and an agent sender is told. The server sweeps once a minute and once at startup; listing and deciding sweep too.
- Notifications: AMP provider notices (17.8): an `approval_request` to each reviewer when the entry is made, and a `quarantine_outcome` to the sender (agent or person) when it is approved, rejected or expires. These replace the unsigned "maestro" inbox message of 0.106.233. A person reviewer gets one push per request, type `approval`, `data { type: approval, quarantine_id, hostId }`, sent by the host that delivers the `approval_request` into their mailbox (where their devices are paired), never a second new-message push for it. A device that takes no `approval` (or `needs_you`) push gets the ordinary new-message push instead. `person:*` has no mailbox, so the deciding host pushes every opted-in device (0.106.238).
- Records: the decision log gets one line per `quarantined`, `approved`, `rejected` (with `by`), `expired` and `delivered`, with the entry id, never message text.
- Doctor `policy-approvals`: fail when the store cannot be read (every ask is then refused, and nothing overwrites the file); warn for each pending entry more than a minute past its expiry.

### 17.6 Not in this step: moving F033 and F037 into the store

The store is ready to take other kinds, but secret requests and SQL write approvals keep their own files and cards for now. Plan:

1. **SQL writes (F037)** first, because it is an approval tied to one exact statement with an expiry, the same shape as a held message. Add an action `sql.write` (section 4.3) and a default rule `{ effect: ask, actions: [sql.write], approvers: [person:*] }` that reproduces today's "any person", so nothing changes until someone edits it. The F037 approval step calls `holdForApproval` with a held payload of kind `sql` (statement hash, database, the agent), and the card decides through `POST /api/v1/quarantine/{id}/approve` or `/reject`. Its own store is read once at startup and pending items are copied in; then it is removed.
2. **Secret requests (F033)**: a request for a secret is not a message to hold; it asks a person to store a value. Keep its flow (the person types the secret into the dashboard, never into the store), and record only the approval part in the store as action `secret.grant` with no payload, so that F065's manager approval and proof rules apply. The value never enters the store or the log.
3. One card list: Settings > Approvals shows every kind, and the existing cards become views of store entries. The phone gets one list.
4. Each move has its own test that the old behaviour (who may approve, expiry) is unchanged with no rules file.

### 17.7 Limits

- No login: a dashboard decision proves nothing about who clicked. A signed reply (17.8) does.
- 08 says the quarantine endpoints need the tenant admin or a reviewer. AI Maestro has no app-level login by design (the network is the trust boundary), so anyone on the network can list and decide; a reviewer-only list needs reviewer authentication.
- A quarantined message keeps the envelope it had when it was quarantined; its time is the time it was sent, not the time it was approved.
- A call pass is matched on labels (`agent:dev@host-a`); an agent that moves to another host is a new party.

### 17.8 Provider notices and approval by signed message (0.106.235)

Spec: [07 Security, Policy Holds and Provider Notices](https://github.com/agentmessaging/protocol/blob/main/spec/07-security.md#policy-holds-normative), [13.6 rule 5](https://github.com/agentmessaging/protocol/blob/main/spec/13-person-principals.md#136-authority-normative), [13.3](https://github.com/agentmessaging/protocol/blob/main/spec/13-person-principals.md#133-sending-as-a-person-normative), [03 Reserved names](https://github.com/agentmessaging/protocol/blob/main/spec/03-registration.md), [06 Provider Authentication](https://github.com/agentmessaging/protocol/blob/main/spec/06-federation.md#provider-authentication), [08 Provider Info](https://github.com/agentmessaging/protocol/blob/main/spec/08-api.md). Code: `lib/provider-key.ts`, `services/provider-notices.ts`, `answerProviderMessage` in `services/policy-service.ts`, the `_provider` branches of `routeMessage` and `deliverFederated` in `services/amp-service.ts`. Tests: `tests/provider-notices.test.ts`.

**The provider key.** Each host has an Ed25519 provider key, `~/.aimaestro/amp/provider-key.pem` (mode 600, made on first use). It is published as `public_key` and `fingerprint` in `/api/v1/info` and `/.well-known/agent-messaging.json`, which also list `quarantine:policy` (08) once the key exists.

**`_provider` is reserved** (03, 07 rule 1). `POST /v1/register` with that name answers 409 `name_taken`; the registry refuses it too. A message to `_provider` is for the provider: it is never delivered to anyone.

**A notice** is an ordinary AMP message from `_provider@<tenant>.aimaestro.local`, `payload.type: "system"`, `payload.context.provider: "aimaestro.local"` and `payload.context.amp_notice`, signed with the canonical signature (07 Signature Format) and the provider key. It goes through the normal route as this host's own traffic, so it reaches an agent's inbox or a person's mailbox (13.5) on whichever host holds them. The rules file does not apply to a verified notice (the provider is not a principal the rules are about).

- `approval_request`, to each reviewer when the entry is made. `payload.context`: `provider`, `amp_notice`, `quarantine_id`, `reason_text`, `rules_triggered`, `held` (`from`, `to`, `subject` of the held message; left out for a call) and `expires_at`. The id the reviewer's host gives the notice is that reviewer's approval request, kept in the entry's `requests`.
- `quarantine_outcome`, to the sender on approved, rejected or expired, with `in_reply_to` the held message's id. `payload.context`: `provider`, `amp_notice`, `quarantine_id`, `status`, `reason_text`, and `decided_by` (the reviewer's address) only for a signed decision.

**Checking a notice** (07 rule 4). A message from `_provider@…` counts as a verified notice only when `from` ends with `.` + `payload.context.provider`, that provider is the one expected, and the signature verifies with the provider key of the host that wrote it: this host's own key, or for one forwarded by a mesh peer, the key that peer publishes in its `/api/v1/info` (cached an hour). A key sent along with the message (`sender_public_key`) is never used, and `_provider` is never resolved. A notice that fails is refused (403 `invalid_signature`), as every bad signature is on the route; one whose key cannot be found is delivered `untrusted`. From another provider (`/api/v1/federation/deliver`), a `_provider` notice is checked with the provider key that just authenticated the request (found by discovery), and only when `payload.context.provider` names that provider.

**Approval by signed message** (07 "Approval by message", 13.6 rule 5). A reviewer sends a message to `_provider@<tenant>.aimaestro.local` with `in_reply_to` = the id of its approval request and `payload.context` `{ decision: "approve" | "reject", quarantine_id }`; a person also signs `sent_at` and `nonce` (13.3, checked by the route exactly as for any person's message). The provider applies it only when:

1. the route verified it for its sender (an agent's registered key; for a person steps 1 to 5 of 13.3);
2. `from` is the reviewer the request was sent to;
3. `in_reply_to` is that request, and `quarantine_id` is the entry it names;
4. the entry is `pending` and not expired, the sender is a listed reviewer and not the sender of the held message.

Then it does what `POST …/approve` or `/reject` does (delivery once, chat, outcome notice) and keeps the signed answer in `decided.answer` (`id`, the signed fields, `signature`, `key_id`). The route answers 200 `{ id, status: "delivered", method: "local" }`. Refusals: 400 `invalid_field` (no `decision` in `payload.context`: a decision is never read from the text, so "ok" is refused; or a bad `quarantine_id`), 400 `missing_field` (no `in_reply_to`), 403 `forbidden` (not verified, another reviewer's request, another entry, not a reviewer, the sender itself), 404 `not_found`, 409 `quarantine_decided`, 410 `quarantine_expired`. The entry lives on the host whose rules asked: a host that does not know the request passes the message to each peer until one does (a peer never passes it on again). A REST body can never carry a signed decision.

An agent answers with `amp-send.sh _provider@<tenant>.aimaestro.local "Re: approval" "approve" --reply-to <notice id> --context '{"decision":"approve","quarantine_id":"qtn_…"}'`.

**Gaps in the spec, and what AI Maestro does:**

- A mesh is one provider name (`aimaestro.local`) with one key per host. 07 assumes one key per provider; AI Maestro checks a notice against the key of the host that forwarded it, and the `.local` name has no DNS or well-known discovery of its own.
- `/api/v1/info` says `provider: "<tenant>.aimaestro.local"` while notices say `aimaestro.local` (07 rule 4 needs `from` to end with `.` + provider, so the tenant cannot be in it). The info field is left as it was.
- 07 does not say what the route answers for a message to `_provider`, nor the error codes of a refused answer; AI Maestro uses the 08 quarantine and validation codes above.
- A call or a chat message has no AMP message id, so its outcome notice has no `in_reply_to`; a call's approval request has no `held`.
- 07 does not say how a reviewer finds which provider instance keeps the entry; AI Maestro asks its peers.

## 18. As built: governance actions, first part (0.106.239, F118 step 3)

### 18.1 Scope of a rule

The engine knows `agent.create`, `agent.delete`, `agent.move` and `agent.mode` besides `message` and `call`. Two choices keep every existing file meaning what it meant:

- **A rule or exception without `actions` covers `message` and `call` only.** A governance action is governed only by a rule that names it. Without this, `deny * -> agent:payroll` (written to stop messages) would also stop deleting payroll.
- **The file's `default` applies to `message` and `call` only.** A governance action that no rule names goes ahead. A `"default": "deny"` file written for messaging does not stop every create and delete.
- A version 1 rule cannot name a governance action (`action` stays `message` or `call`): governance needs a version 2 file.

Reasons use words, not action names: "an unidentified person may not delete agent:payroll: blocked by keep-payroll".

### 18.2 Where each action is checked

Each check runs in the service that does the action, on the agent's host, before anything changes. So the dashboard, the API, the headless router and the agents CLI all meet it.

| Action | Service | Notes |
|---|---|---|
| `agent.create` | `createNewAgent`, `createSession` (a session for a name the registry does not know), `createDockerAgent`, `createCloudAgent` | `to` is the new agent by name, on its host |
| `agent.delete` | `deleteAgentById` (soft and hard), `unlinkOrDeleteAgentSession` with delete | The Doctor's repair passes as `system` |
| `agent.move` | `transferAgent` | A clone is checked as a move: the agent leaves for another host either way |
| `agent.mode` | `updateAgentById` and the wake request, only when the mode goes up | Order: plan only < supervised (also no setting) < trust edits < smart auto < full autonomy |

A deny answers 403 `forbidden` with the reason. An ask opens a quarantine entry (section 17) and answers 403 with its `quarantine_id`, as a call does. Once a reviewer approves, the same action by the same caller goes through once.

### 18.3 Who the caller is

With no login, the caller of the dashboard and the API is an unidentified person (`person`), which matches `*` and `person:*`. AI Maestro's own work passes as `system`. So rules for governance actions are written about the target (`to`), for example: ask `rel:manager` before anyone deletes or moves an agent of the finance team, or deny raising `agent:payroll` to full autonomy. An `agent:` or `person:<id>` in `from` does not match an API call yet.

### 18.4 Not in this part

- Paths that create or remove agents as a side effect, not as an operator's action: session discovery, AMP self-registration and self-delete, the help assistant, the meeting coach, imports on the receiving host.
- `agent.config` (needs F067's protected-file writer), `secret.use`, `secret.grant`, `sql.write` (F033 and F037 into the store, 17.6), `policy.edit` (no editor API yet).
- The agent layer from F067 profiles, closed teams as rules, `role:` and `org:` subjects, answers "for a time" and "always" as policy edits.

