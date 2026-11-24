# Security Policy

## Supported versions

Only the latest release gets security fixes. Releases are continuous (0.106.x and later). Update each host with `./update-aimaestro.sh -y`.

## Security model

- **No app-level login, by design.** AI Maestro binds `0.0.0.0:23000` so that phones, tablets and other hosts on your network can open the dashboard.
- **The network is the trust boundary:** your LAN plus Tailscale. Anyone who can reach port 23000 can do what you can, including typing into every agent's terminal.
- To keep it to one machine, start it with `HOSTNAME=127.0.0.1`.
- "Add a login" and "bind to localhost only" are not on the roadmap (B005). An opt-in access token for a host exposed to the internet is a separate experiment (F058).
- Input validation still matters: network trust keeps outsiders out, but not a malformed request from a device that is legitimately inside (a compromised laptop, a phone, a misbehaving agent). Injection and code-execution bugs are fixed on their own merits.

## What the operator must do

- Never forward port 23000 from a router to the internet.
- Check what the port listens on: `lsof -nP -iTCP:23000 -sTCP:LISTEN` (macOS) or `ss -ltn | grep 23000` (Linux).
- Use Tailscale ACLs to limit which devices reach the hosts.
- Behind a reverse proxy, list its origin in `AIMAESTRO_TRUSTED_ORIGINS` (see below).

## Requests from other web pages

A web page open in your browser could otherwise send requests to the server or open its WebSockets. The server checks the browser `Origin` on WebSocket upgrades and on every request that changes something (B044, `lib/origin-guard.mjs`):

- `AIMAESTRO_ORIGIN_GUARD=enforce` (the default): a request from a page that is not AI Maestro itself, a known host or a trusted origin is refused with 403.
- `audit`: log what would be refused, refuse nothing. `off`: no check.
- `AIMAESTRO_TRUSTED_ORIGINS`: a comma list of extra origins, for example `https://maestro.example.com`.
- The Doctor's `cross-origin` check shows what was refused.

Requests without an `Origin` (the CLI, scripts, agents, other hosts) are not affected.

## Who is calling the message routes

The server works out who is calling the message routes (`lib/caller-identity.ts`) and does not take the sender or the mailbox owner from the request:

- An agent is identified by its **session** (the request comes from a process inside its tmux pane, read from the kernel, not from environment variables) or by its **AMP API key**. It can send only as itself and read and change only its own mailbox (`sender_mismatch`, `not_your_mailbox`). An API key of one agent used from the session of another is refused (`caller_mismatch`).
- Requests that are neither (the dashboard, scripts, other hosts) keep today's access. There is no login and no token: the network is the trust boundary. `AIMAESTRO_CALLER_AUTH=off` turns the check off.
- `GET /api/caller` shows who the server thinks you are.

What it does not do: agents on one host share one OS user (B021), so an agent with a shell can still read message files and keys directly, or run a process outside its pane, which is then anonymous. This stops an agent from using the API as another agent by mistake or by a forged field; it is not isolation between agents. The rest of the API (terminals, agent settings) stays open as described above.

## Rules agents cannot approve, move or switch off

- **Approvals need the right caller.** `POST /api/v1/quarantine/{id}/approve` and `/reject` use the caller the server found (above), not `by` from the body. An agent decides only an entry whose rule names it as an approver and never one it sent, and it is recorded as itself. The dashboard decides as before. An agent lists and reads (`GET /api/v1/quarantine*`) only the entries it sent, receives or approves. A decision passed on by a peer host (`X-Forwarded-From` naming a host in `hosts.json`) is taken as before.
- **The rules file's place is a setting.** `AIMAESTRO_POLICY_FILE=/absolute/path` replaces `~/.aimaestro/policy.json`. The server only reads it and keeps no copy beside it. Give the file and its folder to another OS user (or root), readable by the server, and the agents' user cannot edit, replace or delete it. The Doctor warns while that user can still write it. See `docs/rules.html`, "Keeping agents away from the rules".
- **Fail closed, as an option.** `AIMAESTRO_POLICY_FAIL_CLOSED=1`: a missing, unreadable or broken rules file refuses what agents send and every governance action until it is fixed (the Doctor fails), instead of keeping the last good version. People and AI Maestro itself may still send.
- **The last good version.** Without fail-closed, a broken or deleted file keeps the version this server process loaded. The copy saved next to the default file (`policy.json.last-good`) is used only after a restart, and never for a configured file, because it sits where agents can write.

What it does not do: the quarantine store and the held messages (`~/.aimaestro/policy/`) belong to the server, so with agents and server as one OS user an agent with a shell can still edit them directly (B021). Use containers, or run the server as its own user, to close that.

## Registering a name that exists

`POST /api/v1/register` hands out an API key. For a new name it works as before. For a name that already exists on the host, the public key alone is not enough (it is public: the API serves it and every message carries its fingerprint). AMP spec 03, "Registering an Existing Name":

- **Same key, already registered:** the request must come from that agent itself: its own session, its API key, or a `proof` of possession of the registered key (a signed timestamp, see docs/EXTERNAL-AGENTS.md). Otherwise 401 `proof_required`. A proof works once and for 5 minutes.
- **Another key:** 409 `name_taken`, as before. There is no key reset over the API (no administrator credential); delete the agent and register it again.
- **An agent in the registry that never registered over AMP:** only its own session can register it.

This applies in every `AIMAESTRO_CALLER_AUTH` mode: the dashboard never registers keys. In `off` mode no caller is worked out, so only a proof re-issues a key there. It prevents a name being taken by mistake or from another machine; it is not a wall between agents on one OS user (B021): someone who can delete an agent through the API can register its name again afterwards.

## Known design limits

Each of these is known and is not a new finding:

- No authentication on the API or the WebSockets (B005, by design; F058 for internet exposure).
- Traffic on the LAN is plain HTTP and `ws://`. Tailscale encrypts between devices; a LAN without Tailscale does not.
- All agents on one host run as one OS user and can read each other's files, keys and secrets (B021). Use containers to isolate agents.
- An agent can run in a permission-bypass mode (`--dangerously-skip-permissions` or another program's equivalent) when the operator chooses it. Such an agent runs any command with the user's rights.
- Messages from other agents and from outside providers reach the model. A valid signature proves which key sent a message, not that its content is safe (OWASP LLM01). Messages from outside senders are wrapped as untrusted content.

## Data on disk

Everything stays on your hosts unless you connect an outside AMP provider.

| What | Where |
|---|---|
| Agent registry | `~/.aimaestro/agents/registry.json` |
| Agent memory, documents, canvases | `~/.aimaestro/agents/<id>/` |
| Messages and agent keys | `~/.agent-messaging/agents/` |
| Policy rules, decision log, quarantine | `~/.aimaestro/policy.json` (or `AIMAESTRO_POLICY_FILE`), `~/.aimaestro/policy/` |
| Secrets | the OS keychain (macOS Keychain, libsecret), else an encrypted file in `~/.aimaestro/vault/` |
| Claude Code transcripts | `~/.claude/projects/` |

Private keys and secret files are written with mode `0600`.

## Resolved Advisories

| Advisory | Severity | Class | Resolved in |
|---|---|---|---|
| GHSA-mf7j-vfrr-jmfh / CVE-2026-37751 | Critical | tmux session-name command injection (`killSessionSync`) | v0.35.x |
| GHSA-2vm8-3q4q-wqv3 | Critical | tmux session-name command injection — **bypass** of the above via the async `sessionExists()` path (`GET /api/sessions/[id]/command`) | v0.38.27 |
| GHSA-g7qj-fhxp-6chc | High | RCE via `gray-matter` executable frontmatter in the plugin-builder repo scan | fixed in code (`lib/safe-matter.ts`); advisory pending publish |

### Note on the GHSA-2vm8 fix

The first fix converted one path (`killSessionSync`) to argument-array execution
and validated names at agent creation. The reporter found that the **async**
existence-check path still built a shell string, and route-level validation did
not cover it. The v0.38.27 fix therefore does two things instead of one:

1. **No shell for tmux, anywhere.** All tmux calls go through `lib/tmux-safe.mjs`,
   which uses `execFile` with an argument vector. A session name is one argv
   entry; there is no shell parser left to confuse.
2. **Validation at the choke point, not the routes.** Every helper rejects a
   session name outside `^[a-zA-Z0-9_-]{1,128}$`, and the `/term` WebSocket
   entry validates before attaching a PTY. A future caller cannot reintroduce
   the hole by forgetting to validate at a new route.

Verified against the live fleet before shipping: 124 registry names and 36 live
tmux sessions across three hosts, none rejected by the new validator.

**These are defense-in-depth on top of, not a replacement for, the network
posture above.** The root exposure is still an unauthenticated listener; see
the next section.

## Reporting a Vulnerability

**If you discover a security vulnerability, please:**

1. **DO NOT** open a public GitHub issue
2. **Use GitHub Security Advisories** to report privately:
   - Go to: https://github.com/23blocks-OS/ai-maestro/security/advisories/new
   - Fill out the private vulnerability report form
   - Include:
     - Description of the vulnerability
     - Steps to reproduce
     - Potential impact
     - Suggested fix (if any)

**Alternative:** If you prefer not to use GitHub, you can email: support@23blocks.com

**Response Timeline:**
- We will acknowledge receipt within 48 hours
- We will provide a detailed response within 7 days
- We will release a patch as soon as possible

## Dependencies

- Run `yarn audit` to check for known vulnerabilities.
- Main runtime dependencies: Next.js, ws, node-pty, xterm.js.

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
