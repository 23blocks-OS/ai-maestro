# F066 - Audit trail: what each agent did, who authorized it, and under which rules

**Status:** Todo (foundation for F067)
**Type:** Feature
**Created:** 2026-11-02

## Description

One record per agent action that answers four questions:

1. **What happened.** The agent, its host, the program and session, the tool, the command or target (clipped, secrets removed), and the result: done, denied by a rule, blocked by the sandbox, or stopped for approval.
2. **Who authorized it.** The source can be:
   - an allow rule or the permission mode (name the rule);
   - a person who answered an approval card (which person and which device; signed when it came from a paired phone);
   - another agent, through an AMP message (message id, sender, signature state, and whether the sender had operator authority);
   - a schedule, a task card, a canvas action or a webhook.
3. **What caused it.** The prompt or message that started the turn, so every action links back to the instruction behind it. Example: Juan typed it in the chat; Lola's message `msg_…` asked for it; the 02:00 schedule ran it.
4. **Under which rules.** A snapshot of the configuration at that moment:
   - the model;
   - the permission mode;
   - the program and its version;
   - the launch options;
   - the plugin version;
   - the SHA-256 hash of each file that governs the agent: `CLAUDE.md`, `.claude/settings.json`, `settings.local.json`, and the global `~/.claude/settings.json`.

   Each distinct version of those files is stored once, by hash. So "which rules was Lola running under at 14:03 on 3 March" has an exact answer.

### What exists today

- **The registry:** keeps the current `permissionMode`, `model` and `launchOptions`, but no history.
- **The Claude Code hook** (`scripts/claude-hooks/ai-maestro-hook.cjs`) sees `UserPromptSubmit`, `PostToolBatch`, `Notification`, `Stop` and `SessionStart`/`SessionEnd`. It writes them only to a debug log that is clipped and capped at 50 MB, which is not an audit.
- **Approval answers:** they go through `sendPermissionResponse` in `server.mjs` and are not recorded.
- **AMP messages:** each carries a verification record (`local.verification`, including `operator` for person senders, 0.106.54), but nothing links it to the actions it caused.
- **Refused AMP signatures** leave no readable record (B006).

## Why It's Needed

"An agent did this" is not an answer a company can accept. After an incident, a review or an audit, someone asks:
- who allowed this;
- what told the agent to do it;
- which rules applied at that time.

Jaime's helpdesk deployment had to build its own action log, transcript store and weekly summary, because AI Maestro has no central audit log (guest post, 2026-11-02). Every serious deployment will need the same.

## Business Case

- Regulated and corporate users (healthcare, finance, government) require an audit trail before they let agents act on real systems. This is a gate to the paid and enterprise direction.
- It makes every other control provable. A deny rule, an approval or a sandbox counts in an audit only if someone can show that it ran.
- It reduces support load, because "why did the agent do X" becomes a lookup.

## Implementation Plan

1. **Event format and store (S).**
   - One append-only JSONL file per agent per month, `~/.aimaestro/agents/<id>/audit/YYYY-MM.jsonl`, so it moves with the agent.
   - Each line holds the hash of the line before it. A changed or deleted line breaks the chain, and the check finds it.
   - No secret values (`redactSecrets`), commands clipped, no file contents.
   - Retention is configurable, one year by default.
2. **Actions from Claude Code (M).**
   - Add `PreToolUse`, `PostToolUse` and `PermissionRequest` to the hook.
   - Record the decision, plus the rule or mode that allowed or denied the action.
   - Give every action the id of the turn that caused it.
3. **Who authorized it (M).**
   - **Approvals:** `sendPermissionResponse` records the responder: dashboard browser, phone device id, or a signed person request.
   - **AMP:** the message id and its verification record join the turn that the message started.
   - **Other sources:** schedules, task cards, canvas actions and webhooks record themselves as the source.
4. **Configuration snapshots (S).** On every wake, and whenever a governing file changes, store the configuration and the file hashes. Keep each distinct file version once under `~/.aimaestro/agents/<id>/audit/config/<sha256>`.
5. **Timeline and search (M).**
   - An Audit tab per agent: actions with their source and rules, filtered by result, tool and source.
   - An org view that asks every host (the owning-host pattern).
   - Export to CSV and JSON.
6. **Other programs (M).** Codex and Grok Build from their transcripts and hooks, where those exist. Mark what each program can and cannot report.
7. **Send it off the host (S, optional).**
   - Forward events to syslog, a webhook, or a SIEM (security event store) such as Microsoft Sentinel or Splunk.
   - A copy on another machine is the real protection against tampering.
8. **Fold in B006.** Refused signatures become audit events.

**Limits to state plainly:** agents on one host run as the same OS user (B021), so an agent can edit its own audit files. The hash chain detects the change but does not prevent it. To stop tampering, send the events to another host or a SIEM, or run the agent in a container.

**Effort:**
- Steps 1–4: about one 6-day cycle.
- Steps 5–7: about one more.

**Related:** F067 (governance), B006, F021, F042, F048, B021, AMP spec 13.
