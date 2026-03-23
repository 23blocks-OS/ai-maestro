# GitHub Project Browser Architecture

## Date: 2026-03-15

## Summary

AI Maestro kanban becomes a **browser** (GUI) of GitHub Projects v2. GitHub is the sole source of truth. Every team is linked to a GitHub repo + project.

## Architecture

```
UI (useTasks polls 5s)
  |
  v
GET/POST/PUT/DELETE /api/teams/{id}/tasks
  |
  v
teams-service.ts
  |
  v
lib/github-project.ts  (GraphQL via `gh api graphql`)
  |
  v
GitHub Projects v2  (SOURCE OF TRUTH)
```

## Team Configuration

```typescript
// Added to Team interface in types/team.ts
githubProject: {
  owner: string          // "23blocks-OS"
  repo: string           // "ai-maestro"
  number: number         // Project number (e.g., 5)
  // Cached field IDs (refreshed on first use + every 1h)
  _cachedProjectId?: string
  _cachedStatusFieldId?: string
  _cachedPriorityFieldId?: string
  _cachedStatusOptions?: { id: string; name: string }[]
  _cachedAt?: string     // ISO timestamp
}
```

## API Behavior

| Endpoint | GitHub Action |
|----------|--------------|
| GET /api/teams/{id}/tasks | Query project items via GraphQL, map to Task[] |
| POST /api/teams/{id}/tasks | Create GitHub issue + add to project + set Status field |
| PUT /api/teams/{id}/tasks/{taskId} | Update project item fields (Status, Priority, assignee) |
| DELETE /api/teams/{id}/tasks/{taskId} | Remove item from project (optionally close issue) |
| GET /api/teams/{id}/kanban-config | Derived from GitHub Project Status field options |
| PUT /api/teams/{id}/kanban-config | Update Status field options on GitHub Project |

## Task ID Mapping

GitHub Project items have a `node_id` (e.g., `PVTI_...`). This becomes the task ID in AI Maestro. The linked issue number is stored in `externalRef`.

## Caching Strategy

- Field IDs (projectId, statusFieldId, etc.): cached 1 hour
- Task list (GET): cached 10 seconds (useTasks polls every 5s)
- Writes: bypass cache, invalidate task list cache on success

## Field Mapping

| AI Maestro Task | GitHub Project Field | Type |
|----------------|---------------------|------|
| status | Status | SingleSelect |
| priority | Priority | SingleSelect |
| assigneeAgentId | Assignees (issue) | User |
| subject | Title (issue) | Text |
| description | Body (issue) | Text |
| labels | Labels (issue) | Label[] |
| taskType | mapped to label | Label |
| prUrl | linked PR | Reference |
| blockedBy | "Blocked by #N" in body | Text parsing |

## Kanban Columns = GitHub Status Field Options

No separate kanban config storage. Columns ARE the GitHub Project Status field options. When user customizes columns in AI Maestro, it updates the GitHub Project Status field.

## Implementation Files

| File | Purpose |
|------|---------|
| `lib/github-project.ts` | GraphQL operations, caching, field mapping |
| `types/team.ts` | Add `githubProject` to Team interface |
| `services/teams-service.ts` | Route task ops through github-project.ts |
| `kanban-sync.py` | Simplified to `link`/`unlink`/`status` setup tool |
| `~/.claude/skills/team-kanban/SKILL.md` | Updated docs |

## Rate Limits

GitHub API: 5000 requests/hour (authenticated via `gh`).
With 10s cache + 5s polling: ~360 requests/hour per open dashboard tab.
Multiple tabs share server-side cache, so total is ~360/hour regardless of tab count.

## Error Handling

- `gh` not installed or not authenticated: Return 503 with setup instructions
- GitHub API error: Return 502 with GitHub error message
- Rate limited: Return 429, increase cache TTL temporarily
- Network timeout: Return 504
