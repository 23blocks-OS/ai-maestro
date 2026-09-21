# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Considerations

### Network Access Configuration

**⚠️ IMPORTANT: AI Maestro runs on 0.0.0.0:23000 by default**

This means it's accessible from ANY device on your local network:
- **Accessible from other machines on your network** (tablets, phones, other computers)
- **No authentication required** - anyone on your WiFi can access it
- **Full terminal access** - anyone connected can run commands with your permissions
- **Unencrypted** - WebSocket connections use ws:// (not wss://)

**Safe for:**
- Home networks (trusted WiFi)
- Private office networks
- Development on trusted LANs

**NOT safe for:**
- Public WiFi
- Shared/untrusted networks
- Exposing port 23000 to the internet

**To run localhost-only (more secure):**
```bash
HOSTNAME=localhost PORT=3000 yarn dev
```

**By design, there is no application-level authentication.** The trust boundary
is the *network*: AI Maestro is meant to run on a trusted local network with
Tailscale as the perimeter. The `0.0.0.0` bind is intentional — it is what lets a
tablet or phone on the same network open the dashboard. This is the model, not a
gap, so "add auth" and "bind to localhost only" are deliberately *not* on the
roadmap (see CLAUDE.md, "Localhost-Only Security Model").

**The one condition the model depends on: 23000 must not be reachable from
outside the trusted network** — in particular, never port-forward it through a
router to the public internet. Verify per host (four seconds, no privileges):

```bash
ss -ltn | awk '$4 ~ /23000$/'   # confirm what interface it's bound to
ufw status                       # (Linux) confirm the host firewall posture
```

Because the network is the perimeter, input-validation fixes still matter *more*,
not less: network trust keeps outsiders out, but does nothing about a malformed
request from a device that is legitimately inside — a compromised laptop, a phone,
a misbehaving agent. Arbitrary-code-execution bugs (e.g. GHSA-2vm8-3q4q-wqv3) are
fixed on their own merits regardless of the trust model. See "Resolved
Advisories" below.

### Data Storage

**Local Data Only:**
- Agent notes stored in browser localStorage
- No data transmitted over the internet
- No cloud sync or backup
- Clearing browser data will delete all notes

**Sensitive Information:**
- Do NOT store passwords or API keys in agent notes
- Do NOT expose sensitive environment variables in terminal sessions
- Session content is stored in memory only (not persisted)

### tmux Session Security

**Important:**
- Anyone with access to your Mac can view/attach to tmux sessions
- tmux sessions run with your user permissions
- Sessions persist even after closing the dashboard
- Always kill sensitive sessions when done: `tmux kill-session -t <name>`

### WebSocket Connection

**Local Communication:**
- WebSocket connections are unencrypted (ws://)
- Only accepts connections from localhost
- No CORS protection (localhost-only environment)

**NOT SECURE for remote access:**
- Do NOT expose port 3000 to the internet
- Do NOT run on a public server without adding:
  - HTTPS/TLS encryption
  - Authentication layer
  - CORS protection
  - Rate limiting

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
posture below.** The root exposure is still an unauthenticated listener; see
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

## Security Best Practices for Users

### Running Safely

```bash
# ✅ Safe: Localhost only
yarn dev

# ❌ Unsafe: Exposing to network
HOST=0.0.0.0 yarn dev  # Don't do this without security measures!
```

### Port Security

```bash
# Check what's using port 3000
lsof -i :3000

# Verify localhost-only binding
netstat -an | grep 3000
# Should show: 127.0.0.1:3000 (NOT 0.0.0.0:3000)
```

### Session Hygiene

```bash
# List all sessions
tmux ls

# Kill sensitive sessions when done
tmux kill-session -t sensitive-work

# Kill all sessions (end of day)
tmux kill-server
```

### Browser Security

- Use a modern, updated browser
- Clear browser data regularly if storing sensitive notes
- Use private/incognito mode for sensitive work (notes won't persist)
- Don't share your browser session while dashboard is open

## Future Security Enhancements

**Planned for Phase 2+:**
- [ ] HTTPS/TLS support
- [ ] User authentication
- [ ] Agent-level access control
- [ ] Encrypted note storage
- [ ] Audit logging
- [ ] Rate limiting
- [ ] CORS protection

## Dependencies

**Security Updates:**
- We monitor dependencies for security vulnerabilities
- Run `yarn audit` to check for known vulnerabilities
- Update dependencies regularly: `yarn upgrade-interactive --latest`

**Critical Dependencies:**
- xterm.js - Terminal emulator
- ws - WebSocket library
- node-pty - PTY bindings
- Next.js - Web framework

## Disclaimer

**THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.**

The authors are not responsible for:
- Data loss
- Security breaches
- Unauthorized access to your system
- Any damages resulting from use of this software

**Use at your own risk. Always:**
- Keep sensitive work in secure, dedicated environments
- Back up important data
- Follow security best practices
- Keep software updated

---

For general questions about security, open a GitHub issue with the `security` label.
