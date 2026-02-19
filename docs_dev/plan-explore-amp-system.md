# AMP Messaging System Exploration Report
Generated: 2026-02-16

## Summary

The AMP (Agent Messaging Protocol) system in AI Maestro has two parallel message delivery paths:
1. **AMP v1 Route** (`/api/v1/route`) - The formal AMP protocol endpoint, used by CLI scripts and external agents. Authenticated via API keys.
2. **Web UI Messages** (`/api/messages`) - The internal endpoint, used by the dashboard. No authentication (localhost-only).

Both paths converge on the same `deliver()` function from `lib/message-delivery.ts` for local delivery.

---

## 1. AMP Route Handler: `/api/v1/route/route.ts`

**File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts`
**Size:** 594 lines

### Key Exports
- `POST(request: NextRequest): Promise<NextResponse<AMPRouteResponse | AMPError>>` (line 257)

### Internal Functions
- `parseAMPAddress(address: string)` (line 116) - Parses `name@tenant.provider` format
- `generateMessageId()` (line 145) - Creates `msg_{timestamp}_{random}` IDs
- `forwardToHost(remoteHost, recipientName, envelope, body, selfHostId)` (line 162) - HTTP forward to mesh peer
- `deliverLocally(opts: LocalDeliveryOptions)` (line 236) - Wrapper around `deliver()`
- `checkRateLimit(agentId: string): RateLimitResult` (line 78) - In-memory per-agent rate limiter

### Message Flow (POST handler, line 257-593)

```
1. Authentication (lines 259-282)
   - Bearer token OR X-Forwarded-From header
   - Returns: auth.agentId, auth.tenantId, auth.address

2. Rate Limiting (lines 284-298)
   - 60 requests per agent per minute

3. Payload Size Check (lines 300-307)
   - Max 1 MB

4. Body Validation (lines 309-331)
   - Required: to, subject, payload (with type + message)

5. Sender Resolution (lines 333-358)        <<<< FILTER INSERTION POINT A
   - isMeshForwarded? senderAgent = null
   - Otherwise: senderAgent = getAgent(auth.agentId!)
   - senderName derived from agent registry

6. Envelope Construction (lines 361-391)
   - Builds AMPEnvelope with from, to, subject, priority, timestamp

7. Signature Handling (lines 393-430)
   - Client-side signing pattern
   - Server verifies if public key available

8. Provider Scope Check (lines 432-446)
   - Rejects external providers (422)

9. Recipient Resolution (lines 448-503)      <<<< FILTER INSERTION POINT B
   - Mesh-forwarded: local-only lookup (loop guard)
   - Explicit remote: trust address
   - Otherwise: checkMeshAgentExists() then resolveAgentIdentifier()
   - Returns: resolvedHostId, resolvedAgentId

10. Remote Delivery (lines 505-546)
    - forwardToHost() with relay queue fallback

11. Local Delivery (lines 548-585)           <<<< FILTER INSERTION POINT C
    - localAgent = getAgent(resolvedAgentId)
    - deliverLocally() calls deliver()
    - Relay queue fallback on failure
```

### Data Available at Each Filter Insertion Point

**Point A (after sender resolution, line ~358):**
- `auth.agentId` - Sender's UUID (string)
- `auth.tenantId` - Sender's tenant ID (string)
- `auth.address` - Sender's AMP address (string)
- `senderAgent` - Full Agent object or null (if mesh-forwarded)
- `senderAgent.team` - Sender's team (string | undefined)
- `senderAgent.id` - Sender's UUID
- `senderAgent.name` - Sender's name
- `senderAgent.hostId` - Sender's host
- `senderName` - Resolved sender display name
- `isMeshForwarded` - Whether message is forwarded from another host
- `body.to` - Raw recipient address (string)
- `body.subject` - Message subject
- `body.payload` - Message content

**Point B (after recipient resolution, line ~503):**
- Everything from Point A, PLUS:
- `recipientName` - Extracted recipient name (string)
- `recipientParsed` - Parsed AMP address or null
- `resolvedHostId` - Host where recipient lives (string | undefined)
- `resolvedAgentId` - Recipient's UUID (string | undefined)
- `isExplicitRemote` - Whether address explicitly targets remote host

**Point C (before local delivery, line ~548):**
- Everything from Points A and B, PLUS:
- `localAgent` - Full recipient Agent object (with .team, .id, .name, .hostId, etc.)
- `recipientAgentName` - Resolved recipient name

### BEST insertion point for a messaging filter:

**Point C (line 548-566)** is the ideal location for a LOCAL delivery filter because:
1. Both sender and recipient are fully resolved
2. The `localAgent` object is loaded (has `.team` field)
3. The `senderAgent` object is available (has `.team` field)
4. You can compare `senderAgent.team` vs `localAgent.team`
5. For mesh-forwarded messages, senderAgent is null, so the filter needs a policy for that case

For a filter that also covers REMOTE delivery and RELAY, you'd need **Point B** (line ~503) but would need to load the sender agent's team separately.

---

## 2. AMP Auth: `lib/amp-auth.ts`

**File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts`
**Size:** 392 lines (393 with trailing newline)

### Key Exports

| Function | Signature | Line |
|----------|-----------|------|
| `hashApiKey` | `(apiKey: string): string` | 82 |
| `verifyApiKeyHash` | `(apiKey: string, storedHash: string): boolean` | 89 |
| `generateApiKey` | `(isTest?: boolean): string` | 102 |
| `isValidApiKeyFormat` | `(apiKey: string): boolean` | 111 |
| `createApiKey` | `(agentId: string, tenantId: string, address: string): string` | 126 |
| `validateApiKey` | `(apiKey: string): AMPApiKeyRecord \| null` | 161 |
| `getAgentIdFromApiKey` | `(apiKey: string): string \| null` | 193 |
| `extractApiKeyFromHeader` | `(authHeader: string \| null): string \| null` | 202 |
| `rotateApiKey` | `(oldApiKey: string): AMPKeyRotationResponse \| null` | 221 |
| `revokeApiKey` | `(apiKey: string): boolean` | 266 |
| `revokeAllKeysForAgent` | `(agentId: string): number` | 286 |
| `cleanupExpiredKeys` | `(): number` | 309 |
| `getKeysForAgent` | `(agentId: string): Omit<AMPApiKeyRecord, 'key_hash'>[]` | 340 |
| `authenticateRequest` | `(authHeader: string \| null): AMPAuthResult` | 365 |

### Authentication Flow

1. `authenticateRequest(authHeader)` is called by the route handler
2. Extracts API key from `Authorization: Bearer <token>` header
3. Validates key format: `amp_live_sk_<64 hex chars>` or `amp_test_sk_<64 hex chars>`
4. Looks up key hash in `~/.aimaestro/amp-api-keys.json`
5. Checks status is `active` and not expired
6. Returns `AMPAuthResult`:
   ```typescript
   interface AMPAuthResult {
     authenticated: boolean
     agentId?: string      // From API key record
     tenantId?: string     // From API key record
     address?: string      // AMP address from registration
     error?: AMPErrorCode
     message?: string
   }
   ```

### How Sender is Identified

The sender agent is identified through the `agentId` field stored in the API key record (`AMPApiKeyRecord`). When an agent registers, `createApiKey(agentId, tenantId, address)` creates a key linked to that agent's UUID. On each request, `validateApiKey()` returns the record with the `agent_id` field, which the route handler uses to look up the full Agent object via `getAgent(auth.agentId!)`.

For mesh-forwarded requests (from trusted hosts), there's no API key. Instead, the `X-Forwarded-From` header identifies the forwarding host, and a synthetic `mesh-<hostId>` agentId is created.

### Storage
- Keys stored in: `~/.aimaestro/amp-api-keys.json`
- Keys are hashed with SHA-256 before storage
- Last-used writes debounced to once per 60s

---

## 3. Message Delivery: `lib/message-delivery.ts`

**File:** `/Users/emanuelesabetta/ai-maestro/lib/message-delivery.ts`
**Size:** 190 lines

### Key Exports

```typescript
export interface DeliveryInput {
  envelope: AMPEnvelope
  payload: AMPPayload
  recipientAgentName: string
  senderPublicKeyHex?: string
  senderName: string
  senderHost?: string
  recipientAgentId?: string
  subject: string
  priority?: string
  messageType?: string
}

export interface DeliveryResult {
  delivered: boolean
  notified: boolean
  error?: string
}

export async function deliver(input: DeliveryInput): Promise<DeliveryResult>
```

### deliver() Flow (line 43-114)

1. **Content Security** (line 50-61): `applyContentSecurity()` - scans for injection patterns
2. **Inbox Write** (line 63-73): `writeToAMPInbox()` - writes to `~/.agent-messaging/agents/<name>/messages/inbox/`. REQUIRES `recipientAgentId` (UUID) - fails without it.
3. **WebSocket Push** (line 75-82): `deliverViaWebSocket()` - supplementary real-time delivery
4. **Tmux Notification** (line 84-100): `notifyAgent()` - non-fatal tmux bell
5. **Webhook Delivery** (line 102-111): `deliverViaWebhook()` - if agent has `metadata.amp.delivery.webhook_url`

### Filter Insertion in deliver()

A filter could be inserted at **line 43** (top of `deliver()` function, before content security) or **between lines 48 and 50** (after destructuring, before content security). At this point you have:
- `envelope.from` - Sender AMP address
- `envelope.to` - Recipient AMP address
- `recipientAgentName` - Recipient name
- `recipientAgentId` - Recipient UUID (optional)
- `senderName` - Sender display name
- `senderHost` - Sender host

However, you do NOT have the full Agent objects at this level. The deliver() function is intentionally thin ("no routing, no resolution"). For team-based filtering, the route handler is a better place since it already has both Agent objects.

---

## 4. Agent Registry: `lib/agent-registry.ts`

**File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts`
**Size:** 2473 lines

### Team Field

The `team` field appears in the Agent type definition (`types/agent.ts`, line 187):
```typescript
team?: string  // Team name (e.g., "Backend Team", "23blocks")
```

It also appears in:
- `CreateAgentRequest` (`types/agent.ts`, line 439): `team?: string`
- `UpdateAgentRequest` (`types/agent.ts`, line 459): `team?: string`
- Agent creation (`agent-registry.ts`, line 417): `team: request.team`

### How team is used

Currently, `team` is:
- **Set** during `createAgent()` at line 417 from `request.team`
- **Updated** during `updateAgent()` via the spread `...updates` at line 520 (generic update, no special team logic)
- **Stored** in `~/.aimaestro/agents/registry.json`
- **Not used for any filtering, access control, or routing logic** - it's purely metadata

### Key Registry Functions

| Function | Line | Signature |
|----------|------|-----------|
| `loadAgents()` | 144 | `(): Agent[]` |
| `saveAgents(agents)` | 191 | `(agents: Agent[]): boolean` |
| `getAgent(id, includeDeleted?)` | 213 | `(id: string, includeDeleted?: boolean): Agent \| null` |
| `getAgentByName(name, hostId?)` | 228 | `(name: string, hostId?: string): Agent \| null` |
| `getAgentByNameAnyHost(name)` | 254 | `(name: string): Agent \| null` |
| `getAgentByAlias(alias, hostId?)` | 267 | `(alias: string, hostId?: string): Agent \| null` |
| `getAgentByPartialName(partialName)` | 303 | `(partialName: string): Agent \| null` |
| `getAgentBySession(sessionName, hostId?)` | 328 | `(sessionName: string, hostId?: string): Agent \| null` |
| `createAgent(request)` | 336 | `(request: CreateAgentRequest): Agent` |
| `updateAgent(id, updates)` | 461 | `(id: string, updates: UpdateAgentRequest): Agent \| null` |
| `searchAgents(query)` | 985 | `(query: string): Agent[]` |
| `checkMeshAgentExists(name, timeout?)` | 2291 | `(name: string, timeout?: number): Promise<{exists, host?, agent?, checkedHosts, failedHosts}>` |

### Registry Storage
- File: `~/.aimaestro/agents/registry.json`
- Cached in-memory with mtime-based invalidation
- Cache invalidated on every `saveAgents()` call

---

## 5. Messages API: `/api/messages/route.ts`

**File:** `/Users/emanuelesabetta/ai-maestro/app/api/messages/route.ts`
**Size:** 249 lines

### Key Differences from AMP v1 Route

| Aspect | `/api/v1/route` (AMP) | `/api/messages` (Web UI) |
|--------|----------------------|-------------------------|
| Authentication | API key (Bearer token) | None (localhost only) |
| Sender identification | From API key record | From request body `from` field |
| Routing | Full mesh + relay | Via `sendFromUI()` in `message-send.ts` |
| Sent folder | Not written by route handler | Written by `sendFromUI()` |
| Content security | In `deliver()` | In `sendFromUI()` + `deliver()` |
| Response format | `AMPRouteResponse` | `{ message, notified }` |

### Endpoints

- **GET** (line 25): List messages, resolve agents, search, stats, unread count
  - `?action=resolve&agent=X` - Exact agent match
  - `?action=search&agent=X` - Partial/fuzzy search
  - `?action=unread-count&agent=X` - Unread count
  - `?agent=X&id=Y` - Get specific message
  - `?agent=X&status=unread` - List filtered messages
  - `?agent=X&box=sent` - List sent messages
- **POST** (line 138): Send message via `sendFromUI()`
  - Body: `{ from, to, subject, content, priority?, inReplyTo? }`
  - No authentication - trusts localhost
- **PATCH** (line 183): Mark read, archive
- **DELETE** (line 225): Delete message

### sendFromUI() Flow (message-send.ts, line 127)

1. Parse qualified name (`identifier@host-id`)
2. Resolve sender via `resolveAgentIdentifier(from)` - returns `{ agentId, alias, displayName, sessionName, hostId, hostUrl }`
3. Resolve recipient via `resolveAgentIdentifier(toIdentifier)`
4. Verify AMP signature if provided
5. Build internal Message object
6. Apply content security
7. Route: remote -> HTTP forward to `/api/v1/route`, local -> `deliver()`
8. Write sender's sent folder

**Filter insertion in sendFromUI()**: Best point is **line 235-237** (after content security, before routing), where you have:
- `fromAgent` - Resolved sender `{ agentId, alias, displayName, sessionName, hostId }`
- `toResolved` - Resolved recipient (same shape)
- Both `agentId` values can be used to load full Agent objects with `getAgent()` to access `.team`

---

## 6. AMP Relay: `lib/amp-relay.ts`

**File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-relay.ts`
**Size:** 382 lines

### Key Exports

| Function | Line | Signature |
|----------|------|-----------|
| `queueMessage` | 54 | `(agentId: string, envelope: AMPEnvelope, payload: AMPPayload, senderPublicKey: string): AMPPendingMessage` |
| `getPendingMessages` | 90 | `(agentId: string, limit?: number): AMPPendingMessagesResponse` |
| `acknowledgeMessage` | 135 | `(agentId: string, messageId: string): boolean` |
| `acknowledgeMessages` | 155 | `(agentId: string, messageIds: string[]): number` |
| `getPendingMessage` | 170 | `(agentId: string, messageId: string): AMPPendingMessage \| null` |
| `recordDeliveryAttempt` | 198 | `(agentId: string, messageId: string): boolean` |
| `hasPendingMessages` | 223 | `(agentId: string): boolean` |
| `getPendingCount` | 251 | `(agentId: string): number` |
| `cleanupExpiredMessages` | 286 | `(agentId: string): number` |
| `cleanupAllExpiredMessages` | 330 | `(): { agents: number; messages: number }` |
| `deleteAgentRelayQueue` | 367 | `(agentId: string): boolean` |

### Storage
- Base dir: `~/.agent-messaging/relay/{agentId}/`
- Each message: `{messageId}.json`
- TTL: 7 days (from `AMP_RELAY_TTL_DAYS`)
- Cleanup: expired messages deleted on read or via periodic cleanup

### How it Works
1. `queueMessage()` called when recipient is offline/unreachable
2. Messages stored as individual JSON files in per-agent directories
3. External agents poll via `GET /api/v1/messages/pending?agent=<id>`
4. After processing, agents call `DELETE /api/v1/messages/pending?id=<id>` to acknowledge

No filtering logic exists in the relay. A filter would need to be applied BEFORE queueMessage() is called (in the route handler or sendFromUI).

---

## Architecture Diagram: Message Flow

```
CLI (amp-send.sh)                    Web UI (Dashboard)
      |                                    |
      v                                    v
/api/v1/route [POST]              /api/messages [POST]
      |                                    |
  authenticateRequest()              sendFromUI()
      |                                    |
  sender resolution                  resolve sender/recipient
  (auth.agentId -> getAgent)         (resolveAgentIdentifier)
      |                                    |
  recipient resolution               content security
  (checkMeshAgentExists)                   |
      |                              +---> routing decision
      |                              |
  +---+---+---+                      |
  |       |   |                 local|   remote
  v       v   v                      |     |
local  remote relay              deliver() |
  |       |   |                      ^     v
  v       |   v                      |  /api/v1/route
deliver() |  queueMessage()          |   (on remote host)
          v
  forwardToHost()
  -> /api/v1/route on peer
```

---

## Recommended Filter Insertion Points (Summary)

### For AMP v1 Route (`/api/v1/route/route.ts`)

**BEST: Lines 548-566** (Local Delivery section)
- `localAgent` has `.team`, `.id`, `.name`
- `senderAgent` has `.team`, `.id`, `.name` (null if mesh-forwarded)
- Insert BEFORE `deliverLocally()` call at line 569
- Also needs a check before `queueMessage()` at line 560

**ALSO: Lines 505-506** (Remote Delivery section)
- Before `forwardToHost()`, check if cross-team delivery is allowed
- Would need to load recipient agent via `getAgent(resolvedAgentId)` to get team

### For Web UI Path (`lib/message-send.ts`)

**BEST: Lines 287-323** (Local delivery branch in sendFromUI)
- `fromAgent` resolved, `toResolved` resolved
- Load full agents via `getAgent(fromAgent.agentId)` and `getAgent(toResolved.agentId)` to get `.team`
- Insert BEFORE `deliver()` call at line 306

### For a Unified Filter

Create a new file `lib/message-filter.ts` with:
```typescript
export function checkMessageAllowed(
  senderAgentId: string | null,
  recipientAgentId: string | null,
  options?: { isMeshForwarded?: boolean }
): { allowed: boolean; reason?: string }
```
Then call it from both paths. Both paths already have sender and recipient agent IDs resolved.
