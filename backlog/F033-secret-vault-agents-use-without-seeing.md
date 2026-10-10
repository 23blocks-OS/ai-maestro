# F033 - A local secret vault: agents use credentials without the model ever seeing them

**Status:** In Progress (CLI 0.63.0; saved store, PATH install and the Claude Code mod 0.64.0; chat card, entry page and per-agent scoping open)
**Type:** Feature (design first)
**Created:** 2026-10-09
**Requested by:** Juan, 2026-10-09 (seen in the Muse agent: the user enters the credential in a separate local app, the agent's tools use it, the value never goes through the chat or the LLM)

## The idea

Today a user who needs an agent to use an AWS credential or an OpenAI key pastes it into the chat. From that moment it is in the model context, in the transcript on disk, possibly in logs and memory. Instead:

1. The agent asks for a named secret ("I need OPENAI_API_KEY to run the embedding job").
2. The user gets a card with a button. It opens a small local page (or a native dialog) where they enter the value. The value goes to local secure storage, never to the chat.
3. The agent's tools reference the secret by name. A wrapper puts the value into the child process environment at execution time and scrubs it from the output before the model sees the result.

Two targets:

- **a) In AI Maestro** for every agent (Claude Code, Codex, Grok Build, the rest).
- **b) Native Claude Code through a mod** (plugin API: tool-call hooks can rewrite a command before it runs and act on its result), so it also works outside AI Maestro.

## Design notes (to validate, not decisions)

- **Storage:** OS keychain first (macOS Keychain, libsecret on Linux), encrypted file as the fallback. Never plaintext JSON in `~/.aimaestro`.
- **Use:** `aim-secret exec --use NAME -- <command>` (env injection) and `{{secret:NAME}}` placeholders that the tool layer expands at execution. The model only ever writes the name.
- **Output scrubbing:** exact-value redaction in stdout and stderr, plus common encodings (base64, URL-encoded). This lowers accidental leaks; it does not stop a determined or compromised agent that has a shell and can re-encode the value. Say so plainly in the docs.
- **Scoping:** a secret is bound to an agent (or team) and, ideally, to a command pattern, with a one-time "allow this agent to use NAME" approval card, like the permission cards.
- **Entry page and the no-auth rule:** AI Maestro binds `0.0.0.0` and has no app-level auth by design, so a secret-entry page served on that port would let anyone on the network write secrets. The entry surface must be reachable only from the machine itself (loopback-only listener, a Unix socket, or a native OS dialog opened by the server), and reading a value back out must be impossible from the network. This is a constraint on where the page lives, not a proposal to add login.
- **Multi-host:** a secret lives on the host where the agent runs; moving an agent between hosts must not silently copy it.
- **Leak surfaces to audit:** chat transcripts, hook debug log, memory/summaries, `agent.db`, message bodies sent to other agents, tmux scrollback.
- **Claude Code mod (b):** needs a spike. Open questions: does the mod UI offer a masked input or a way to open a local app; where can a mod keep the value (keychain through a process call, not the mod store); does rewriting a Bash command in `tool.call` keep the placeholder, not the value, in what the model sees and in the transcript.

## Non-goals

A password manager, team secret sharing, rotating or minting credentials, protecting against an agent that is already malicious.

## First slice

Keychain-backed `aim-secret` CLI with `set` (from a local prompt, not argv), `exec --use`, output scrubbing and a test that a secret never appears in the chat transcript. Then the approval card and the entry page.

## Related

AID / Personal Agent Protocol: the Personal Agent Protocol draft (0.1, 2026-10-09) also requires that account tokens never enter model context, conversation messages, logs or URLs. Same rule, different layer.
