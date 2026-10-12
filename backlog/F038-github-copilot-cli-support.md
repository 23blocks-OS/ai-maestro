# F038 - GitHub Copilot CLI: from "runs in the terminal" to real support

**Status:** In Progress (launch shipped in 0.68.1; the rest is open)
**Type:** Feature
**Created:** 2026-10-12
**Requested by:** a user, issue #572 ("we need to listen to users", Juan, 2026-10-12)

## Description

Issue #572 asks for GitHub Copilot CLI as a recognised agent. Many teams already pay for Copilot, so it lowers the cost of trying AI Maestro. F032 had removed the *claim* of Copilot support because AI Maestro never had any. This item adds the support itself, in stages, and only claims what has been tested (the lesson of F031/F032).

The issue names `gh copilot`. That is the older extension (suggest and explain only). The agent is the separate `copilot` command from github/copilot-cli (npm `@github/copilot`), which is what this item supports.

## What was checked (Copilot CLI 1.0.96, 2026-10-12, tmux, isolated home)

- Starts and draws its screen; exits with Ctrl+C.
- **First launch in a new folder asks "Do you trust the files in this folder?"** (1 Yes, 2 Yes and remember, 3 No). A freshly woken agent sits there until someone answers.
- Flags confirmed with `--help`: `--model`, `--resume`, `--continue`, `--allow-all-tools`, `--allow-all-paths`, `--allow-all-urls`, `--allow-all`, `--yolo`, `--allow-tool`, `--deny-tool`, `--add-dir`, `-p/--prompt`.
- From GitHub's docs: config and sessions under `~/.copilot` (`COPILOT_HOME` overrides); sessions as `session-state/<id>/events.jsonl`; hooks in `~/.copilot/hooks`, `~/.copilot/settings.json` and `.github/hooks`; auth through `/login` or `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`; `COPILOT_ALLOW_ALL=true` allows everything and also trusts the working directory without asking (and loads its hooks, so it is not used).
- **Not checked:** a full conversation turn (needs a login and a subscription).

## Shipped in 0.68.1

Program recognition (`copilot`, `copilot-cli`, `github-copilot`, `github-copilot-cli`; whole name only), the wake dialog entry, `--allow-all-tools` for full autonomy, `--model` from the agent's model, docs honest about the tier, and tests.

## Work

1. **Finish the end-to-end test** with a login: send a message through AI Maestro, confirm the delivery check passes and the reply appears (the person logs in; the agent never handles the token).
2. ~~**The trust question as a card.**~~ **Done in 0.69.1**, for the three questions Copilot asks by itself (trust the folder, which account, how to sign in), built from real captured screens (`tests/fixtures/approval/copilot-*.txt`, taken without signing in). Still open: the "may I run this command?" card, once someone has seen that screen.
3. **Status.** Use Copilot's hooks to report working/idle/needs-you, as Grok does with Claude-style hooks, or read `events.jsonl`.
4. **Chat reader** for `~/.copilot/session-state/*/events.jsonl` (F028 is the template).
5. **Approval cards** for tool permission prompts, parsed from the pane.
6. **AMP.** A wrapper or skill so a Copilot agent can send and read messages (the issue asks for this); `agent-messaging` already works for any agent that can run shell commands.
7. **Listing.** Keep docs and the website at the level actually tested.

## Related

F028 (Grok Build, the template), F031/F032 (the lesson), F036 (Pi and OpenClaw, same staging), issue #572.
