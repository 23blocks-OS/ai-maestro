# AI Maestro Security Model

## Phase 1: Localhost-Only (Current)

### Authentication Model

- Application binds to `localhost` (127.0.0.1) ONLY
- No authentication required for API access
- When no `Authorization` or `X-Agent-Id` headers are present, requests are treated as **"system owner"** (web UI) with full access — see `lib/agent-auth.ts` line 39
- Team ACL checks also pass when `requestingAgentId` is undefined — see `lib/team-acl.ts` line 41
- This is acceptable because only the local OS user can reach the port

### Endpoints That Skip Auth When Headers Are Absent

All governance-enforced endpoints use the same `authenticateAgent()` pattern from `lib/agent-auth.ts`:

| Category | Examples | Behavior without auth headers |
|----------|----------|-------------------------------|
| **Team CRUD** | `POST /api/teams`, team member operations | Full access (system owner) |
| **Governance** | Manager assignment, COS assignment, transfers | Full access (system owner) |
| **Meetings** | Create, update, delete meetings | Full access (system owner) |
| **Messages** | Send, read, delete messages | Full access (system owner) |
| **Webhooks** | Create, update, delete webhooks | Full access (system owner) |
| **Agent creation** | `POST /api/agents` | Full access (system owner) |
| **Sessions** | `GET /api/sessions`, terminal WebSocket | No auth at all (read-only discovery) |
| **Settings** | Plugin toggles, marketplace management | No auth at all (local config) |

When auth headers **are** present but invalid (bad Bearer token, mismatched X-Agent-Id), the request is rejected with HTTP 401/403. The bypass only applies when headers are entirely absent.

### Cryptographic Security (Active)

These mechanisms are enforced even in Phase 1:

- **Ed25519 host keys** (`lib/host-keys.ts`): Each AI Maestro instance generates a keypair at `~/.aimaestro/host-keys/`. Used for host attestations and cross-host governance request signing.
- **API key hashing** (`lib/amp-auth.ts`): API keys are stored as `sha256:` prefixed hashes, never plaintext. Verification uses constant-time comparison (`timingSafeEqual`) to prevent timing attacks.
- **Message signing**: AMP messages are signed with Ed25519 agent keys. Signatures are verified on receipt.
- **Identity spoofing prevention**: Sending `X-Agent-Id` without a valid `Authorization: Bearer` token is rejected (HTTP 401).

### Rate Limiting (Active)

In-memory rate limiter (`lib/rate-limit.ts`) protects password-based operations: 5 attempts per 60-second window.

| Operation | Rate limit key |
|-----------|---------------|
| Manager password authentication | `governance-manager-auth` |
| Manager password change | `governance-password-change` |
| Trust relationship auth | `governance-trust-auth` |
| Team password verification | `team-password-{teamId}` |
| Cross-host governance submit | `cross-host-governance-submit-{ip}` |
| Cross-host governance approve | `cross-host-governance-approve-{ip}` |
| Cross-host governance reject | `cross-host-governance-reject-{ip}` |

## Phase 2: Network Access (Planned)

When remote access is enabled, the following changes are required:

1. **Mandatory authentication**: All governance endpoints must require valid `Authorization: Bearer` tokens — the "system owner" bypass (`authHeader === null && agentIdHeader === null → full access`) must be removed
2. **CSRF tokens**: Add `X-Request-Source` header with per-session CSRF token to distinguish web UI from other clients (see TODO in `lib/team-acl.ts` line 39-40)
3. **TLS**: Enable HTTPS for all connections (currently unnecessary for localhost)
4. **CORS**: Configure allowed origins (currently no origin validation)
5. **Distributed rate limiting**: Replace in-memory `Map` with persistent store for multi-instance deployments

## Deployment Warning

**DO NOT expose port 23000 to untrusted networks.** Phase 1 has no authentication — any process that can reach the port has full access to all governance operations including manager assignment, team creation, agent messaging, and webhook management.
