# F040 - Waking and creating agents: launch options declared per tool, one-click wake

**Status:** In Progress (design v2 written 2026-10-12; step 1 starting)
**Type:** Feature / UX redesign
**Created:** 2026-10-12
**Requested by:** Juan, 2026-10-12 ("selecting permissions on agent wake up is a nightmare ... evaluate that UX and UI and design a better flow")
**Design page (visuals):** `~/.aimaestro/agents/<ai-maestro agent>/canvas/wake-create-ux-redesign.html`

## The idea

Creating or waking an agent is one job: **collect the options a given CLI supports and turn them into the command that starts it** (Juan, 2026-10-12). So each tool gets a small *declaration* of the options it accepts. The screens are generated from it, the resolved options are saved on the agent, and a line under the form shows the exact command that will run.

A declaration says, per option: an id, a label in plain words, a type (choice, text, toggle), the choices, how each choice becomes a flag or an environment variable (or a runtime switch), a default, and a danger mark. Checked against each CLI's own `--help` (2026-10-12): Copilot CLI offers `--model`, `--allow-all-tools`, `--continue`, `--resume`, `--add-dir`; Pi offers `--provider`, `--model`, `--thinking`, `--continue`, `--resume`, `--no-session`, `--tools`; Claude Code and Grok Build have permission modes; Codex has sandbox and approval flags that are not mapped yet (verify on a real install first); Terminal only has none.

Care points: "freedom" means different things per tool, so a plain-words layer (Careful, Balanced, Hands-off, plus a Read-only switch) sits on top and each tool maps it to its own flag, with the real flag always visible in the preview. Some options are environment variables or files, not flags. Some flags are AI Maestro's own (channels, telemetry, session name) and are never offered. Model lists should come from the tool where it can tell us. Identity (name, role, team, avatar, folder, computer) is not a launch option and stays in its own cards.

## What is wrong today (read from the code, 2026-10-12)

1. The wake dialog always opens on Claude Code (`setSelectedProgram('claude')` on every open), whatever the agent runs.
2. The tool picked at wake is a one-time override (`programOverride || agent.program`); nothing saves it.
3. The create wizard never asks which tool (`const program = 'claude-code'`).
4. Permissions are behind a collapsed chevron and only for Claude; in the wizard "Trust Level" sits inside the Docker advanced panel. Grok and Copilot apply a mode but offer no way to set it.
5. The same five Claude-named modes are shown for every tool (Copilot supports 2 of them, Pi none, Codex none is mapped).
6. **Safety gap:** picking "Supervised" at wake sends nothing (`AgentList.tsx` omits it), and the server uses `params.permissionMode || agent.permissionMode`, so an agent stored as Full autonomy still starts with no questions asked. Narrow (needs a stored non-default mode, for example from the Docker wizard or the API) but real.
7. "Execution mode: Terminal / Streaming" appears with no explanation.
8. The tool list is hard-coded: it includes Cursor (the editor, never supported as an agent here) and lacks Gemini, OpenCode and OpenClaw, which AI Maestro recognises. Nothing says whether a tool is installed or signed in.
9. Wake is triggered from seven places.
10. The deployment step speaks in infrastructure terms ("direct", "Docker", "Fargate units").

## The new flow

- **Wake is one click** with the saved setup ("Waking Aria on Claude Code, asks before changes"). The dialog opens only when something needs a decision (first wake, tool missing or not signed in) or from "Wake with...". It shows only the tool and the freedom level, with "Remember this for Aria".
- **A "How it runs" panel** (tool cards with a ready/not-installed status and capability chips; the generated options form with the command preview) is used when creating and when editing.
- **Create is one page with four cards**: Who, What runs it, Where (this Mac by default; other computers, Docker and AWS behind "change"), Review with "Create and wake". The robot conversation can stay as a short celebration after creating.
- **Freedom per tool** (from the code today): Claude Code all of Careful/Balanced/Hands-off/Read-only; Grok Build all four; Copilot CLI Careful and Hands-off only; Codex not mapped yet; Pi never asks, so no choice is offered.
- **Readiness check** per computer: installed, version, Node (Pi), and signed in where the tool lets us ask; "sign-in not checked" otherwise. It must run in the same kind of shell an agent session uses, not the server's own shell (different PATH).

## Decisions

Taken by Juan: launch options come from a declaration per tool; Copilot and Pi cards need no sign-in (launch the program, capture what it asks, build the card from those real screens).
Recommended and being followed unless Juan objects: one-click wake by default; three plain stops plus a Read-only switch (Smart auto moves under "More" for Claude); one-page create; show all tools with their status; remove Cursor; start with step 1.

## Rollout

1. **Quick fixes plus the declaration for permission modes** (about 1 day): wake opens on the agent's own tool; "remember" saves it; always send the chosen mode; only offer modes the tool supports; drop Cursor; list recognised tools as terminal-only.
2. **"How it runs" panel**: the declaration covers every option; generated form with command preview; tool cards; three-stop freedom; one-click wake (2 to 3 days).
3. **New create page** (2 to 3 days).
4. **Readiness check** (2 days).
5. **Alongside:** Copilot cards from the real screens (trust, account, sign-in method; digits select immediately, like Grok and Codex), Pi chat view from its documented session format, Codex mapping.

## Related

F028 (Grok), F036 (Pi, OpenClaw), F038 (Copilot CLI), F039 (a way back in), F033 and F037 (cards).
