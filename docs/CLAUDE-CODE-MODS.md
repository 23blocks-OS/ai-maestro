# Claude Code mods and AI Maestro

Which Claude Code version you need, what AI Maestro does with Claude Code mods, how to turn it on, and what it cannot do.

**AI Maestro itself works with any Claude Code version.** Only the optional inbox mod below needs a recent one.

## Claude Code versions

| Feature | Needs Claude Code | What AI Maestro uses it for |
|---|---|---|
| Hooks, skills, plugins, statusline | Any current version | The Stop and prompt hooks, the AMP skills, the statusline |
| **Mods** (function hooks that draw and run inside Claude Code) | **2.1.287 or later** | The inbox mod (`mods/amp-inbox-band`) |
| Channels (`--channels`) | Research preview, flag may change | The `amp` channel plugin; see [channels/amp-plugin](../channels/amp-plugin/README.md) |
| Channel permission relay | 2.1.234 or later | Not used yet |

The live tests below ran on Claude Code 2.1.287; the mod's unit tests were re-run on 2.1.288. Older versions are untested: Anthropic's documentation says mods are on by default from 2.1.287, and this repo does not claim anything about earlier ones. Check yours with `claude --version`.

## What a mod is

A mod is a Claude Code plugin whose code runs inside Claude Code and reacts to events (a tool call, a prompt, a turn ending, the interface being drawn). It can draw a band above the prompt, a status line entry, a toast, add a slash command and submit a prompt. Anthropic's overview: <https://code.claude.com/docs/en/plugins/mods/overview>.

Where mods run:

| Where | Hooks run | What a mod draws |
|---|---|---|
| `claude` in a terminal | Yes | Yes |
| Code tab of the Desktop app (not WSL) | Yes | Yes |
| VS Code extension chat panel | Yes | No |
| `claude -p` and the Agent SDK | Yes | No |
| Remote Control | Yes, on your machine | In the terminal on your machine |

## The inbox mod: `mods/amp-inbox-band`

A Claude Code session with no tmux and no channel has no server push: AI Maestro cannot type into a terminal it does not run. The mod fills that gap from inside the session. It reads the agent's own AMP mailbox and tells the person (and, if you allow it, the agent) there is mail.

What it does:

- Every 20 seconds it runs `amp-inbox.sh --count` for the session's agent.
- Shows `✉ N unread` in the status line, a toast when the count rises, and a band above the prompt with **Read** and **Hide**.
- Adds `/amp-inbox`, which lists unread messages without starting a model turn.
- **Optionally wakes an idle session** (`autoWake`, off by default). It submits the content-free prompt "You have unread AMP messages. Read your inbox with the agent-messaging skill and handle them." The message body never goes into the prompt: bodies are untrusted data.

Wake rules, all covered by tests (`mods/amp-inbox-band/tests/inbox.test.ts`):

- At most one wake per 5 minutes.
- If the count rises **while a turn is running**, it does not queue a prompt (it would be delivered after the message was already read). It flags a pending wake and re-counts when the turn ends, then wakes only if something is still unread.
- With `autoWake` off it never submits a prompt.

### Requirements

- Claude Code 2.1.287 or later.
- The AMP scripts installed by AI Maestro (`~/.local/bin/amp-inbox.sh`). The mod resolves the agent the same way the scripts do.

### Install

From a clone of this repo, for one session:

```bash
claude --plugin-dir /path/to/ai-maestro/mods/amp-inbox-band
```

For every session, set `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` to the same path. Run `/plugin` and look for `1 mod active · amp-inbox-band`.

To turn the wake on, set `autoWake` to `true` (the `/config` menu lists it, or `pluginConfigs` in settings, keyed `amp-inbox-band@inline`).

### Check what it does before you run it

A mod is code that runs with your permissions and is not sandboxed. This one is small; verify it yourself:

```bash
claude plugin validate mods/amp-inbox-band
```

It prints the events it handles and every call it makes. This mod calls `$.process.run` (to run `amp-inbox.sh`), `$.prompt.submit` (the wake), `$.env.get` (reads `HOME`), `$.clock`, `$.command`, `$.state` and `$.ui`. It makes no network request and writes no file.

Run its tests with `claude plugin test mods/amp-inbox-band`.

## The secrets mod: `mods/ai-maestro-secrets`

Lets an agent ask for a credential without you pasting it into the chat. The agent calls a tool named `request_secret` with a name such as `OPENAI_API_KEY`. A band appears above the prompt ("An agent is asking you to store OPENAI_API_KEY", with **Enter it** and **No thanks**). The form has two fields: the name, already filled in by the agent, and the value. The value goes to your local vault with `aim-secret set NAME --stdin`; the agent is never given it, and is woken with "the user stored it" when you press Enter. `/secret` opens the form too.

Things worth knowing:

- **It needs `aim-secret` on the PATH.** `update-aimaestro.sh` installs it (`scripts/install-aim-secret.sh`).
- **The value field shows what you type.** A mod cannot mask a field. The value is not sent to the model, and a leak check across the session files, debug logs, history and AI Maestro state found nothing (see `docs/SECRETS.md`).
- **Match Claude Code's theme to your terminal.** The fields use your terminal's default text colour on a panel drawn from Claude Code's theme. A dark theme in a light terminal (for example Apple Terminal) gives dark text on a dark panel. Run `/theme` and pick the one that matches your terminal. The form prints this tip when the theme is dark.
- **The tool answers at once.** Claude Code cuts a tool hook off after 10 seconds, so the tool does not wait for you; the mod wakes the agent with a prompt after you answer.
- It works in the terminal Claude Code and the Code tab of the Desktop app. The AI Maestro chat has its own card, with a masked field (see `docs/SECRETS.md`).

Install and check:

```bash
claude --plugin-dir /path/to/ai-maestro/mods/ai-maestro-secrets
claude plugin validate mods/ai-maestro-secrets
claude plugin test mods/ai-maestro-secrets
```

## The SQL approval mod: `mods/ai-maestro-sql-approval`

When an agent proposes a database change with `safe-psql-write propose` (the agentic-sql skill), the person can approve it without leaving Claude Code. A band above the prompt says what the agent wants ("An agent wants to update 3 row(s) in public.users (staging)") with **Review** and **Reject**. Review opens a pane with the same things the terminal approval screen shows: environment, statement, SQL, values, reason and the before and after of each row. You approve by typing the environment name; anything else is refused. `/sql-approval` opens it too.

What it does and does not do:

- It reads the request files the wrapper writes (`$SAFE_PSQL_HOME/requests`, default `~/.safe-psql/requests`) every 10 seconds and shows only the requests whose `agent` is this session's agent (`AIM_AGENT_NAME`, else `AIM_AGENT_ID`, else `$USER`, the wrapper's own rule).
- Approving does the same state change as the wrapper's `approve` (`status: approved`, `approved_by`, `approved_at`, `apply_by`, `approved_fingerprint`), after re-reading the file: the request must still be pending, not expired, and carry the fingerprint you saw. Rejecting sets `rejected` and drops the values. Both append an audit line (names only, `via: claude-code-mod`) to `write.log`. The wrapper's own `approve` cannot be used from here, because it refuses to run inside an agent session and needs a terminal.
- It never connects to the database and never runs the wrapper. The agent still has to run `safe-psql-write apply`, which repeats every check, including the fingerprint, so a request edited after you saw it is refused there. The agent is told with a note that carries only the request id (`[SQL WRITE] request w-... was approved`).
- **Honest limit:** the agent and you share one OS user, so this stops accidents and the sanctioned path, not an agent that edits the request file itself. The write login's own limits (listed tables and columns, row cap) are the real backstop. The terminal approval remains the stronger door.
- It uses `$.fs` (read, list, write), `$.env`, `$.clock`, `$.command`, `$.prompt.submit`, `$.state` and `$.ui`; no network, no process.

```bash
claude --plugin-dir /path/to/ai-maestro/mods/ai-maestro-sql-approval
claude plugin validate mods/ai-maestro-sql-approval
claude plugin test mods/ai-maestro-sql-approval
```

Tested with `claude plugin test` (the logic against an in-memory file system). The band and pane were not driven by a real Claude Code session.

## The board mod: `mods/ai-maestro-board`

Shows an agent its own AI Maestro task board inside the terminal, for agents that run **without** the AI Maestro dashboard (a lolabot, a Claude Code session started by hand). A count in the status line (`board: 4 open, 1 waiting on you`) and a `/board` command that lists the cards by column with what each one waits on and its Eisenhower quadrant (Q1 do first, Q2 schedule, Q3 delegate, Q4 delete, `--` not placed). Inside AI Maestro the dashboard's Board and Matrix tabs show the same cards.

- **Read-only.** It never writes a card. The agent moves cards with `aimaestro-task.sh` (the `agent-tasks` skill); this mod only shows them. It uses `$.process.run` for `curl` with `-f` and no write method, `$.fs.read` for one file, `$.env` for seven variables, `$.clock`, `$.command`, `$.state` and `$.ui.status`. `claude plugin validate mods/ai-maestro-board` prints exactly that.
- **Which agent:** the plugin option `agentId` first; then `AIM_AGENT_ID` (set in sessions AI Maestro starts), `CLAUDE_AGENT_ID`, the folder name in `AMP_DIR` (the way `amp-helper.sh` finds the AMP identity), then a name (`AIM_AGENT_NAME`, `CLAUDE_AGENT_NAME`) that the server turns into an id. A lolabot has no id in its config; its id is its AMP identity id, so set the `agentId` option to it. An id that is not a plain file name is never used.
- **Where the cards come from:** the AI Maestro server on this host (`GET /api/agents/<id>/board`, which also carries team cards and the quadrant; address from the `apiUrl` option, else `AIMAESTRO_API`, else `http://localhost:23000`), else the board file `~/.aimaestro/agents/<id>/tasks.json` that the server would have read (own cards only, and the mod works the quadrant out from the two answers). With neither, `/board` says what is missing.
- **Refreshes every 30 seconds.** Card text comes from other people and agents, so control and escape characters are stripped before it is shown.
- **Honest limits.** The mods API is early access (Claude Code 2.1.287 or later) and can be blocked by managed settings. Without a server an agent can see its board but not move cards: moving them goes through the server's API, and a second writer is deliberately not added. The status line may be shared with other mods (the inbox mod writes there too); I did not check how Claude Code arbitrates. Project cards are not on the board yet.

```bash
claude --plugin-dir /path/to/ai-maestro/mods/ai-maestro-board
claude plugin validate mods/ai-maestro-board
claude plugin test mods/ai-maestro-board
```

Tested with `claude plugin test` (20 tests, the logic with the engine's answers from memory) and run once for real outside the harness: the mod's own file under Node, with a real `curl`, against the live server (the server's board, the file fallback, and an unknown agent). The status line and `/board` were not driven by a real Claude Code session.

## Verified live

Tested on 2026-10-02 between a Mac with no tmux session (this mod) and a Linux host with an AI Maestro-native agent in tmux, over the AMP mesh:

| Case | Result |
|---|---|
| A message arrives; the person sees it inside Claude Code with no dashboard | Pass (toast) |
| A message arrives while the session is idle; the session is woken | Pass, within one poll |
| A message arrives mid-turn and is read before the turn ends | Pass, no wake afterwards |
| A reply from another host wakes the idle session | Pass |
| A wake that fired after the message was already read | Bug found, fixed, covered by tests |

## Limits and honest caveats

- **Early-access API.** Anthropic's mods API "moves between releases". Pin and re-test when Claude Code updates.
- **`claude plugin test` can refuse to run.** On 2026-10-02 it printed "hooks modules are turned off in this process: the rollout switch served off" for most of the day, while the mod kept working in the open session. On Claude Code 2.1.288 the message read "the rollout switch was saved off by an earlier session and is not refreshed yet", and starting `claude` once with network access cleared it (the tests then passed). So the cause here was a stale cached flag, not a remote shutdown. Anthropic's docs say that if the message returns after a refresh, installed mods are turned off remotely and no local setting changes it.
- **Admins can block it.** On a machine with managed settings or a Team or Enterprise sign-in, a built-in guard loads first, and `allowManagedModsOnly` stops every mod a user brings.
- **No drawing outside the terminal and Desktop app.** In `claude -p`, the SDK and the VS Code chat panel the hooks run (the wake works) but nothing is drawn.
- **A poll, not a push.** Latency is up to 20 seconds.
- **Overlaps with the other routes.** The Stop hook, the prompt hook and a channel can announce the same message. They already de-duplicate against each other where they can; the mod uses the same mailbox state ([how an agent is told it has mail](ARCHITECTURE.md#telling-an-agent-it-has-mail)).
- **Claude Code only.** Codex and other runtimes have no mods.

## Related

- [How an agent is told it has mail](ARCHITECTURE.md#telling-an-agent-it-has-mail): the rules every notifier follows and the routes.
- [`notify:v1`](https://github.com/agentmessaging/protocol/blob/main/spec/12-notification.md): the optional AMP extension for a cheap "what is new" call and delivery basis, which is what a client like this mod would poll on a provider that supports it.
