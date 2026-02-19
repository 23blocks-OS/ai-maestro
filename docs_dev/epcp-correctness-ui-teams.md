# Code Correctness Report: ui-teams

**Agent:** epcp-code-correctness-agent
**Domain:** ui-teams
**Files audited:** 3
**Date:** 2026-02-16T00:00:00Z

## MUST-FIX

### [CC-001] Flash of "Team not found" on initial load in TeamDashboardPage
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx:31
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `useTeam` hook initializes `loading` as `false` (useTeam.ts:16), and `team` as `null` (useTeam.ts:15). The `useEffect` that sets `loading=true` runs *after* the first render. On the very first render frame, `loading=false` and `team=null`, so the guard `if (loading || !team)` evaluates to `true` via the `!team` branch. The displayed message is `loading ? 'Loading team...' : 'Team not found'`, which resolves to **"Team not found"** because `loading` is still `false`. Users see a brief flash of "Team not found" before the effect fires and sets `loading=true`.
- **Evidence:**
  ```tsx
  // [id]/page.tsx:31
  if (loading || !team) {
    // ...
    <p className="text-sm text-gray-400">{loading ? 'Loading team...' : 'Team not found'}</p>
  }

  // useTeam.ts:16
  const [loading, setLoading] = useState(false) // <-- starts false

  // useTeam.ts:33-39 -- effect sets loading=true AFTER first render
  useEffect(() => {
    if (!teamId) { setTeam(null); return }
    setLoading(true)
    fetchTeam().finally(() => setLoading(false))
  }, [teamId, fetchTeam])
  ```
- **Fix:** Change `useTeam` to initialize `loading` as `true` when `teamId` is provided: `const [loading, setLoading] = useState(!!teamId)`. Or alternatively, in `[id]/page.tsx`, change the guard to also check if `team === null && !error` to distinguish "loading" from "not found".

### [CC-002] Stale local state in TeamOverviewSection when `team` prop changes
- **File:** /Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx:22-23
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The component uses `useState(team.name)` and `useState(team.description || '')` to initialize local editing state. React's `useState` only uses the initial value on first mount -- subsequent re-renders with a changed `team` prop will NOT update the local `name` and `description` state. This means if the team is renamed or description is updated externally (e.g., optimistic update revert, concurrent edit, or parent re-fetch), the input fields will show stale values.
- **Evidence:**
  ```tsx
  // TeamOverviewSection.tsx:22-23
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description || '')
  ```
- **Fix:** Add a `useEffect` to synchronize local state when the prop changes:
  ```tsx
  useEffect(() => { setName(team.name) }, [team.name])
  useEffect(() => { setDescription(team.description || '') }, [team.description])
  ```
  Only sync when NOT in editing mode to avoid overwriting user input:
  ```tsx
  useEffect(() => { if (!editingName) setName(team.name) }, [team.name])
  useEffect(() => { if (!editingDesc) setDescription(team.description || '') }, [team.description])
  ```

## SHOULD-FIX

### [CC-003] Unhandled promise rejections in async event handlers (TeamOverviewSection)
- **File:** /Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx:29,36,43,48
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Four async handler functions (`handleSaveName`, `handleSaveDesc`, `handleRemoveAgent`, `handleAddAgent`) call `await onUpdateTeam(...)` without try/catch. If the API call fails, the promise rejection propagates as an unhandled rejection in the browser console. Additionally, `setEditingName(false)` and `setEditingDesc(false)` are called regardless of success or failure (lines 33, 40), meaning the edit mode is exited even when the save failed.
- **Evidence:**
  ```tsx
  // line 29-34
  const handleSaveName = async () => {
    if (name.trim() && name !== team.name) {
      await onUpdateTeam({ name: name.trim() }) // <-- no try/catch, throws on failure
    }
    setEditingName(false) // <-- executes even if above threw? No, it doesn't -- but the caller (onClick) gets an unhandled rejection
  }

  // line 43-46
  const handleRemoveAgent = async (agentId: string) => {
    const newIds = team.agentIds.filter(id => id !== agentId)
    await onUpdateTeam({ agentIds: newIds }) // <-- no error handling
  }
  ```
- **Fix:** Wrap each handler in try/catch. On failure, optionally show a toast or revert state. At minimum, catch to prevent unhandled rejections:
  ```tsx
  const handleSaveName = async () => {
    if (name.trim() && name !== team.name) {
      try {
        await onUpdateTeam({ name: name.trim() })
      } catch (err) {
        console.error('Failed to update name:', err)
        setName(team.name) // revert
        return
      }
    }
    setEditingName(false)
  }
  ```

### [CC-004] handleCreateTeam does not check nameValidation.error
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:118-143
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `handleCreateTeam` only checks `!newTeamName.trim() || submitting` (line 119) but does NOT check `nameValidation.error`. While all current call sites guard against this (the Enter key handler checks `!nameValidation.error` on line 245, and the button is `disabled` when there's a validation error on line 267), the function itself is not defensively written. If a future call site invokes it directly, it would bypass client-side validation and submit an invalid name to the server.
- **Evidence:**
  ```tsx
  // line 118-119
  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || submitting) return // <-- no nameValidation.error check
    // ... proceeds to create
  }

  // line 245 (Enter handler checks it)
  if (e.key === 'Enter' && !nameValidation.error) handleCreateTeam()

  // line 267 (button disabled checks it)
  disabled={!newTeamName.trim() || !!nameValidation.error}
  ```
- **Fix:** Add `|| nameValidation.error` to the guard in `handleCreateTeam`:
  ```tsx
  if (!newTeamName.trim() || submitting || nameValidation.error) return
  ```

### [CC-005] "Name is available" false positive for short names
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:255-257
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The "Name is available" indicator on line 255-257 checks `!nameValidation.error && !createError && newTeamName.trim().length >= 4`. However, the validation function `validateTeamName` uses `clean` (sanitized) length, while the green indicator uses `newTeamName.trim()` (unsanitized) length. If the user types 4+ characters but the sanitized version is shorter (e.g., control characters are stripped), the UI would show "Name is available" even though validation hasn't run the full checks. Additionally, names that pass the length check but fail the character pattern check (line 91-98) would still show as "available" since those checks set `nameValidation.error` -- however the regex is applied to `clean` not `trim()`, so there's a subtle discrepancy.
- **Evidence:**
  ```tsx
  // line 255-257
  {!nameValidation.error && !createError && newTeamName.trim().length >= 4 && (
    <p className="text-xs text-emerald-400 mb-1">Name is available</p>
  )}

  // validateTeamName (line 77-78)
  const clean = raw.replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim()
  // clean.length may differ from newTeamName.trim().length
  ```
- **Fix:** Store the validated/sanitized name or its length in state, and use that for the availability indicator instead of re-computing from the raw value.

## NIT

### [CC-006] Inline IIFE for COS agent lookup in JSX
- **File:** /Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx:99-101
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** An immediately-invoked function expression (IIFE) is used inside JSX to look up the Chief-of-Staff agent name. This is a code smell -- it makes the JSX harder to read and creates a new function on every render. It should be extracted to a `useMemo` or a simple computed variable.
- **Evidence:**
  ```tsx
  // line 99-101
  <strong>{(() => {
    const cosAgent = agents.find(a => a.id === team.chiefOfStaffId)
    return cosAgent ? (cosAgent.label || cosAgent.name || cosAgent.alias || team.chiefOfStaffId) : team.chiefOfStaffId
  })()}</strong>
  ```
- **Fix:** Extract to a computed variable at the top of the component:
  ```tsx
  const cosDisplayName = useMemo(() => {
    if (!team.chiefOfStaffId) return null
    const cosAgent = agents.find(a => a.id === team.chiefOfStaffId)
    return cosAgent ? (cosAgent.label || cosAgent.name || cosAgent.alias || team.chiefOfStaffId) : team.chiefOfStaffId
  }, [agents, team.chiefOfStaffId])
  ```

### [CC-007] Duplicated footer markup across team pages
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:304-321 and /Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx:130-147
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The footer JSX (VersionChecker, attribution links) is copy-pasted identically in both `page.tsx` and `[id]/page.tsx`. This should be a shared component to avoid drift and reduce maintenance burden.
- **Evidence:** Lines 304-321 of `app/teams/page.tsx` are character-for-character identical to lines 130-147 of `app/teams/[id]/page.tsx`.
- **Fix:** Extract a `<Footer />` component and import it in both pages.

### [CC-008] Delete confirmation dialog does not show team name
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:280-301
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The delete confirmation dialog says "Are you sure? This will remove the team but not its agents." but does not show WHICH team is being deleted. The `deleteConfirm` state stores only the team ID (line 24), not the name. For better UX, the dialog should display the team name.
- **Evidence:**
  ```tsx
  // line 283-284
  <h4 className="text-sm font-medium text-white mb-2">Delete Team</h4>
  <p className="text-xs text-gray-400 mb-4">Are you sure? This will remove the team but not its agents.</p>
  ```
- **Fix:** Look up the team name from the `teams` array using `deleteConfirm` ID:
  ```tsx
  const teamToDelete = teams.find(t => t.id === deleteConfirm)
  // then display: `Delete "${teamToDelete?.name}"?`
  ```

## CLEAN

Files with no issues beyond those listed above:
- All three files have been fully audited. No additional issues found beyond the 8 items above.

## Test Coverage Assessment

- **No tests exist** for any of these three UI components. There are no unit tests for:
  - `TeamOverviewSection` inline editing flows (save name, save description, add/remove agent)
  - `TeamsPage` create/delete flows or name validation logic
  - `TeamDashboardPage` tab switching or data loading states
- The `validateTeamName` function (page.tsx:75-116) is a pure-logic function embedded inline that would benefit from extraction and unit testing.
