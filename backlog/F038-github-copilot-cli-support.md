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
- **Not checked with a login:** a full conversation turn (needs a login and a subscription).
- **Found 2026-10-14 (Copilot CLI 1.0.97): a login-free mode exists.** Bring-your-own-provider (`COPILOT_PROVIDER_BASE_URL`, `COPILOT_PROVIDER_API_KEY`, `COPILOT_MODEL`, with `COPILOT_OFFLINE=true`) skips GitHub authentication, so Copilot can run against a local fake OpenAI-compatible model. That produced genuine `events.jsonl` files and permission screens without anyone's credentials; items 4 and 5 were built on them.

## Shipped in 0.68.1

Program recognition (`copilot`, `copilot-cli`, `github-copilot`, `github-copilot-cli`; whole name only), the wake dialog entry, `--allow-all-tools` for full autonomy, `--model` from the agent's model, docs honest about the tier, and tests.

## Work

1. **Finish the end-to-end test** with a login: send a message through AI Maestro, confirm the delivery check passes and the reply appears (the person logs in; the agent never handles the token).
2. ~~**The trust question as a card.**~~ **Done in 0.69.1**, for the three questions Copilot asks by itself (trust the folder, which account, how to sign in), built from real captured screens (`tests/fixtures/approval/copilot-*.txt`, taken without signing in). The "may I run this command?" card is item 5.
3. **Status.** ~~Read `events.jsonl`.~~ **Done as a reader** (`copilotLiveStatus` in `lib/transcript-copilot.mjs`: working while a turn is open, waiting on an unanswered `permission.requested`, idle otherwise; a log with no write for 10 minutes is not trusted as working). It feeds the chat's working pulse and the session list's active/idle, the way Codex does. Not done: the working/needs-you feed behind the sidebar (`getActivity`) does not read it yet, and hooks (the other option) are unused.
4. ~~**Chat reader** for `~/.copilot/session-state/*/events.jsonl` (F028 is the template).~~ **Done**: `lib/transcript-copilot.mjs`, built and tested on real 1.0.97 `events.jsonl` files (user and assistant messages, thinking, shell/create/edit tool calls and results, errors, multi-turn and resume). Session found by the working directory in `session.start`. Unseen: sub-agent tasks, skills, MCP tools, `/compact`, plan mode, and anything only Copilot's own models produce (the files came from a fake model).
5. ~~**Approval cards** for tool permission prompts, parsed from the pane.~~ **Done** for "Do you want to run this command?" and "Do you want to edit/create <file>?", from real captured screens (`tests/fixtures/approval/copilot-run-command.txt`, `-edit-file.txt`, `-create-file.txt`). Keys 1 and 2 answer at once; key 3 opens a feedback text field, so the next chat message is the reason. Unseen: URL, MCP and path-outside-the-folder questions.
6. **AMP.** A wrapper or skill so a Copilot agent can send and read messages (the issue asks for this); `agent-messaging` already works for any agent that can run shell commands.
7. **Listing.** Keep docs and the website at the level actually tested.

## Related

F028 (Grok Build, the template), F031/F032 (the lesson), F036 (Pi and OpenClaw, same staging), issue #572.
