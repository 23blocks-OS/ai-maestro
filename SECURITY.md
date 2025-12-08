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
