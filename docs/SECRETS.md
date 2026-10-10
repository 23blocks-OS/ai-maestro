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

## What the scrubbing does and does not do

`exec` replaces the value in the command's output (stdout and stderr) with `[secret:NAME]`, including the base64, URL-encoded, JSON-escaped and hex forms, and values split across output chunks.

This stops accidents: a script that logs its environment, an error message that echoes a header. It does not stop an agent that wants the value and can run commands, because that agent can transform the value in ways no scrubber predicts. Treat a secret you hand to an agent as something that agent can use, not something it cannot misuse. Use a narrowly scoped key.

## Not done yet

The approval card in the chat, the local entry page, binding a secret to one agent or command, and the Claude Code mod. See `backlog/F033-secret-vault-agents-use-without-seeing.md`.
