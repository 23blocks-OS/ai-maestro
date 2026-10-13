# F040 - Waking and creating agents: launch options declared per tool, one-click wake

**Status:** In Progress (step 1 shipped in 0.69.0; steps 2 to 4 open)
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
8. The tool list is hard-coded: it includes Cursor (the editor, never supported as an agent here) and lacks Gemini, OpenCode and OpenClaw, which AI Maestro recognises. Nothing says whether a tool is installed.
9. Wake is triggered from seven places.
10. The deployment step speaks in infrastructure terms ("direct", "Docker", "Fargate units").

## The new flow

- **Wake is one click** with the saved setup ("Waking Aria on Claude Code, asks before changes"). The dialog opens only when something needs a decision (first wake, or the tool is not installed) or from "Wake with...". It shows only the tool and the freedom level, with "Remember this for Aria".
- **A "How it runs" panel** (tool cards with a ready/not-installed status and capability chips; the generated options form with the command preview) is used when creating and when editing.
- **Create is one page with four cards**: Who, What runs it, Where (this Mac by default; other computers, Docker and AWS behind "change"), Review with "Create and wake". The robot conversation can stay as a short celebration after creating.
- **Freedom per tool** (from the code today): Claude Code all of Careful/Balanced/Hands-off/Read-only; Grok Build all four; Copilot CLI Careful and Hands-off only; Codex not mapped yet; Pi never asks, so no choice is offered.
- **Readiness check** per computer: installed, version, and the runtime (Node for Pi). Signing in is not checked: every tool asks the user itself, and AI Maestro shows what a tool asks as a card (below).
- **Whatever a tool asks becomes a card.** AI Maestro does not handle login. Captured by launching Copilot CLI 1.0.96 (no sign-in): "Do you trust the files in this folder?" (3 options), "What account do you want to log into?" (3 options), "How do you want to sign in?" (2 options). Plain numbered menus; a digit selects immediately (verified), like Grok and Codex, so one parser in `lib/pane-approval.mjs` covers them and permission questions later. It must run in the same kind of shell an agent session uses, not the server's own shell (different PATH).

## Decisions

Taken by Juan: launch options come from a declaration per tool; AI Maestro does not handle login; whatever a tool asks is shown as a card, built from real screens captured by launching the program (no sign-in needed).
Recommended and being followed unless Juan objects: one-click wake by default; three plain stops plus a Read-only switch (Smart auto moves under "More" for Claude); one-page create; show all tools with their status; remove Cursor; start with step 1.

## Rollout

1. **Quick fixes plus the declaration for permission modes** (about 1 day): wake opens on the agent's own tool; "remember" saves it; always send the chosen mode; only offer modes the tool supports; drop Cursor; list recognised tools as terminal-only.
2. **"How it runs" panel**: the declaration covers every option; generated form with command preview; tool cards; three-stop freedom; one-click wake (2 to 3 days).
3. **New create page** (2 to 3 days).
4. **Readiness check** (2 days).
5. **Alongside:** Copilot cards from the real screens (trust, account, how to sign in; digits select immediately, like Grok and Codex), Pi chat view from its documented session format, Codex mapping.

## Related

F028 (Grok), F036 (Pi, OpenClaw), F038 (Copilot CLI), F039 (a way back in), F033 and F037 (cards).

## Progress

- 2026-10-12, 0.69.0 - **Step 1 shipped.** The wake dialog opens on the agent's own tool; "Remember this" saves the tool and mode on the agent; the chosen mode is always sent (fixes the "Supervised is ignored" gap); permissions are visible and limited to what each tool supports; Cursor dropped, Gemini/OpenCode/OpenClaw listed as terminal only; one request builder for all three wake screens; pure shared modules (`lib/program-choices.ts`, `lib/program-names.ts`). A test found and fixed a hazard on the way: a sandbox wrapper such as `claude-sandboxed.sh` must never match plain Claude Code in the dialog, and "remember" never replaces a wrapper.
- 2026-10-12, 0.69.1 - **Copilot cards shipped**: the trust, account and sign-in-method questions appear as cards in the chat (`parseCopilotApproval` in `lib/pane-approval.mjs`, tested on four real captures). A digit selects an option immediately, so a click sends the number.
- 2026-10-12, 0.69.2 - **Layout fixed after a first look in a real browser** (`agent-browser`): the dialog now fits one screen; one warning for hands-off; Advanced collapsed. **Found:** the phone layout cannot wake an agent at all (it lists only online agents); needs its own design.
- 2026-10-12, 0.70.0 - **Step 2 (declaration, generated form, command preview) shipped.** Declarations for Claude, Grok, Copilot and Pi from their `--help`; options remembered on the agent; strict value patterns. **Left of step 2:** the plain-words freedom stops and one-click wake with "Wake with..."; Codex, Gemini, OpenCode options once verified on a real install; models listed from the tool (`pi --list-models`).
- 2026-10-12, 0.71.0 - **Step 2 finished: one-click wake and plain-words freedom stops** (Shift-click to choose; Careful/Balanced/Hands-off + Read-only mapped per tool). Open: a visible "Wake with..." control, the Hands-off "I understand" tick (skipped on purpose), the phone layout cannot wake at all.
- 2026-10-12, 0.72.0 - **Step 3, first part: the create wizard's summary is the launch choice** (tool, Careful/Balanced/Hands-off, options, command preview), shared with the wake dialog; creating and waking build the launch command in one place (`lib/launch-command.ts`). Open: fold the chat-style wizard into one page, Docker/AWS tool choice, readiness check (step 4).
- 2026-10-12, 0.73.0 - **Step 4 shipped: readiness check** (installed / version / Node for Pi, per host, as an agent's shell sees it; shown on the tiles and as one line). Sign-in is not checked by design. Open: fold the chat-style create wizard into one page; Docker/AWS tool choice; a visible "Wake with..." control.
- **Open:** step 2 (every option declared per tool, generated form with the command preview, plain-words freedom stops), step 3 (one-page create), step 4 (readiness check), the Copilot cards from the real screens, Pi's chat view.
