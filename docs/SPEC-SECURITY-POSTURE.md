# Spec: an honest SECURITY.md, and a guard against requests from other web pages

**Status:** Draft for review (2026-11-18)
**Backlog:** B043 (SECURITY.md), B044 (cross-origin guard)
**Source:** the SECURITY.md finding is from a review of `CamiloCaceres/lolad` (MIT), 2026-11-18. The cross-origin finding came up while checking it: lolad refuses cross-origin writes (`internal/web/web.go` line 152, Go's `http.CrossOriginProtection`) and we do not.
**Size:** S (B043, documentation), S to M (B044, code and tests)

The design does not change: no app-level authentication, the server binds `0.0.0.0`, and the network is the trust boundary (CLAUDE.md, B005). This spec does not propose a login or a localhost-only bind.

## Part A: SECURITY.md (B043)

### A.1 Problem, with evidence

`SECURITY.md` contradicts the product and itself:

| Line | Says | Fact |
|---|---|---|
| 9 to 10 | Supported: `1.0.x`; `< 1.0` not supported | The current version is 0.106.x, so by this table no release is supported |
| 44 | See CLAUDE.md, "Localhost-Only Security Model" | That section does not exist. CLAUDE.md has "Security model" |
| 34 to 37 | "To run localhost-only (more secure)", port 3000 | The port is 23000. Localhost-only is not the model |
| 83 to 96 | WebSocket "only accepts connections from localhost" | False. `/term`, `/status` and the other sockets accept any client (server.mjs line 1999) |
| 64 to 73 | Notes in browser localStorage; "no cloud sync"; "session content in memory only" | The registry, messages, memory databases and transcripts are on disk. AMP can federate to external providers |
| 151 to 170 | "Safe: localhost only"; `HOST=0.0.0.0` "unsafe"; expect `127.0.0.1:3000` | The default is `0.0.0.0:23000`, by design |
| 172 to 183 | Kill sessions, `tmux kill-server` at the end of the day | This stops every agent. It is the opposite of how the product is used |
| 192 to 201 | Planned: user authentication, CORS protection | Authentication is not planned (B005). An optional access token is a separate experiment (F058) |

A reader (a user, a security researcher, an auditor) cannot tell what the design is or which versions get fixes.

### A.2 Goals

1. Say the model once, plainly: who is trusted, what is the boundary, what the operator must do.
2. List the known design limits, so nobody files them as new findings and nobody is surprised.
3. Keep the reporting and advisory sections (they are correct).

### A.3 The new outline

1. **Supported versions.** "Only the latest release gets fixes. Update with `update-aimaestro.sh`." (Our releases are continuous; a version table goes stale.)
2. **Security model.** No app-level login. Binds `0.0.0.0:23000`. The network (LAN plus Tailscale) is the trust boundary. Anyone who can reach port 23000 can do what the operator can, including type into every agent's terminal. `HOSTNAME=127.0.0.1` keeps it to one machine, for people who want that.
3. **What the operator must do.** Never forward port 23000 to the internet. Check with `lsof -nP -iTCP:23000 -sTCP:LISTEN` (macOS) or `ss -ltn` (Linux). Use Tailscale ACLs to limit which devices reach it.
4. **Known design limits** (each one line, with the backlog item):
   - No authentication on the API or the WebSockets (B005, by design; F058 is an opt-in token for internet exposure).
   - Traffic on the LAN is plain HTTP and `ws://`. Tailscale encrypts between devices; a LAN without Tailscale does not.
   - All agents on one host run as one OS user and can read each other's files, keys and secrets (B021). Containers isolate.
   - Agents can run in permission-bypass modes (`--dangerously-skip-permissions` and the equivalents of other programs) when the operator chooses it. Such an agent runs any command with the user's rights.
   - Message content from other agents and from outside providers reaches the model. A signature proves the sender's key, not that the content is safe (OWASP LLM01).
   - Until B044 ships: a web page open in the operator's browser can send requests to the server (Part B).
5. **Data on disk.** Where the registry, messages, memory and secrets live, and their file modes.
6. **Reporting a vulnerability** and **resolved advisories** (keep as they are).

### A.4 Tests

- `tests/security-md.test.ts`: fails when SECURITY.md names a version table with `1.0`, says `127.0.0.1:3000`, or references a CLAUDE.md heading that does not exist. Cheap, and it stops the drift coming back.

## Part B: requests from other web pages (B044)

### B.1 Problem, with evidence

The network boundary keeps other machines out. It does not cover the operator's own browser. A page on any web site that the operator opens can make the browser send requests to `http://<host>:23000`:

- **WebSockets** are not limited by the same-origin policy. `server.on('upgrade')` (server.mjs line 1999) accepts `/term`, `/status`, `/v1/ws`, `/companion-ws` and the others with no `Origin` check. `/term?name=<session>` types into an agent's terminal. This is Cross-Site WebSocket Hijacking (OWASP WSTG, "Testing WebSockets").
- **Form-like POSTs** (`text/plain` or form bodies) are sent cross-origin without a preflight. Routes that accept such bodies run. CORS is open on `/api/*` on purpose (SPEC-DOCTOR, principle 2), so a page can also read many answers.
- **DNS rebinding** makes a hostile name point at `127.0.0.1` or a LAN address. Then even same-origin rules do not help, because the browser thinks it talks to the hostile site.

Session names are easy to guess (they are agent names). A page only has to guess the host address (`localhost:23000` works on the operator's own machine).

Chrome's Local Network Access (from Chrome 142) asks the user before a public page reaches a local address. Safari and Firefox do not have this yet, and the user can click Allow.

### B.2 Goals and non-goals

Goals: refuse browser requests that come from a page which is not an AI Maestro dashboard. Keep every non-browser client working (curl, scripts, the CLI, the hook, other hosts' servers, the phone app).

Non-goals: authentication; limiting which devices on the network can connect.

### B.3 Design

One function, `isAllowedBrowserOrigin(req)`, in `lib/origin-guard.mjs`, used in two places: the `upgrade` handler (every WebSocket path) and the HTTP handler for methods other than GET, HEAD and OPTIONS.

1. **No `Origin` header and no `Sec-Fetch-Site`:** allow. This is not a browser (curl, Node `fetch` between hosts, the hook, scripts).
2. **`Sec-Fetch-Site: same-origin` or `none`:** allow (the dashboard itself, or a typed URL).
3. **`Origin` matches the request's own `Host`:** allow.
4. **`Origin` is a known AI Maestro host:** allow. Known hosts are those in the hosts config and the mesh (`hostsConfig.getHosts()`; server.mjs line 2945 has the same check for another use). This keeps the multi-host dashboard working, where one host's page calls every host.
5. **`Origin` is in `AIMAESTRO_TRUSTED_ORIGINS`** (comma list; for a reverse proxy or the meeting room's public address): allow.
6. **Otherwise:** refuse. WebSocket: close the socket with HTTP 403 before the upgrade. HTTP: 403 with `{ error: 'cross-origin request refused', origin }`. Log once per origin per hour.

**Host header check (DNS rebinding):** refuse a request whose `Host` is a name that is not `localhost`, an IP address, the machine's own names, a known host's name or a trusted origin. A rebinding attack carries the attacker's name in `Host`.

**The phone app:** React Native sends an `Origin` on WebSockets (memory note: the device hub dropped phones until 0.106.99). Before enforcing, record what the app sends, and add it to rule 4 or 5. This is the reason for the audit mode below.

### B.4 Rollout

1. **Audit mode first** (`AIMAESTRO_ORIGIN_GUARD=audit`, the default from 0.106.225 until 0.106.234, when `enforce` became the default after a day with nothing to refuse on any host): log what would be refused, refuse nothing. The Doctor shows the refused origins in a `cross-origin` check.
2. **Enforce** in the next release (`enforce` becomes the default; `off` stays for one release as an escape).

### B.5 Security considerations

- Reduces risk: closes the browser path into terminals. Does not change the network model.
- Does not leak data: the refusal names only the origin that was sent.
- A device on the network can still send any request without an `Origin`. That is the accepted model (B005).

### B.6 Tests

- Unit: each rule in B.3 with and without the headers; a rebinding `Host`.
- Route test: a POST with `Origin: https://evil.example` gets 403 in enforce mode and 200 plus a log line in audit mode.
- WebSocket test on the headless smoke server (temp HOME, private tmux socket): an upgrade with a foreign `Origin` is refused; one with no `Origin` is accepted.
- Multi-host: an `Origin` of a host in the hosts config is accepted (F-rule: every feature covers agents on other hosts).

## Open questions for Juan

1. **Supported versions: "latest only"?** Recommended: yes. We ship many patch releases a day; nobody backports.
2. **List the permission-bypass modes as a design limit?** Recommended: yes, one line. Operators choose them; the document should say what they mean.
3. **Ship the origin guard in audit mode first?** Recommended: yes, one release, then enforce. The phone app and the meeting room need to be seen in the log before enforcing.
4. **Refuse unknown `Host` names (DNS rebinding)?** Recommended: yes, in the same guard, with `AIMAESTRO_TRUSTED_ORIGINS` for reverse proxies.

## Sources

- OWASP Web Security Testing Guide, Testing WebSockets (Origin check, CSWSH). https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/10-Testing_WebSockets
- Go `net/http.CrossOriginProtection` (Sec-Fetch-Site, then Origin against Host; what lolad uses). https://pkg.go.dev/net/http#CrossOriginProtection
- Filippo Valsorda, "Cross-Site Request Forgery" (why Sec-Fetch-Site is enough without tokens). https://words.filippo.io/csrf/
- Chrome, Local Network Access. https://developer.chrome.com/blog/local-network-access
- OWASP Top 10 for LLM Applications, LLM01 Prompt Injection. https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- GitHub, adding a security policy (supported versions, reporting). https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository
