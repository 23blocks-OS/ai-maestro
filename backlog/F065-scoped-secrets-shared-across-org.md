# F065 - Secrets with a scope (agent, host, organization) and permissions

**Status:** Todo (spec drafted: `docs/SPEC-SHARED-SECRETS.md`)
**Type:** Feature
**Created:** 2026-11-02

Extends F033. Needed by F059 (voice provider keys) and F064 (phone numbers).

## Description

Today a secret lives in one host's keychain and every agent on that host can use it. This item gives each secret a scope and makes org secrets usable from every host without copying them or ever exposing the value.

- **Phase 1, the secret.**
  - Each secret has a scope: one agent (the default), every agent on its host, or the whole organization.
  - When an agent asks for a secret, the card offers the three scopes, with "This agent only" pre-selected.
  - Settings > Secrets lists every host's secrets: names, scope, hint and last use, never values.
  - Settings > Voice providers is the same list filtered to provider keys, with a Test button.
  - Another host uses an org secret by asking its home host. The request is signed with the requesting host's new key; the answer is sealed to that host's key, used in memory only, and logged.
- **Phase 2, the permissions.**
  - Grants: which agents, teams, people's agents, hosts or AI Maestro features may use a secret, optionally limited to a command pattern, an expiry date or hours of use.
  - An agent without a grant can ask for access, and its manager approves on the app.
  - Creating an org secret, widening a scope or adding a grant needs a signature from a person's phone.
  - A history of every use and every change.

## Why It's Needed

- **Voice keys are needed on every host.** Voice (F059) and phone numbers (F064) need provider keys on whichever host a call starts on. Today the operator would have to enter the same key on every host, or keep it in the browser.
- **Host-wide is too wide.** Agents on one host are not equally trusted, for example a customer project and our own infrastructure.
- **Asking for a scope fits.** The secret card already exists; adding a scope to it is the natural place for the question.

## Business Case

- One place to manage the keys that bring-your-own-keys depends on. Without it, BYOK means retyping keys on every host and device.
- Per-agent and per-team permissions are what a company asks for before letting agents near production credentials. That matters for teams and enterprise, the paid direction.
- It reuses what exists: the vault, the secret card, the person device keys from AMP spec 13 for approvals, and the owning-host pattern for cross-host reads.

## Implementation Plan

Full design, threat model and order of work: `docs/SPEC-SHARED-SECRETS.md`.

- **Phase 1 (about one 6-day cycle):**
  - secret records and scoped keychain names; existing secrets migrate to host scope;
  - scope on the request and the card;
  - Settings > Secrets across hosts;
  - host signing and sealing keys, pinned in Settings > Hosts;
  - `POST /api/secrets/resolve`, with signed requests and sealed answers;
  - `useSecret()` for server features, plus an audit log;
  - Settings > Voice providers, and the memory classifier key moves into it.
- **Phase 2 (about one cycle):**
  - grants and their limits;
  - `aim-secret request-access`, with its card and push;
  - phone-signed approvals;
  - the history view.

**Risks:**
- Host keys add the first cryptographic check between hosts. It must stay limited to the secret channel, not turn into a login.
- macOS keychain writes fail when pm2 runs outside the login session (`docs/SECRETS.md`). The private host keys are stored there too, so the same fix applies.

**Decisions for Juan:**
- fetch on use (recommended) or copy to every host;
- phone signature for widening (recommended);
- existing secrets become host scope (recommended).
