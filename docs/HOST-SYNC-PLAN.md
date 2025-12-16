# Bidirectional Host Synchronization Implementation Plan

## Executive Summary

AI Maestro currently supports a one-way host registration model: Host A registers Host B in its local `hosts.json`, but Host B has no knowledge of Host A. This creates an asymmetric network topology where hosts cannot discover each other automatically.

This plan proposes a **bidirectional peer exchange protocol** that enables:
1. Automatic back-registration when a host is added
2. Exchange of known peer lists to achieve eventual mesh connectivity
3. Graceful handling of offline hosts with retry logic

## The Problem

```
MacBook (Host A)                      Mac Mini (Host B)
┌──────────────────┐                  ┌──────────────────┐
│ hosts.json:      │                  │ hosts.json:      │
│ - local          │   A knows B      │ - local          │
│ - mac-mini ──────┼─────────────────>│                  │
│                  │                  │ (no macbook!)    │
│                  │   B doesn't      │                  │
│                  │   know A         │                  │
└──────────────────┘                  └──────────────────┘
```

Adding a third host compounds the problem - manual registration on every host becomes tedious.

## Solution: Peer Exchange Protocol

### Architecture Overview

```
MacBook (Host A)                      Mac Mini (Host B)
┌──────────────────┐                  ┌──────────────────┐
│ hosts.json:      │    1. Register   │ hosts.json:      │
│ - local          │ ──────────────>  │ - local          │
│ - mac-mini       │    2. Back-reg   │ - macbook  <─────│
│                  │ <──────────────  │                  │
│                  │    3. Exchange   │                  │
│                  │ <──────────────> │                  │
└──────────────────┘                  └──────────────────┘

Cloud Server (Host C) joins:
┌──────────────────┐
│ 4. C registers A │
│ 5. A back-regs C │
│ 6. A shares B    │──> C now knows A, B
│ 7. C shares self │──> A updates C
│ 8. A shares C    │──> B now knows C
└──────────────────┘

Result: A<->B<->C mesh (eventual consistency)
```

### Key Design Principles

1. **Decentralized**: No central DNS or registry server
2. **Eventually Consistent**: All hosts converge to the same peer list
3. **Resilient**: Offline hosts don't block operations
4. **Idempotent**: Re-registering the same host is safe

---

## Implementation Plan

### Phase 1: New API Endpoints

#### 1.1 POST /api/hosts/register-peer

Accept registration from a remote host and add it to local hosts.json.

**Request:**
```typescript
{
  host: {
    id: string       // Remote host's ID
    name: string     // Display name
    url: string      // How to reach them
  }
  source: {
    initiator: string    // Which host initiated
    timestamp: string
  }
}
```

**Response:**
```typescript
{
  success: boolean
  registered: boolean    // true if newly added
  host: Host             // Local host info (for back-registration)
  knownHosts: Host[]     // All known remote hosts (for peer exchange)
}
```

#### 1.2 POST /api/hosts/exchange-peers

Exchange known hosts with a peer to achieve mesh connectivity.

**Request:**
```typescript
{
  fromHost: { id, name, url }
  knownHosts: Host[]     // All remote hosts this peer knows
}
```

**Response:**
```typescript
{
  success: boolean
  mergedHosts: Host[]    // All hosts after merge
  newlyAdded: string[]   // IDs of hosts that were new to us
}
```

#### 1.3 GET /api/hosts/identity

Return this host's identity info for registration.

**Response:**
```typescript
{
  host: {
    id: string
    name: string
    url: string
    type: 'local'
    version: string
  }
}
```

### Phase 2: Enhanced Host Registration Flow

Modify `addHost()` to `addHostWithSync()`:

```
1. Add host locally (existing logic)
   └─> hosts.json updated

2. Register ourselves with remote host
   └─> POST {remoteUrl}/api/hosts/register-peer
   └─> Response: { success, host: remoteInfo, knownHosts: [...] }

3. Exchange peers
   └─> For each host in response.knownHosts:
       └─> If not already known: add to local hosts.json
   └─> Send our known hosts to remote
       └─> POST {remoteUrl}/api/hosts/exchange-peers
```

### Phase 3: Error Handling for Offline Hosts

#### Retry Queue

```typescript
interface PendingSync {
  hostId: string
  hostUrl: string
  action: 'register' | 'exchange'
  attempts: number
  lastAttempt: Date
  nextRetry: Date
}
```

#### Exponential Backoff

```
5 minutes → 15 minutes → 1 hour → 4 hours
```

### Phase 4: UI Updates

1. Show sync status badge (green = synced, yellow = pending, red = failed)
2. Add "Resync" button for failed syncs
3. Update AddHostWizard to show sync result

---

## Data Flow: Third Host Joins

```
Initial State:
  A: [local, B]
  B: [local, A]
  C: [local]

Step 1: User on C adds A
  C → A: health check
  C: [local, A]

Step 2: C registers with A
  C → A: POST /api/hosts/register-peer { host: C }
  A: [local, B, C]
  A → C: { knownHosts: [B] }

Step 3: Peer exchange
  C learns about B from A
  C: [local, A, B]

Step 4: Propagate to B
  A → B: POST /api/hosts/exchange-peers { knownHosts: [C] }
  B: [local, A, C]

Final State (full mesh):
  A: [local, B, C]
  B: [local, A, C]
  C: [local, A, B]
```

---

## Files to Create

1. `app/api/hosts/register-peer/route.ts` - Accept peer registration
2. `app/api/hosts/exchange-peers/route.ts` - Exchange known hosts
3. `app/api/hosts/identity/route.ts` - Return local identity
4. `lib/host-sync.ts` - Sync logic
5. `lib/host-sync-queue.ts` - Retry queue
6. `types/host-sync.ts` - Type definitions

## Files to Modify

1. `lib/hosts-config.ts` - Add `addHostWithSync()`
2. `app/api/hosts/route.ts` - Support sync option in POST
3. `components/settings/HostsSection.tsx` - Sync status UI
4. `types/host.ts` - Add sync fields

---

## Rollout Phases

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Basic Sync (back-registration) | 2 days |
| 2 | Peer Exchange | 1 day |
| 3 | Resilience (retry queue) | 1 day |
| 4 | UI Polish | 1 day |

**Total: ~5 days**

---

## Security Notes

- Phase 1: Relies on network isolation (Tailscale, LAN)
- URL validation to prevent injection
- Rate limiting on peer exchange
- Future: Add shared secret or API key for authentication
