# Agent Email Identity Specification

**Version:** 1.1
**Date:** 2026-01-27
**Status:** Draft
**Authors:** Lola (original), AI Maestro team (refined)

---

## Scope

AI Maestro provides **email identity** for agents. We:
- Store email addresses as part of agent identity
- Enforce global uniqueness
- Expose APIs for external systems to query and subscribe to changes

We do **NOT**:
- Implement email routing
- Integrate with Mandrill or any email provider
- Handle inbound/outbound email transport

External systems (gateways, email bridges) consume our identity APIs and implement their own routing logic.

---

## Problem

Agents need email identity for external communication. AI Maestro is the source of truth for agent identity, so email addresses belong in the agent registry. External systems need a way to:
1. Query which agent owns an email address
2. Get notified when email identity changes

---

## Current State

```typescript
// types/agent.ts (current)
export interface EmailTool {
  address: string               // Single email address
  provider: 'local' | 'smtp'
  enabled: boolean
}
```

This is minimal and doesn't support:
- Multiple email addresses per agent
- Uniqueness enforcement
- Change notifications for external systems

---

## Proposed Changes

### 1. Extended EmailTool Interface

```typescript
// types/agent.ts

export interface EmailTool {
  enabled: boolean
  addresses: EmailAddress[]
}

export interface EmailAddress {
  address: string           // Full email: "titania@23blocks.23smartagents.com"
  primary?: boolean         // Primary address for this agent
  displayName?: string      // Friendly name: "Titania"
  metadata?: Record<string, string>  // Arbitrary metadata for consumers
}
```

**Design decisions:**
- No `tenant`, `localPart`, `type` - those are consumer concerns to parse/interpret
- No `outbound` config - that's gateway configuration, not identity
- Generic `metadata` field for consumer-specific data (e.g., gateway can store tenant info)

### 2. Agent Registry Example

```json
{
  "id": "uuid-23blocks-iac",
  "name": "23blocks-iac",
  "label": "Titania",
  "hostId": "mac-mini",
  "tools": {
    "email": {
      "enabled": true,
      "addresses": [
        {
          "address": "titania@23blocks.23smartagents.com",
          "primary": true,
          "displayName": "Titania"
        },
        {
          "address": "iac@agents.thecompanytool.com",
          "displayName": "IaC Team"
        }
      ]
    }
  }
}
```

---

## API Endpoints

### Email Index (for consumers)

```
GET /api/agents/email-index
```

Returns a mapping of email addresses to agent identity. Consumers use this to build their routing tables.

**Response:**
```json
{
  "titania@23blocks.23smartagents.com": {
    "agentId": "uuid-23blocks-iac",
    "agentName": "23blocks-iac",
    "hostId": "mac-mini",
    "displayName": "Titania",
    "primary": true
  },
  "iac@agents.thecompanytool.com": {
    "agentId": "uuid-23blocks-iac",
    "agentName": "23blocks-iac",
    "hostId": "mac-mini",
    "displayName": "IaC Team",
    "primary": false
  }
}
```

**Query parameters:**
- `?address=titania@23blocks.23smartagents.com` - lookup single address
- `?agentId=uuid-123` - get all addresses for an agent

### Email Address Management

```
POST   /api/agents/:id/email/addresses
```

Add an email address to an agent.

**Request:**
```json
{
  "address": "newemail@domain.com",
  "displayName": "New Email",
  "primary": false
}
```

**Response:** `201 Created` or `409 Conflict` if address is claimed.

```
DELETE /api/agents/:id/email/addresses/:address
```

Remove an email address from an agent.

### Modified Endpoints

| Method | Endpoint | Change |
|--------|----------|--------|
| `POST` | `/api/agents` | `CreateAgentRequest` accepts `tools.email` |
| `PATCH` | `/api/agents/:id` | `UpdateAgentRequest` accepts `tools.email` |

---

## Webhook Subscriptions (Change Notifications)

External systems subscribe to identity changes instead of polling.

### Subscribe

```
POST /api/webhooks
```

**Request:**
```json
{
  "url": "https://email-gateway.example.com/hooks/identity-changed",
  "events": ["agent.email.changed"],
  "secret": "shared-secret-for-hmac"
}
```

**Response:**
```json
{
  "id": "webhook-uuid",
  "url": "https://email-gateway.example.com/hooks/identity-changed",
  "events": ["agent.email.changed"],
  "createdAt": "2026-01-27T12:00:00Z"
}
```

### Webhook Payload

```json
{
  "event": "agent.email.changed",
  "timestamp": "2026-01-27T12:00:00Z",
  "agent": {
    "id": "uuid-23blocks-iac",
    "name": "23blocks-iac",
    "hostId": "mac-mini"
  },
  "changes": {
    "added": ["newemail@domain.com"],
    "removed": ["oldemail@domain.com"],
    "current": ["titania@23blocks.23smartagents.com", "newemail@domain.com"]
  }
}
```

Payloads are signed with HMAC using the subscriber's secret.

### Management

```
GET    /api/webhooks           # List all webhooks
GET    /api/webhooks/:id       # Get specific webhook
DELETE /api/webhooks/:id       # Unsubscribe
POST   /api/webhooks/:id/test  # Send test payload
```

### Supported Events

| Event | Trigger |
|-------|---------|
| `agent.email.changed` | Email addresses added/removed/modified |
| `agent.created` | New agent registered |
| `agent.deleted` | Agent removed |
| `agent.updated` | Any agent field changed |

---

## Uniqueness Enforcement

### Rule

Each email address can be claimed by exactly one agent, globally across all hosts.

### Enforcement

**On registration/update:**
1. Check local registry for duplicate
2. Query all known hosts' `/api/agents/email-index?address=X`
3. If claimed elsewhere → `409 Conflict`

**Error response:**
```json
{
  "error": "conflict",
  "message": "Email address titania@23blocks.23smartagents.com is already claimed",
  "claimedBy": {
    "agentName": "other-agent",
    "hostId": "other-host"
  }
}
```

### Validation Rules

- Valid email format (RFC 5322)
- Case-insensitive uniqueness (`Titania@X.com` = `titania@x.com`)
- Max 10 addresses per agent
- Address max length: 254 characters

### Same local-part, different domains

| Address | Agent | Result |
|---------|-------|--------|
| `lola@juan.23smartagents.com` | pas-lola | OK |
| `lola@23blocks.23smartagents.com` | different-agent | OK (different domain) |
| `lola@juan.23smartagents.com` | another-agent | REJECTED (duplicate) |

---

## Separation of Concerns

| Concern | Owner |
|---------|-------|
| Email address identity | AI Maestro |
| Uniqueness enforcement | AI Maestro |
| Change notifications (webhooks) | AI Maestro |
| Email routing | External gateway |
| Inbound webhooks (Mandrill, etc.) | External gateway |
| Outbound sending | External gateway |
| Attachment storage | External gateway |
| Thread tracking | External gateway |
| Bounce handling | External gateway |
| Two-tier model (webhook vs mailbox) | External gateway |
| Unregistered address handling | External gateway |

---

## Implementation Order

1. **Extend types** - Update `EmailTool`, add `EmailAddress` interface
2. **Registry storage** - Store email addresses in agent registry
3. **Uniqueness check** - Local + cross-host validation
4. **Email index API** - `GET /api/agents/email-index`
5. **Webhook system** - Generic webhook subscription for identity changes
6. **Address management** - Add/remove address endpoints

---

## Open Questions

1. **Cross-host uniqueness latency** - Querying all hosts adds latency to registration. Alternative: eventual consistency with conflict resolution?
2. **Webhook delivery guarantees** - Retry policy? Dead letter queue?
3. **Host discovery** - Use existing `hosts.json` mesh for cross-host uniqueness checks?

---

## Future Considerations

The webhook system is generic and could be useful beyond email. Any external system could subscribe to agent lifecycle events:
- CI/CD systems reacting to agent changes
- Monitoring dashboards tracking agent status
- External orchestration tools
- Email gateways rebuilding routing indexes

This positions AI Maestro as an identity provider with event-driven integration capabilities.
