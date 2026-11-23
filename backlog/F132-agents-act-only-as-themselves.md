# F132 — An agent acts only as itself (GHSA-mmf3-jr8g-c546)

**Status:** In Progress
**Type:** Feature (security hardening)
**Created:** 2026-11-23

## Description

Adopt the fixes Alejandro (GitHub alejo-vargas) reported and built for advisory GHSA-mmf3-jr8g-c546 on 23blocks-OS/ai-maestro (private until the coordinated release). Four gaps, all on one host:

1. The sender and the mailbox come from the request (`from`, `?agent=`), so an agent can send as another agent and read its inbox.
2. Re-registering an existing name needs no proof, so an agent can take another agent's name and mail.
3. A file dropped into an inbox directory is delivered as mail.
4. An agent can approve, move or switch off message rules, including approving its own held message.

His fixes are on the advisory's private fork (branches `sec/01-caller-identity`, `sec/02-register-proof`, `sec/03-inbox-integrity`, `sec/04-rules-integrity`, `sec/integration`, write-ups on `sec/notes`) and a patch for agentmessaging/claude-plugin. Based on public main v0.106.261.

## Why It's Needed

AI Maestro has no app-level authentication by design: the network is the trust boundary. But on one host, a mistaken or misbehaving agent should not be able to act as another agent. That protects one family's agents from each other's mistakes; it does not need per-agent OS isolation.

## Business Case

- Risk: an agent impersonating another agent, or reading its mail, is the class of bug that loses trust in the product.
- An outside contributor did careful work with tests; taking it well brings more contributions.

## Decisions (Juan, 2026-11-23)

Independent review: code careful, tests good, ports to private main with no code conflicts (cherry-pick, not merge), his 196 tests pass on the port.

1. **Session-mode caller binding** (an identified agent sends only as itself, reads only its own inbox; unidentified callers such as the dashboard, the email bridge and peers keep today's trust): ACCEPT. `GET /api/caller`: ACCEPT.
2. **Approver binding** (an agent cannot approve its own held message, or one it is not an approver of): ACCEPT. **Last-good rules from memory** (a planted `policy.json.last-good` plus a deleted `policy.json` turned rules off): ACCEPT. **Configurable rules path, fail-closed mode**: ACCEPT as opt-in.
3. **Strict mode and the operator token**: NOT shipped now. Merged into F058 (the opt-in internet access token), so there is one token, not two.
4. **Re-registration proof**: the takeover fix is real, but its proof string, nonce challenge and `proof_required` / `invalid_proof` codes are new AMP wire format. Protocol first: the AMP spec (`spec/03-registration.md`, reusing the proof of possession of spec 11 where possible) gets it before the implementation. Session and key gating may ship with it.
5. **Inbox receipts and quarantine**: opt-in only (`AIMAESTRO_INBOX_INTEGRITY=on`), and only after the 5 s sweep is made incremental and off the event loop (this Mac: 25,338 inbox files, a stat pass 126 ms on the main thread; the first start rewrites every file). Last in the order. The atomic inbox write may ship on its own.
6. **Signatures required on local sends**: stays opt-in. Count unsigned senders and mismatched keys across the fleet first.
7. **Plugin**: the claude-plugin patch lands in agentmessaging/claude-plugin through its own private advisory, then the plugin builder is rebuilt; the hand-edited ai-maestro-plugins patch is dropped (the next build would revert it). The direct-write removal waits with item 5.
8. **Disclosure**: fixes land in the private repo; the public release, the AMP spec change and the advisory are published together. Credit Alejandro; keep his authorship (cherry-pick with `-x`).

## Implementation Plan (order: protocol, then implementation)

1. AMP spec: re-registration proof (local branch of agentmessaging/protocol, published with the release).
2. Rules: last-good from memory, policy-file path and fail-closed opt-ins (sec/04, the small part of sec/01 it needs).
3. Caller binding in session mode, `GET /api/caller`, approver binding (sec/01, rest of sec/04).
4. claude-plugin: session-bound scripts (patch commits 1-3), through its advisory; rebuild the plugin builder.
5. Re-registration gating and proof (sec/02) once step 1 is merged; plugin proof signing.
6. Inbox integrity, opt-in, after the sweep is incremental (sec/03).
7. Coordinated release: public sync, AMP spec, advisory published with credit.

Each step: its own branch and PR, version bump, CHANGELOG, `yarn test`, build in a worktree, deploy to the fleet, a live check that agents still message.

## Step log

- 2026-11-23: advisory read; fork branches found; independent review done; decisions above recorded.
