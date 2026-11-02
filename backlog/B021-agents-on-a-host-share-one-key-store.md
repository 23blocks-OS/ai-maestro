# B021 - Agents on one host can read every secret and every agent key on it (accepted trade-off)

**Status:** Todo (documentation only; the isolation answer is containers)
**Type:** Bug (known limitation)
**Created:** 2026-11-02

## Description

Agents run as the same OS user as AI Maestro, so any agent on a host can read what that user can:

- The vault. With the file backend (mac-mini and mini-lola today), `~/.aimaestro/vault/secrets.json` is encrypted with `vault.key` in the same folder. With the macOS keychain, an item written by `security` is read back by `security` without a prompt (checked on 2026-11-02 with a throwaway item). The same is true of an unlocked libsecret keyring.
- Every agent's AMP private key, in `~/.agent-messaging/agents/*/keys`. So on a shared host, "Signature: VERIFIED" proves which key signed a message, not which agent process sent it.
- The service files listed in B020.

An agent that sticks to `aim-secret exec` and its own identity is fine. An agent that goes looking can reach everything on its host.

## Why It's Needed

Decision (Juan, 2026-11-02): **this is the trade-off of running agents directly on a host, and we accept it for now.** People who need agents isolated from each other run them in containers (the Docker agent backend), which do not see the host's vault, keychain or other agents' keys. What is needed is that the documentation says so, so nobody assumes the vault or the signatures separate agents on one host.

## Business Case

Honest documentation prevents a wrong security assumption by a team or customer, at no engineering cost. It also gives a clear answer when someone asks: "on one host, agents trust each other; for isolation, use containers".

## Implementation Plan

1. `docs/SECRETS.md`: state that any agent on a host can read every secret on that host, whatever the backend, and that the encrypted file keeps its key beside it (protects against leaked files, not against agents) (S).
2. AMP docs and the agent-messaging skill: on a shared host, a verified signature identifies a key, not a process; the boundary between agents is the host or the container (S).
3. `docs/SPEC-SHARED-SECRETS.md` section 7 and F065: scopes are policy for agents on the host, a real boundary for agents in containers (S).
4. Docker agent docs: list what a container does not see (vault, keychain, other agents' keys) as the reason to choose it (S).
5. Later, only if asked: sandbox profiles for Claude Code agents that block the vault and key folders.

Effort: S, docs only.
