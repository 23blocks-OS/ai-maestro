# Merge Analysis: origin/main → feature/team-governance

**Date:** 2026-02-20
**Merge-base:** f0d6cee
**Our branch:** feature/team-governance (12 commits, v0.23.17)
**Origin/main:** 7c236bb (14 commits, v0.24.9)

## Overview

Origin/main has diverged significantly with a **service layer extraction** (v0.24.0) that moves all business logic from API routes into `services/*.ts` files. Our branch added **team governance enforcement** directly into those same API routes.

## Origin/Main Commits (14 total)

| Commit | Summary | Risk |
|--------|---------|------|
| e295e0f | **Extract service layer, add headless mode, abstract agent runtime (v0.24.0)** | **CRITICAL** — Moves all API route logic to services/ |
| 6aaf349 | Make tsx production dependency, fix double-paste, add CHANGELOG (v0.24.6) | LOW — package.json, version |
| 1c0dfe6 | Fix updater ecosystem.config.js detection, close 5 issues (v0.24.7) | LOW — version bump |
| 1a0eb5f | Add OpenClaw tmux session discovery (v0.24.8) | LOW — new feature, no overlap |
| 435b039 | Fix CI build: create data/ directory before touch | LOW — CI only |
| cae678a | Promote OpenClaw agents to first-class citizens (v0.24.9) | LOW — version bump, new feature |
| 390bbb1 | Fix plugin submodule pointer + AIM_AGENT_* env vars | LOW — plugin pointer |
| e3cc9b9 | Restore CHANGELOG.md with v0.24.7-v0.24.9 entries | NONE — new file |
| 7 merge commits | PRs #231, #232, #235, #238, #239, #240 | NONE — merge commits |

## Files Modified on BOTH Branches (17 — Conflict Risk)

### Category 1: API Routes (CRITICAL — Architecture Conflict)

These files have a **structural conflict**: origin extracted logic to services, our branch added governance inline.

| File | Origin Change | Our Change |
|------|--------------|------------|
| `app/api/teams/route.ts` | Thin wrapper → `services/teams-service.ts` | Added governance: type validation, managerId, agentNames collision check, TeamValidationException |
| `app/api/teams/[id]/route.ts` | Thin wrapper → `services/teams-service.ts` | Added: UUID validation, `checkTeamAccess()` ACL, `getManagerId()`, `validateTeamMutation()`, closed-team DELETE guard |
| `app/api/teams/[id]/tasks/route.ts` | Thin wrapper → `services/teams-service.ts` | Added: UUID validation, `checkTeamAccess()`, priority/description/assignee validation |
| `app/api/teams/[id]/tasks/[taskId]/route.ts` | Thin wrapper → `services/teams-service.ts` | Added: UUID validation, `checkTeamAccess()`, status validation |
| `app/api/teams/[id]/documents/route.ts` | Thin wrapper → `services/teams-service.ts` | Added: UUID validation, `checkTeamAccess()`, JSON validation |
| `app/api/teams/[id]/documents/[docId]/route.ts` | Thin wrapper → `services/teams-service.ts` | Added: UUID validation, `checkTeamAccess()` |
| `app/api/agents/[id]/transfer/route.ts` | Thin wrapper → `services/agents-transfer-service.ts` | Renamed local `TransferRequest` to `HostTransferRequest`, added URL validation, SSRF protection |
| `app/api/v1/route/route.ts` | 598 deletions → thin wrapper for `services/amp-service.ts` | Added governance message filtering in `forwardFromUI()` path |

### Category 2: Version/Docs (TRIVIAL — Auto-Resolvable)

| File | Origin Change | Our Change |
|------|--------------|------------|
| `version.json` | 0.23.10 → 0.24.9 | 0.23.10 → 0.23.17 |
| `package.json` | version + tsx dep | version only |
| `README.md` | version badge | version badge |
| `docs/ai-index.html` | version numbers | version numbers |
| `docs/BACKLOG.md` | version + entries | version + governance note |
| `docs/index.html` | version numbers | version numbers |
| `scripts/remote-install.sh` | version number | version + branch check fixes |
| `yarn.lock` | tsx dependency | no changes (just lockfile) |
| `plugin` | submodule pointer | submodule pointer |

## Origin-Only Files (141 — Must Absorb)

### New Service Layer (21 files)
```
services/agents-chat-service.ts
services/agents-core-service.ts
services/agents-directory-service.ts
services/agents-docker-service.ts
services/agents-docs-service.ts
services/agents-graph-service.ts
services/agents-memory-service.ts
services/agents-messaging-service.ts
services/agents-playback-service.ts
services/agents-repos-service.ts
services/agents-skills-service.ts
services/agents-subconscious-service.ts
services/agents-transfer-service.ts
services/amp-service.ts
services/config-service.ts
services/domains-service.ts
services/headless-router.ts
services/help-service.ts
services/hosts-service.ts
services/marketplace-service.ts
services/messages-service.ts
services/sessions-service.ts
services/shared-state-bridge.mjs
services/shared-state.ts
services/teams-service.ts
services/webhooks-service.ts
```

### New Tests (4 files)
```
tests/services/agents-core-service.test.ts
tests/services/sessions-service.test.ts
tests/services/teams-service.test.ts
tests/test-utils/fixtures.ts
tests/test-utils/service-mocks.ts
```

### New/Modified Infrastructure
```
lib/agent-runtime.ts (new — abstract agent runtime)
lib/tmux-discovery.ts (new — extracted from server.mjs)
lib/notification-service.ts (new — extracted)
lib/index-delta.ts (modified)
server.mjs (modified — uses new abstractions)
components/TerminalView.tsx (modified)
hooks/useTerminal.ts (modified)
hooks/useWebSocket.ts (modified)
types/agent.ts (modified)
types/session.ts (modified)
CHANGELOG.md (new)
update-aimaestro.sh (modified)
.github/workflows/ci.yml (modified)
```

## Our-Only Files (166 — Must Preserve)

### Governance System (new)
```
app/api/governance/                    — 7 route files
components/governance/                 — 5 components
hooks/useGovernance.ts, useTeam.ts     — 2 hooks
lib/governance.ts                      — governance config/password
lib/team-acl.ts                        — team access control
lib/message-filter.ts                  — governance message filtering
lib/message-send.ts                    — governance-aware sending
lib/transfer-registry.ts              — team transfer requests
lib/file-lock.ts                       — file-based mutex
lib/rate-limit.ts                      — password rate limiting
lib/validation.ts                      — UUID validation
lib/document-registry.ts              — document CRUD (enhanced)
lib/team-registry.ts                   — enhanced with validateTeamMutation
types/governance.ts                    — governance types
types/team.ts                          — enhanced team types
tests/                                 — 12 test files
```

## Conflict Analysis by File

### CRITICAL: app/api/teams/route.ts

**Origin (v0.24.0+):** Thin wrapper calling `listAllTeams()` and `createNewTeam()` from teams-service.
**Our branch:** Full route with governance validation (type, managerId, agentNames, TeamValidationException).

**Resolution:** Accept origin's thin-wrapper pattern. Move governance logic into `services/teams-service.ts`:
- `createNewTeam()` must accept `type`, `chiefOfStaffId`, `managerId`, `agentNames` params
- Service function must call `createTeam()` with full governance params
- Service must catch `TeamValidationException` and return appropriate status

### CRITICAL: app/api/teams/[id]/route.ts

**Origin:** Thin wrapper calling `getTeamById`, `updateTeamById`, `deleteTeamById` from teams-service.
**Our branch:** Full route with UUID validation, `checkTeamAccess()` ACL, `getManagerId()`, `validateTeamMutation()`, closed-team DELETE guard.

**Resolution:** Accept origin's thin-wrapper pattern. Governance logic moves to service:
- `getTeamById()` must accept optional `agentId` for ACL check
- `updateTeamById()` must accept `managerId` for mutation validation
- `deleteTeamById()` must enforce closed-team guard
- All service functions must validate UUID and run `checkTeamAccess()`

### CRITICAL: app/api/teams/[id]/tasks/route.ts + [taskId]/route.ts

**Origin:** Thin wrappers.
**Our branch:** Added UUID validation, ACL checks, field validation.

**Resolution:** Move ACL and validation into service functions. Routes stay thin.

### CRITICAL: app/api/teams/[id]/documents/route.ts + [docId]/route.ts

**Origin:** Thin wrappers.
**Our branch:** Added UUID validation, ACL, JSON validation.

**Resolution:** Move to service.

### MODERATE: app/api/agents/[id]/transfer/route.ts

**Origin:** Thin wrapper for `agents-transfer-service.ts`. Uses old `params` pattern (not Promise).
**Our branch:** Renamed TransferRequest, added URL validation, SSRF protection.

**Resolution:** Our SSRF protections must move to `agents-transfer-service.ts`. Our params pattern (Promise) should be adopted since origin's transfer route still uses old pattern.

### MODERATE: app/api/v1/route/route.ts

**Origin:** Thin wrapper for `amp-service.ts` — 598 lines deleted from route.
**Our branch:** Added governance message filtering.

**Resolution:** Governance filtering must move to `amp-service.ts`. Since the route is now tiny, any inline governance logic must live in the service.

### TRIVIAL: Version files

**Resolution:** Take origin's version numbers (0.24.9) as base. We'll bump to 0.25.0 after merge to signal governance addition.

## Architecture Reconciliation Strategy

### Phase 1: Accept Service Layer
1. Take all origin-only files (services/, new lib/, new tests/, CHANGELOG, etc.)
2. Take origin's thin-wrapper API routes as the base

### Phase 2: Integrate Governance into Services
1. Enhance `services/teams-service.ts` with governance imports and logic
2. Enhance `services/amp-service.ts` with message filtering
3. Enhance `services/agents-transfer-service.ts` with SSRF protection
4. Thin-wrapper routes extract headers (X-Agent-Id) and pass to service

### Phase 3: Preserve Our Governance Files
1. All our governance-specific files are origin-only additions — no conflict
2. Our enhanced `lib/team-registry.ts`, `lib/document-registry.ts`, `lib/task-registry.ts` need to be preserved since the services import from them

### Phase 4: Test Reconciliation
1. Origin added `tests/services/teams-service.test.ts` — needs governance coverage
2. Our 12 test files must all still pass
3. New tests needed for governance paths in services

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Service layer doesn't know about governance | HIGH | Must integrate governance into service functions |
| Origin's teams-service.ts has no ACL | HIGH | Add checkTeamAccess to all service functions |
| Origin's teams-service has no validateTeamMutation | HIGH | Add to createNewTeam, updateTeamById, deleteTeamById |
| Origin's thin routes lose X-Agent-Id header access | MEDIUM | Routes extract headers and pass to service |
| Tests may break from import path changes | MEDIUM | Service tests need governance mocks |
| Version conflict | LOW | Take 0.24.9, bump to 0.25.0 |
| Plugin submodule pointer | LOW | Take latest pointer |

## Recommended Merge Strategy

1. **Do NOT use `git merge`** — the structural conflicts are too complex for auto-merge
2. Instead: **Cherry-pick origin's commits onto our branch**, resolving each conflict manually
3. Or: **Rebase our governance changes onto origin/main**, moving governance logic into services
4. Or: **Manual merge** — merge origin, then re-apply governance logic into the service layer

**Recommended: Option 3 (merge + re-apply governance into services)** because:
- Preserves all origin changes cleanly
- Our governance files (new files) have no conflicts
- Only the 8 API route files need governance logic moved to services
- Can be done file-by-file with full test coverage
