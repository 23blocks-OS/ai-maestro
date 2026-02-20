# Merge Conflict Analysis: Document Routes

**Generated:** 2026-02-20
**Files:** `app/api/teams/[id]/documents/route.ts`, `app/api/teams/[id]/documents/[docId]/route.ts`

---

## Summary

Origin/main has a **thin-route + service-layer** architecture: routes delegate entirely to `services/teams-service.ts`. Our branch has **fat routes** that call `lib/document-registry.ts` directly, with governance hardening (UUID validation, field-type checks, file locking, path traversal defense).

**Resolution strategy:** Adopt origin's thin-route architecture, but migrate our governance improvements INTO the service layer.

---

## Side-by-Side Comparison

### `documents/route.ts` (list + create)

| Aspect | Origin/main | Our Branch |
|--------|-------------|------------|
| **Imports** | `teams-service` only | `document-registry`, `team-registry`, `validation` |
| **Architecture** | Thin route -> service | Fat route, direct registry calls |
| **UUID validation** | None in route (none in service either) | `isValidUuid(id)` at route level |
| **Team existence** | Checked inside service | Checked at route level via `getTeam(id)` |
| **Body validation (POST)** | Service checks `title` only | Route checks `title`, `pinned` type, `tags` type |
| **Error handling** | Service returns `{ error, status }` | Try/catch with `console.error` |
| **Response shape** | `result.data` (whatever service returns) | `{ documents }` / `{ document }` |

### `documents/[docId]/route.ts` (get, update, delete)

| Aspect | Origin/main | Our Branch |
|--------|-------------|------------|
| **Imports** | `teams-service` only | `document-registry`, `team-registry`, `validation`, `TeamDocument` type |
| **UUID validation** | None | `isValidUuid(id)` AND `isValidUuid(docId)` for all endpoints |
| **Team existence (GET)** | Inside service | At route level |
| **Team existence (UPDATE)** | **NOT checked in service** (bug) | Checked at route level (CC-005) |
| **Team existence (DELETE)** | **NOT checked in service** (bug) | Checked at route level (CC-006) |
| **Update typing** | Service uses `Record<string, unknown> as any` | Route uses `Partial<Pick<TeamDocument, ...>>` |
| **Error handling** | Service returns `{ error, status }` | Try/catch with `console.error` |

---

## Governance Logic That Must Move Into Service

### 1. UUID Validation (CC-002)

**Current location:** Our route files call `isValidUuid(id)` and `isValidUuid(docId)`.

**Service status:** Origin service has **zero** UUID validation. It passes raw strings to `getTeam()` and `loadDocuments()`.

**Action needed:** Add `isValidUuid` checks at the top of each service function:
- `listTeamDocuments(teamId)` -- validate teamId
- `createTeamDocument(teamId, params)` -- validate teamId
- `getTeamDocument(teamId, docId)` -- validate both
- `updateTeamDocument(teamId, docId, params)` -- validate both
- `deleteTeamDocument(teamId, docId)` -- validate both

**Path traversal defense:** Our `lib/document-registry.ts` has a UUID regex check + `path.basename()` in `docsFilePath()`. Origin's does NOT. This defense exists at the registry layer in our branch, so if we keep our document-registry.ts, the defense-in-depth is preserved. But service-level validation is still important for early rejection and consistent error messages.

### 2. Team Existence Checks (CC-005, CC-006)

**Bugs in origin service:**
- `updateTeamDocument()` does NOT check team existence before updating
- `deleteTeamDocument()` does NOT check team existence before deleting

**Our branch:** Checks team existence for ALL endpoints (GET, POST, PUT, DELETE).

**Action needed:** Add `getTeam(teamId)` checks to `updateTeamDocument()` and `deleteTeamDocument()` in the service.

### 3. Body/Field Type Validation (POST create)

**Our branch adds:**
```typescript
// pinned type check
if (pinned !== undefined && typeof pinned !== 'boolean') {
  return { error: 'pinned must be a boolean', status: 400 }
}
// tags type check
if (tags !== undefined && (!Array.isArray(tags) || !tags.every(t => typeof t === 'string'))) {
  return { error: 'tags must be an array of strings', status: 400 }
}
```

**Origin service:** Only validates `title`. No type checks for `pinned` or `tags`.

**Action needed:** Add these validations to `createTeamDocument()` in the service.

### 4. Update typing (PUT)

**Origin service:** Uses `Record<string, unknown>` cast to `as any` -- type-unsafe.
```typescript
const updates: Record<string, unknown> = {}
// ...
const document = updateDocument(teamId, docId, updates as any)
```

**Our branch:** Uses proper `Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>>` -- type-safe.

**Action needed:** Fix the service to use the proper type instead of `as any`.

---

## File Locking Analysis

### Does the service have file locking?

**NO.** Origin's `services/teams-service.ts` does not import or use `withLock`. It calls `createDocument()`, `updateDocument()`, `deleteDocument()` which in origin's `lib/document-registry.ts` are **synchronous** (no locking).

### Does our lib/document-registry.ts have locking?

**YES.** Our branch's `lib/document-registry.ts`:
- Imports `withLock` from `@/lib/file-lock`
- `createDocument()` returns `Promise<TeamDocument>` (wrapped in `withLock('documents-' + data.teamId, ...)`)
- `updateDocument()` returns `Promise<TeamDocument | null>` (wrapped in `withLock`)
- `deleteDocument()` returns `Promise<boolean>` (wrapped in `withLock`)

### Signature change implications

Origin's registry functions are **synchronous**. Our branch made them **async** (returning Promises) because `withLock` is async. This means:

- Origin's service calls: `const document = createDocument(...)` (sync)
- Our branch's route calls: `const document = await createDocument(...)` (async)

**The service must be updated to `await` these calls** once we adopt our branch's document-registry.ts with locking.

### Current service impact

Origin's service functions `createTeamDocument`, `updateTeamDocument`, `deleteTeamDocument` are **synchronous** but will need to become **async** once the locking registry is used. The route files must then `await` the service results too. However, since they already use `await request.json()`, the routes are already async functions -- the only change needed is adding `await` to the service call.

---

## Semantic Differences in Error Handling

| Scenario | Origin | Our Branch |
|----------|--------|------------|
| Invalid UUID | No check, falls through to getTeam (returns 404) | Returns 400 "Invalid team ID" / "Invalid ID format" |
| Team not found | 404 from service | 404 from route |
| Document not found (GET) | 404 from service | 404 from route |
| Document not found (UPDATE) | 404 from service (but no team check!) | 404 from route |
| Document not found (DELETE) | 404 from service (but no team check!) | 404 from route |
| JSON parse error (POST) | Uncaught (500) | Caught by try/catch (500 with message) |
| `pinned` wrong type | Silently accepts | 400 "pinned must be a boolean" |
| `tags` wrong type | Silently accepts | 400 "tags must be an array of strings" |
| `pinned: false` via `pinned \|\| false` | **BUG:** `false \|\| false` = false (ok), but `0 \|\| false` = false (irrelevant for boolean). However, `undefined \|\| false` = false, which hides explicit `pinned: undefined` from being `undefined`. | Uses `pinned ?? false` which correctly distinguishes `undefined` from `false` |

### Minor: `pinned` default value

- Origin registry: `pinned: data.pinned || false` (falsy coercion)
- Our registry: `pinned: data.pinned ?? false` (nullish coercion -- correct)
- Origin registry: `tags: data.tags || []`
- Our registry: `tags: data.tags ?? []`

The `??` operator is correct because it only defaults on `null`/`undefined`, not on falsy values like `false` or `0`.

---

## Response Shape Differences

| Endpoint | Origin Service Returns | Our Route Returns |
|----------|----------------------|-------------------|
| GET list | `{ documents: [...] }` | `{ documents: [...] }` |
| POST create | `{ document: {...} }` | `{ document: {...} }` |
| GET single | `{ document: {...} }` | `{ document: {...} }` |
| PUT update | `{ document: {...} }` | `{ document: {...} }` |
| DELETE | `{ success: true }` | `{ success: true }` |

**Response shapes are compatible.** No breaking changes.

---

## Merge Resolution Plan

### Step 1: Keep our `lib/document-registry.ts` (with locking + path traversal defense)

Our version has:
- `withLock` for concurrent safety
- UUID regex + `path.basename()` in `docsFilePath()` for path traversal defense
- `??` instead of `||` for correct nullish defaults

### Step 2: Migrate governance into `services/teams-service.ts`

Add to the service:
1. Import `isValidUuid` from `@/lib/validation`
2. Add UUID validation to all 5 document functions
3. Add team existence checks to `updateTeamDocument()` and `deleteTeamDocument()`
4. Add `pinned` and `tags` type validation to `createTeamDocument()`
5. Fix `updateTeamDocument()` typing: replace `Record<string, unknown> as any` with `Partial<Pick<TeamDocument, ...>>`
6. Make `createTeamDocument`, `updateTeamDocument`, `deleteTeamDocument` async (to support withLock)

### Step 3: Adopt origin's thin route pattern

Replace our fat routes with origin's thin routes (just delegate to service). The routes should be 5-10 lines each, no business logic.

### Step 4: Verify `await` propagation

Since registry functions are now async (Promise-returning), the service functions that call them must `await`, and routes that call service functions must handle the result.

---

## Risk Items

1. **Service function signatures change** from sync to async for create/update/delete -- any other callers of these service functions must also be updated to `await`.
2. **Lock ordering** -- documents use `'documents-' + teamId` lock name, which is not in the documented lock ordering (`teams` > `transfers` > `governance`). Need to verify no nested lock scenarios exist with document operations.
3. **Test coverage** -- if tests mock the synchronous versions, they will break when functions become async.
