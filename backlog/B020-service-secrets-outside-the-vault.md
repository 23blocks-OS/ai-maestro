# B020 - AI Maestro's own secrets are kept in plain files, outside the vault

**Status:** Todo (fix is the first step of F065 phase 1)
**Type:** Bug
**Created:** 2026-11-02

## Description

Agent secrets go to the vault (`lib/secret-vault.mjs`): the macOS keychain, libsecret, or an encrypted file. The service's own secrets, the ones AI Maestro itself uses rather than a particular agent, do not:

| Secret | Where it is today | Read by |
|---|---|---|
| Memory classifier API key (Settings > Memory) | `~/.aimaestro/memory-settings.json`, `classifier.apiKey`, plain JSON (0600) | `lib/memory/settings.ts` |
| Claude login token for streaming agents | `~/.aimaestro/claude-oauth-token`, plain (0600) | `lib/streaming-runtime.mjs` |
| Attachment URL signing key | `~/.aimaestro/attachment-token.key`, plain (0600) | `lib/amp-attachments.ts` |
| Anthropic key for voice narration and the memory fallback | `ANTHROPIC_API_KEY` in the server's environment (pm2) | `lib/cerebellum/voice-subsystem.ts`, `lib/memory/claude-provider.ts` |
| TTS keys in the web dashboard (OpenAI, ElevenLabs) | the browser's local storage, not on the host | the Companion TTS providers |

Not a problem: `amp-api-keys.json` stores only SHA-256 hashes.

Expected: one store for every secret, encrypted at rest, with the same backends and the same "never sent back to a browser" rule. Actual: each feature that needed a key invented its own file, and the next ones (voice providers for F059, phone numbers for F064) would do the same.

## Why It's Needed

A plain file leaks through any backup, copy, sync folder or support bundle that includes `~/.aimaestro`. The vault already exists and is encrypted at rest; the service just does not use it. Voice and telephony are about to add several paid provider keys per host.

## Business Case

Risk reduction before bring-your-own-keys multiplies the keys we hold. One place also means one Settings page, one Test button and one way to share a key across hosts (F065), instead of a file per feature.

## Implementation Plan

1. `useSecret(name, { feature })` in the server, reading from the vault (keychain or encrypted file), cached in memory briefly (S).
2. Migration on first start: move the memory classifier key, the Claude token and the attachment signing key into the vault as `provider` secrets, verify the read-back, then delete the plain copies (S).
3. Settings > Memory and the new Settings > Voice providers write through the vault and show only the last four characters (S).
4. `ANTHROPIC_API_KEY`: read from the vault first, the environment second, and say in Settings which one is in use (S).
5. Browser TTS keys move to the host: the dashboard asks the server for speech instead of calling the provider with a key from local storage (M, with F059).
6. Test: after migration none of the values is in any file under `~/.aimaestro` outside the vault; a host without a keychain uses the encrypted file.

Scope note: this makes the service secrets as safe as agent secrets, not safer. Agents on the same host can still reach the vault (B021, accepted).

Effort: S to M. Part of F065 phase 1, done first.
