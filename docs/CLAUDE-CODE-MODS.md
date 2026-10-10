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
- It works in the terminal Claude Code and the Code tab of the Desktop app. The AI Maestro chat has its own card (not built yet).

Install and check:

```bash
claude --plugin-dir /path/to/ai-maestro/mods/ai-maestro-secrets
claude plugin validate mods/ai-maestro-secrets
claude plugin test mods/ai-maestro-secrets
```

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
