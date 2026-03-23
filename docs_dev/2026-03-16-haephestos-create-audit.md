# Haephestos handleCreate Audit — 2026-03-16

## Files Audited

- `app/agent-creation/page.tsx` (full, lines 1-299+)
- `app/page.tsx` (lines 1-300, focused on agent selection / URL params)
- `app/api/sessions/create/route.ts` (full)
- `services/sessions-service.ts` (lines 1-684, focused on createSession)

---

## Finding 1: `router.push('/')` does NOT select the new agent

**Code (line 266):**
```
router.push('/')
```

The home page (`app/page.tsx`) reads a `?agent=<agentId>` URL query param on mount to deep-link to a specific agent (lines 166-202). If `?agent=<agentId>` is present, `setActiveAgentId` is called with that value and the param is stripped from the URL.

**The bug:** `handleCreate` calls `router.push('/')` with no query string. The newly created agent's `agentId` is never appended as `?agent=<id>`. As a result:
- The user lands on the dashboard with no agent pre-selected.
- The first online agent is auto-selected instead (line 277: `if (hasOnlineAgents && !activeAgentId && firstOnlineAgentId)`).
- This will likely be the Haephestos session (which was just deleted) or an unrelated agent — not the newly created one.

**Fix needed:** After `createRes` succeeds, read `agentId` from the response body and navigate with:
```
router.push(`/?agent=${encodeURIComponent(agentId)}`)
```

The `createSession` service returns `{ success, name, agentId }` (line 683), so the agentId is available in the response.

---

## Finding 2: `avatar` is NOT passed to sessions/create for the new agent

**Code (lines 236-246):**
```typescript
const createRes = await fetch('/api/sessions/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: agentName,
    program: programMatch?.[1] || 'claude-code',
    programArgs: programArgs.join(' '),
    workingDirectory: agentDir,
    label: agentName,
    // <-- no avatar field
  }),
})
```

The `sessions/create` route accepts `avatar` (route.ts line 28, service interface line 65), but `handleCreate` never passes it. The TOML content is parsed for `name`, `model`, `workingDirectory`, and `program` — but no avatar is extracted.

If the agent's TOML contains an avatar field, it is silently dropped. The registered agent will have no avatar, and the `AgentList` sidebar will show a default icon.

**Fix needed:** Parse `avatar` from the TOML content (similar to how `agentName` is parsed) and include it in the `sessions/create` request body.

---

## Finding 3: `--name` is NOT a valid Claude Code CLI flag

**Code (line 233):**
```typescript
const programArgs = [`--agent ${agentName}-main-agent`, `--name ${agentName}`]
```

According to the project's own CLAUDE.md and memory:
> `--agent <name>` is the ONLY way to assign personas to Claude Code instances.

Claude Code CLI does not have a `--name` flag. The valid flags for persona assignment are:
- `--agent <agent-name>` — loads the named agent persona
- `--model <model-id>` — selects the model

Passing `--name ${agentName}` will either be silently ignored or cause Claude to fail to start with an "unrecognized argument" error.

The sanitizer in `sessions-service.ts` (line 666) strips only non-allowed characters but does not validate flag names, so the invalid flag reaches the shell command.

**Fix needed:** Remove `--name ${agentName}` from `programArgs`. The agent name is carried by the session name (`name: agentName`), the tmux session, and the registry — not as a CLI flag.

---

## Finding 4: `programArgs` array construction has a structural issue

**Code (lines 233-234):**
```typescript
const programArgs = [`--agent ${agentName}-main-agent`, `--name ${agentName}`]
if (modelMatch?.[1]) programArgs.push(`--model ${modelMatch[1]}`)
```

Then (line 242):
```typescript
programArgs: programArgs.join(' '),
```

Each array element already contains a flag+value pair with a space inside (`--agent foo-main-agent`). Joining with `' '` produces:

```
--agent foo-main-agent --name foo --model claude-sonnet-4
```

This happens to work structurally for `--agent` and `--model` because each is a single string `"--flag value"` already. The sanitizer strips the entire joined string cleanly. So the construction is not broken per se — but it is fragile. If any value contained a space (e.g., a multi-word model name like `"claude 3.5 sonnet"`), the result would be malformed.

**Recommendation:** Either keep array elements as `['--agent', `${agentName}-main-agent`]` pairs and join with `' '`, or validate that extracted values cannot contain spaces before embedding them.

---

## Summary Table

| # | Issue | Severity | File / Lines |
|---|-------|----------|-------------|
| 1 | `router.push('/')` never passes `?agent=` param — new agent not selected | HIGH | `page.tsx:266` |
| 2 | `avatar` not extracted from TOML and not passed to `sessions/create` | MEDIUM | `page.tsx:236-246` |
| 3 | `--name` is not a valid Claude Code CLI flag | HIGH | `page.tsx:233` |
| 4 | `programArgs` array join is fragile for values with spaces | LOW | `page.tsx:233-242` |

---

## URL Param Mechanism (confirmed working, just not used)

`app/page.tsx` lines 166-202 confirm the `?agent=<agentId>` deep-link mechanism exists and works:

```typescript
const agentParam = params.get('agent')
if (agentParam) {
  setActiveAgentId(decodeURIComponent(agentParam))
  window.history.replaceState({}, '', window.location.pathname)
}
```

The `createSession` API response includes `agentId` in its JSON body (service line 683: `{ success: true, name: actualSessionName, agentId: registeredAgent?.id }`). So fixing Finding 1 is straightforward — read `agentId` from `createRes.json()` and append it to the push URL.
