# F067 - Agent governance: profiles, protected rules, escalation and a weekly check

**Status:** Todo (after F066)
**Type:** Feature
**Created:** 2026-11-02

## Description

Jaime Peláez runs seven agents on a company helpdesk with AI Maestro (guest post "Governing AI Agents in a Company", 2026-11-02). He governs them with six layers:
1. a corporate identity per agent;
2. an operating-system sandbox;
3. separate credentials;
4. supervised mode with an allow list;
5. common deny rules;
6. a scope hook.

He also locks the rule files (changes need his fingerprint), keeps audit records and runs a weekly review. Most of this he built by hand around AI Maestro. This item moves the parts that belong in AI Maestro into the product:

1. **Governance profile per agent.** One place in AI Maestro that holds an agent's role and limits:
   - allowed folders and domains;
   - the allow list (actions that need no approval) and the deny rules;
   - the sandbox settings;
   - the highest permission mode the agent may run in.

   AI Maestro writes the profile into the program's own settings (Claude Code `permissions.allow`/`deny` and `sandbox`). It also applies the profile through a scope check in the AI Maestro hook, which blocks an action outside the agent's folders or domains, records it (F066) and tells the coordinator or manager.
2. **A baseline for every agent.** Common deny rules that every profile starts from. No agent edits its own `CLAUDE.md`, its `.claude/` folder or `~/.claude/`. No agent opens another agent's folder, reads credential files (`.env`, `*.pem`, `*.key`), or runs `sudo` or `git push --force`. A coordinator profile can lift specific rules, with approval.
3. **Protected rule files.** An agent's `CLAUDE.md` and settings change only through AI Maestro:
   - The change is shown as a diff and approved by a person. The approval is signed on their paired phone with the device keys from AMP spec 13, like Jaime's fingerprint step.
   - AI Maestro then writes the file and records the new hash (F066).
   - Drift detection compares each file with its last approved hash, and reports any change made outside this path.
4. **Permission mode policy.** A highest mode per agent or team. A wake above that mode needs approval. Full autonomy is flagged in the dashboard.
5. **No approval waits forever.** When an approval card stays unanswered, AI Maestro raises it in steps: a push to the manager first, then a phone call (the `call-a-person` skill) after a set time, and then the agent's coordinator. Jaime's first problem was exactly this: an agent that waits and tells nobody. Codex agents also need the "Needs you" status, which they do not get today.
6. **The allow list learns from use.** A weekly report lists the actions people approved. Approving one with "always allow for this role" adds it to the profile. The report also lists blocked actions, so false alarms get corrected.
7. **Weekly governance check.** A local schedule checks:
   - each agent's permission mode against its profile;
   - the hash of each protected file;
   - agents that have no profile;
   - the week's blocked attempts;
   - changes to the model or the mode.

   The result goes to the operator as a message and a canvas report.
8. **Onboarding.** A new agent gets a profile before its first wake: role, folders, domains, credentials and mode. The dashboard does not wake an agent that has no profile when the org requires one.

### Outside AI Maestro (document, do not build)

- A corporate identity per agent, such as a Microsoft Entra ID account with least privilege.
- Privileged Identity Management for temporary admin rights.
- Conditional access.

Write a guide for these, as Jaime's post does.

## Why It's Needed

AI Maestro already supplies some layers: permission modes, approval cards, the "Needs you" status and signed messages. Everything else Jaime had to build himself, and a company that tries agents for the first time will not. Governed autonomy, where the agent works alone inside its job and a person approves anything outside it, is what lets a company give agents real access.

## Business Case

- Governance decides whether a company can deploy agents at all. It is the strongest argument for teams, enterprise and regulated customers (healthcare first, from Jaime's case).
- No agent dashboard we know of manages agent rules as signed, versioned, drift-checked configuration.
- It reuses what exists:
  - the hook;
  - approval cards;
  - person device keys and signed requests;
  - `call-a-person`;
  - schedules;
  - canvas pages;
  - the audit trail (F066).

## Implementation Plan

1. **Profiles and baseline (M).**
   - Data: `governance` on the agent registry entry, plus org templates by role.
   - Writers for the Claude Code settings and sandbox. Other programs get what their settings support, with the rest marked "not enforced".
2. **Scope check in the hook (S).** Block actions outside the agent's folders and domains, record them (F066), and send an AMP alert.
3. **Protected files (M).**
   - Diff, approval signed on the phone, write, hash, and drift detection.
   - On macOS, optionally lock the files with the `uchg` flag. Any process of that user can remove that flag, so it prevents accidents, not determined agents (B021). Containers are the real lock.
4. **Mode policy and escalation (S).** Use the existing schedules and `call-a-person`.
5. **Learning allow list and weekly check (M).** Built on F066 data, reported as a canvas page plus a message.
6. **Governance guide (S).** Corporate identity, conditional access, sandbox and containers. Jaime's post is the starting point.

**Limits to state plainly:**
- Profiles, deny rules and hooks are enforced by the agent program and by AI Maestro, not by the operating system. An agent that runs as the same OS user can work around them (B021).
- The sandbox and containers are the layers that hold.
- The governance view must show which layer is enforced for each agent.

**Effort:** about two 6-day cycles after F066.

**Related:** F066, B021, F065 (secret permissions), F040 (launch options), F042 (message policy), F048 (host security view), AMP spec 13.
