# Secrets: let agents use a credential without seeing it

`scripts/aim-secret.mjs` stores a credential in your computer's secure storage and lets an agent run commands that use it. The value never goes through the chat, so it does not end up in the model context, the transcript or agent memory.

## Use

```bash
aim-secret set OPENAI_API_KEY        # you type the value at a hidden prompt (or pipe it with --stdin)
aim-secret list                      # names only
aim-secret exec --use OPENAI_API_KEY -- python embed.py
aim-secret exec --use AWS_ACCESS_KEY_ID --use AWS_SECRET_ACCESS_KEY -- aws s3 ls
aim-secret exec --use OPENAI_API_KEY=MY_KEY -- node job.js   # expose it to the command as OPENAI_API_KEY
```

The agent only needs the name. If a secret is missing, `exec` stops with exit code 3 and tells the agent to ask you to run `aim-secret set NAME`.

## Where the value lives

- macOS: the login Keychain (service `ai-maestro`).
- Linux: libsecret through `secret-tool` (install `libsecret-tools`).
- Linux servers: `secret-tool` needs an unlocked default keyring, which exists only after a desktop login. Over ssh or on a headless host it usually does not, and `aim-secret` fails after 15 seconds with a message saying so. Use the file backend there.
- `AIM_VAULT_BACKEND=file`: an encrypted file in `~/.aimaestro/vault`. The key sits next to the data, so this is only as safe as the file permissions. It is meant for tests and hosts with no keychain. On such a host the agent runs as the same user and can read that file too, so it protects against accidents (a value pasted into a chat, a script that logs its environment), not against an agent that goes looking for it.

The value is written through stdin, never as a command-line argument, so it does not show up in process listings or shell history. `aim-secret set NAME VALUE` is refused.

## Choosing the store for a machine

```bash
aim-secret backend file     # headless server with no keyring (remembered for every later command)
aim-secret backend auto     # back to automatic
aim-secret status           # shows the store and where the choice came from
```

The environment variable `AIM_VAULT_BACKEND` overrides the saved setting. `scripts/install-aim-secret.sh` (run by `update-aimaestro.sh`) puts `aim-secret` on the PATH.

## What the scrubbing does and does not do

`exec` replaces the value in the command's output (stdout and stderr) with `[secret:NAME]`, including the base64, URL-encoded, JSON-escaped and hex forms, and values split across output chunks.

This stops accidents: a script that logs its environment, an error message that echoes a header. It does not stop an agent that wants the value and can run commands, because that agent can transform the value in ways no scrubber predicts. Treat a secret you hand to an agent as something that agent can use, not something it cannot misuse. Use a narrowly scoped key.

## Asking for a secret from the AI Maestro chat

An agent that needs a credential runs:

```bash
aim-secret request OPENAI_API_KEY --note "for the embedding job"
```

It returns at once and the agent ends its turn. A card appears in that agent's chat (desktop and mobile): the name is already filled in, the value field is masked, and there are **Store it** and **No thanks** buttons. The value goes to the AI Maestro server and straight into the vault on the agent's own host (a request for an agent on another machine is forwarded there). The agent is then woken with a line that carries only the name: "The user stored OPENAI_API_KEY in the vault. Use it with `aim-secret exec --use OPENAI_API_KEY -- <command>`."

What keeps the value away from the model and from disk:

- It is not a chat message. It is posted to its own endpoint (`POST /api/agents/:id/secret-requests/:request`), not through the chat, the pane or the wake chain, so it is not in any transcript.
- The request record holds only the id, agent, name and an optional note. It expires after 30 minutes and is lost on a restart.
- The server never logs it, never puts it in an error or a response, and the page clears it after the request, whether it worked or not.
- A browser can mask the field (the Claude Code mod cannot).

Tests cover the store, the service (including that the value is not in the response, the wake message, or any console output), the command, and the card's markup. A run against an isolated headless server found no copy of the value in the server log, the home folder or the vault folder.

## Asking for a secret from Claude Code

The mod in `mods/ai-maestro-secrets` lets an agent request a secret by name; you type the value into a form in Claude Code instead of the chat. See `docs/CLAUDE-CODE-MODS.md`.

## Not done yet

A skill that teaches agents to use `aim-secret request` (agents need to be told), and binding a secret to one agent or command. See `backlog/F033-secret-vault-agents-use-without-seeing.md`.
