# Merge Conflict Analysis: transfer/route.ts and v1/route/route.ts

Generated: 2026-02-20T02:35:00Z

---

## 1. `app/api/agents/[id]/transfer/route.ts`

### Origin/main (28 lines)
- **Params pattern**: OLD `{ params }: { params: { id: string } }` (line 14) -- uses `params.id` directly (no await)
- **Architecture**: Thin wrapper -- delegates everything to `services/agents-transfer-service.ts`
- **No SSRF protections** in the route or in the service (confirmed by grep -- zero hits for SSRF/getHosts/isRegisteredHost/protocol-check in origin's transfer service)
- **No URL validation** -- the service just does basic `http://` prefix normalization and immediately calls fetch

### Ours (220 lines)
- **Params pattern**: NEW `{ params }: { params: Promise<{ id: string }> }` (line 33) -- uses `const { id } = await params`
- **Architecture**: All logic inline in the route handler (no service extraction)
- **SSRF protections (lines 80-109)**: URL parsing, protocol whitelist (http/https only), hostname validation against registered hosts in `hosts.json`
- **Additional validations**: `isValidUuid()` for agent lookup, mode runtime validation, JSON parse error handling, redacted logging

### Conflict Strategy for Transfer

| Aspect | Origin | Ours | Merge Action |
|--------|--------|------|--------------|
| Params | Old `{ id: string }` | New `Promise<{ id: string }>` | **Keep ours** (Next.js 15 requires async params) |
| Architecture | Thin wrapper + service | All inline | **Adopt origin's thin wrapper** but port SSRF protections into `services/agents-transfer-service.ts` |
| SSRF protections | **MISSING** | Present (lines 80-109) | **Must port to service** |
| Mode validation | Missing | Present (line 59-61) | **Must port to service** |
| UUID validation | Missing | Present (line 40) | **Must port to service** |
| JSON parse safety | Missing | Present (lines 50-54) | **Must port to service** |

### Recommended Merge

1. **Route file**: Keep origin's thin-wrapper pattern but with **async params** fix:
   ```typescript
   export async function POST(
     request: Request,
     { params }: { params: Promise<{ id: string }> }  // Next.js 15 async params
   ) {
     const { id } = await params
     const body = await request.json()
     const result = await transferAgent(id, body)
     // ... error handling ...
   }
   ```

2. **Service file** (`services/agents-transfer-service.ts`): Patch origin's `transferAgent()` to add our protections BEFORE the `fetch()` call. Insert after the URL normalization (line ~15 of origin's function):
   ```typescript
   // SSRF protection: validate protocol
   let parsedUrl: URL
   try { parsedUrl = new URL(normalizedUrl) } catch { return { error: 'Invalid target URL', status: 400 } }
   if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
     return { error: 'Only HTTP/HTTPS URLs are supported', status: 400 }
   }
   // Validate against registered hosts
   const registeredHosts = getHosts()
   const isRegistered = registeredHosts.some(h => { try { return new URL(h.url).hostname.toLowerCase() === parsedUrl.hostname.toLowerCase() } catch { return false } })
   if (!isRegistered) {
     return { error: 'Target host is not registered in hosts.json', status: 400 }
   }
   ```

3. **Also add to service**: Runtime mode validation (`mode !== 'move' && mode !== 'clone'`), UUID-safe agent resolution via `isValidUuid()`.

---

## 2. `app/api/v1/route/route.ts`

### Origin/main (25 lines)
- **Architecture**: Thin wrapper -- ALL logic (598+ lines) extracted to `services/amp-service.ts`
- **Route just**: extracts headers, parses body, calls `routeMessage()`, returns result
- **No governance**: `checkMessageAllowed` / `message-filter` does NOT exist anywhere on origin/main (confirmed: `lib/message-filter.ts` is not in the tree, zero grep hits in amp-service.ts)

### Ours (615 lines)
- **Architecture**: ALL logic inline in the route handler (never extracted to service)
- **Governance**: `checkMessageAllowed()` imported from `@/lib/message-filter` (line 40), called at lines 573-585
- **Call location**: Just before local delivery, after `localAgent` is resolved (line 556) and before `deliverLocally()` (line 590)

### Where `checkMessageAllowed()` Is Called in Our Version

```
Line 556: const localAgent = resolvedAgentId ? getAgent(resolvedAgentId) : null
...
Line 573-585:
    // ── Governance: Message Filter ────────────────────────────────────
    const filterResult = checkMessageAllowed({
      senderAgentId: senderAgent?.id || null,
      recipientAgentId: localAgent.id,
    })
    if (!filterResult.allowed) {
      return NextResponse.json({
        id: messageId, status: 'failed' as const,
        error: 'forbidden',
        message: filterResult.reason || 'Message blocked by team governance policy'
      }, { status: 403, headers: rateLimitHeaders })
    }
...
Line 587: const recipientAgentName = localAgent.name || ...
Line 590: await deliverLocally(...)
```

It sits in the "Local Delivery" section, AFTER the `localAgent` null-check (line 558) and BEFORE `deliverLocally()` (line 590). It is NOT applied to remote/mesh delivery (only local).

### Conflict Strategy for v1/route

| Aspect | Origin | Ours | Merge Action |
|--------|--------|------|--------------|
| Architecture | Thin wrapper + amp-service.ts | All inline (615 lines) | **Adopt origin's thin wrapper** |
| Governance filter | **MISSING** | Present (lines 573-585) | **Must port into `services/amp-service.ts`** |
| Logic overlap | N/A | Our 615 lines ~= origin's amp-service.ts routeMessage() | Confirm 1:1 match then discard ours |

### Recommended Merge

1. **Route file**: Take origin's thin wrapper verbatim (25 lines). It already extracts all the headers our governance code needs.

2. **Service file** (`services/amp-service.ts`): Insert governance check in `routeMessage()` at the equivalent location -- between the `localAgent` null-check and `deliverLocally()` call. In origin's amp-service.ts, that is around **line 1032** (just before `const recipientAgentName = ...`):

   ```typescript
   // ── Governance: Message Filter ────────────────────────────────────
   import { checkMessageAllowed } from '@/lib/message-filter'  // add to imports at top

   // Insert at ~line 1032 in routeMessage():
   const filterResult = checkMessageAllowed({
     senderAgentId: senderAgent?.id || null,
     recipientAgentId: localAgent.id,
   })
   if (!filterResult.allowed) {
     return {
       data: {
         id: messageId, status: 'failed' as const,
         error: 'forbidden',
         message: filterResult.reason || 'Message blocked by team governance policy'
       },
       status: 403,
       headers: rateLimitHeaders
     }
   }
   ```

3. **Also check**: Does `deliverFederated()` (at ~line 1649 in amp-service.ts) also need governance filtering? Our version only applies it to local delivery. For consistency, governance should probably also apply to federated inbound delivery (line 1649+). Decision needed from orchestrator.

---

## Summary of Required Actions

| File | Action | Complexity |
|------|--------|------------|
| `app/api/agents/[id]/transfer/route.ts` | Take origin's thin wrapper, fix async params | Low |
| `services/agents-transfer-service.ts` | Add SSRF protections, mode validation, UUID resolution | Medium |
| `app/api/v1/route/route.ts` | Take origin's thin wrapper (25 lines) | Low |
| `services/amp-service.ts` | Add `checkMessageAllowed()` at line ~1032 in `routeMessage()` | Medium |
| `lib/message-filter.ts` | **New file on our branch only** -- must be preserved in merge | None (just keep) |

### Key Risk

Origin's `services/amp-service.ts` is 1701 lines. Our governance insertion point (~line 1032) must be verified at merge time since origin may have additional commits that shift line numbers. The structural anchor is: insert AFTER `if (!localAgent)` block, BEFORE `const recipientAgentName =`.
