# R2 lib-teams Correctness Report: Verification of Findings

**Date:** 2026-02-19
**Source report:** docs_dev/epcp-v5-correctness-lib-teams.md
**Verified by:** orchestrator task agent

## Summary

| Finding | Severity | Status | Details |
|---------|----------|--------|---------|
| CC-001 | MUST-FIX | FIXED | UUID validation + path.basename() added to docsFilePath() |
| CC-002 | MUST-FIX | FIXED | Document file cleanup added to deleteTeam() |
| CC-003 | SHOULD-FIX | FIXED | Comment added explaining idempotent safety (accepted benign race) |
| CC-004 | SHOULD-FIX | FIXED | Timestamp logic reordered to clear-first-then-set |
| CC-005 | SHOULD-FIX | FIXED | `||` replaced with `??` for pinned and tags defaults |
| CC-006 | SHOULD-FIX | FIXED | `||` replaced with `??` for assigneeAgentId and blockedBy |
| CC-007 | SHOULD-FIX | FIXED | `Array.isArray()` guard used instead of `||` |
| CC-008 | SHOULD-FIX | FIXED | `as any` removed, properly typed Partial<Pick<...>> used |
| CC-009 | NIT | FIXED | Comment added explaining \w includes underscore |
| CC-010 | NIT | FIXED | Early return added for empty tasks array |
| CC-011 | NIT | FIXED | Comment added acknowledging the type assertion |
| CC-012 | NIT | FIXED | Early return added when status is already pending |

**Result: 12/12 findings FIXED**

---

## Detailed Verification

### CC-001: Missing path traversal protection in docsFilePath()
**Status: FIXED**
**File:** lib/document-registry.ts:23-29

Current code at lines 23-29:
```typescript
function docsFilePath(teamId: string): string {
  // Validate teamId is a strict UUID to prevent path traversal (CC-001)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId))
    throw new Error('Invalid team ID')
  // path.basename() as defense-in-depth against directory traversal
  return path.join(TEAMS_DIR, path.basename(`docs-${teamId}.json`))
}
```
Both UUID regex validation AND path.basename() defense-in-depth are present. Matches the recommended fix exactly.

---

### CC-002: Orphaned document files not cleaned up on team deletion
**Status: FIXED**
**File:** lib/team-registry.ts:327-329

Current code at lines 322-330:
```typescript
// Clean up orphaned task file for the deleted team
if (/^[0-9a-f]{8}-...$/i.test(id)) {
  const taskFile = path.join(TEAMS_DIR, path.basename(`tasks-${id}.json`))
  try { if (fs.existsSync(taskFile)) fs.unlinkSync(taskFile) } catch { /* ignore */ }
  // CC-002: Also clean up orphaned document file for the deleted team
  const docsFile = path.join(TEAMS_DIR, path.basename(`docs-${id}.json`))
  try { if (fs.existsSync(docsFile)) fs.unlinkSync(docsFile) } catch { /* ignore */ }
}
```
Document file cleanup added alongside task file cleanup, with same UUID guard and path.basename() protection.

---

### CC-003: Migration saveTeams() call bypasses file lock
**Status: FIXED**
**File:** lib/team-registry.ts:219-224

Current code at lines 219-224:
```typescript
// CC-003: Migration write is idempotent and safe without lock — worst case is a redundant write.
// When called from getTeam() (no lock), two concurrent migrations may both write, but produce identical output.
if (needsSave && !migrationDone) {
  migrationDone = true
  saveTeams(teams)
}
```
The report suggested either wrapping in a lock or accepting the benign race with a comment. The team chose to accept the benign race and added a detailed comment explaining why it is safe. This is a valid resolution.

---

### CC-004: Timestamp set/clear ordering has a no-op edge case
**Status: FIXED**
**File:** lib/task-registry.ts:159-173

Current code at lines 159-173:
```typescript
// Clear timestamps first when moving backward in workflow
if (updates.status && updates.status !== 'completed') {
  tasks[index].completedAt = undefined
}
if (updates.status && (updates.status === 'backlog' || updates.status === 'pending')) {
  tasks[index].startedAt = undefined
}

// Then set timestamps based on status changes (after clearing, so intent is unambiguous)
if ((updates.status === 'in_progress' || updates.status === 'review') && !tasks[index].startedAt) {
  tasks[index].startedAt = now
}
if (updates.status === 'completed' && !tasks[index].completedAt) {
  tasks[index].completedAt = now
}
```
Reordered to clear-first-then-set as recommended. Comments make intent explicit.

---

### CC-005: createDocument uses `||` instead of `??` for boolean/array defaults
**Status: FIXED**
**File:** lib/document-registry.ts:80-81

Current code at lines 80-81:
```typescript
pinned: data.pinned ?? false,
tags: data.tags ?? [],
```
Both `||` replaced with `??` as recommended.

---

### CC-006: createTask uses `||` instead of `??` for assigneeAgentId default
**Status: FIXED**
**File:** lib/task-registry.ts:118-119

Current code at lines 118-119:
```typescript
assigneeAgentId: data.assigneeAgentId ?? null,
blockedBy: data.blockedBy ?? [],
```
Both `||` replaced with `??` as recommended.

---

### CC-007: loadTransfers uses `|| []` instead of `?? []`
**Status: FIXED**
**File:** lib/transfer-registry.ts:34-35

Current code at lines 34-35:
```typescript
// Validate requests is actually an array (matches team-registry pattern)
return Array.isArray(data.requests) ? data.requests : []
```
Changed from `data.requests || []` to proper `Array.isArray()` guard as recommended (matches team-registry pattern).

---

### CC-008: Document API route uses `as any` type assertion
**Status: FIXED**
**File:** app/api/teams/[id]/documents/[docId]/route.ts:46

Current code at line 46:
```typescript
const updates: Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>> = {}
```
The `Record<string, unknown>` + `as any` pattern removed. Properly typed with `Partial<Pick<TeamDocument, ...>>` as recommended.

---

### CC-009: `\w` in regex allows underscore which is already listed separately
**Status: FIXED**
**File:** lib/team-registry.ts:92-93

Current code at lines 92-93:
```typescript
// CC-009: Note: \w includes underscore implicitly (equivalent to [a-zA-Z0-9_])
if (/[^\w \-.&()]/.test(clean)) {
```
Comment added explaining the implicit underscore inclusion.

---

### CC-010: resolveTaskDeps calls loadAgents() on every invocation
**Status: FIXED**
**File:** lib/task-registry.ts:64

Current code at line 64:
```typescript
if (tasks.length === 0) return []
```
Early return added before loadAgents() call as recommended.

---

### CC-011: createTeam uses type assertion for sanitized.name
**Status: FIXED**
**File:** lib/team-registry.ts:267-268

Current code at lines 267-268:
```typescript
// CC-011: Type assertion needed because sanitized is Record<string, unknown> from validateTeamMutation
name: (result.sanitized.name as string) ?? data.name,
```
Comment added acknowledging the type assertion reason. The underlying validateTeamMutation return type was not changed (would be a larger refactor), but the intent is now documented.

---

### CC-012: revertTransferToPending does not validate current status
**Status: FIXED**
**File:** lib/transfer-registry.ts:136-137

Current code at lines 136-137:
```typescript
// Already pending -- skip redundant disk write
if (requests[idx].status === 'pending') return true
```
Early return added when status is already pending, avoiding unnecessary disk write as recommended.
