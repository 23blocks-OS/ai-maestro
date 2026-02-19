# Code Correctness Report: ui-teams-and-other

**Agent:** epcp-code-correctness-agent
**Domain:** ui-teams-and-other
**Files audited:** 6
**Date:** 2026-02-17T00:00:00Z

## MUST-FIX

(none)

## SHOULD-FIX

### [CC-001] Regular message send does not refresh sent messages or sent count
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:231-239
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a regular (non-forwarded) message is sent successfully, the code resets the form and switches to inbox view but does NOT call `fetchSentMessages()` or `fetchSentCount()`. In contrast, the forward-success path (lines 207-209) correctly calls `fetchMessages()` and `fetchUnreadCount()`. This means the "Sent" tab count and list will be stale until the next 10-second poll cycle.
- **Evidence:**
  ```typescript
  // Lines 231-239 (regular send success)
  if (response.ok) {
    setComposeTo('')
    setComposeSubject('')
    setComposeMessage('')
    setComposePriority('normal')
    setComposeType('request')
    setView('inbox')
    showToast('Message sent successfully!', 'success')
    // Missing: fetchSentMessages() and fetchSentCount()
  }
  ```
  Compare to forward success path (lines 206-209):
  ```typescript
  showToast('Message forwarded successfully!', 'success')
  fetchMessages()
  fetchUnreadCount()
  // Note: even the forward path doesn't call fetchSentMessages() / fetchSentCount()
  ```
- **Fix:** After `showToast(...)` on line 239, add `fetchSentMessages()` and `fetchSentCount()` calls. Also add them to the forward-success path.

### [CC-002] Priority color classes use light-theme colors in dark-theme UI
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:537-544
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `getPriorityColor` function returns classes like `bg-red-100`, `bg-orange-100`, `bg-blue-100`, `bg-gray-100` which are very light background colors. The UI uses a dark theme (`bg-gray-900`, `bg-gray-800`). These light backgrounds will look jarring against the dark theme. The same issue exists on line 1071 where `bg-purple-100 text-purple-600` is used.
- **Evidence:**
  ```typescript
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100'
      case 'high': return 'text-orange-600 bg-orange-100'
      case 'normal': return 'text-blue-600 bg-blue-100'
      case 'low': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }
  // Line 1071:
  <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-600">
  ```
- **Fix:** Use dark-theme-appropriate classes: `bg-red-900/30 text-red-400`, `bg-orange-900/30 text-orange-400`, `bg-blue-900/30 text-blue-400`, `bg-gray-700 text-gray-400`, and `bg-purple-900/30 text-purple-400`.

## NIT

### [CC-003] AgentProfileTab fetches repos eagerly on mount instead of lazily
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:74-91
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `AgentProfileTab` component fetches repositories immediately on mount (lines 74-91) even though the "repositories" section starts collapsed (`repositories: false` in `expandedSections`). In contrast, the `AgentProfile` component (lines 121-141) lazily fetches repos only when the section is expanded, which is more efficient.
- **Evidence:**
  ```typescript
  // AgentProfileTab.tsx lines 74-91: fetches on mount unconditionally
  useEffect(() => {
    const fetchRepos = async () => {
      setLoadingRepos(true)
      // ...fetch...
    }
    fetchRepos()
  }, [agent.id, baseUrl])

  // AgentProfile.tsx lines 121-141: fetches only when section expanded
  useEffect(() => {
    if (!isOpen || !agentId || !expandedSections.repositories || reposLoaded) return
    // ...fetch...
  }, [isOpen, agentId, expandedSections.repositories, reposLoaded, baseUrl])
  ```
- **Fix:** In `AgentProfileTab`, guard the repo fetch with `expandedSections.repositories` check, similar to `AgentProfile`.

### [CC-004] MetricCard `trend` prop inconsistency between components
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:1014-1018 vs /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:1256-1261
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `MetricCard` sub-component in `AgentProfileTab.tsx` has a 3-field interface (`icon`, `value`, `label`) while the one in `AgentProfile.tsx` has 4 fields including `trend?: string` with associated UI rendering (TrendingUp/TrendingDown icons). Neither component currently passes `trend`, so this is a dead-code divergence rather than a bug, but the two implementations are inconsistent.
- **Evidence:**
  ```typescript
  // AgentProfileTab.tsx:1014-1018
  interface MetricCardProps {
    icon: React.ReactNode
    value: string | number
    label: string
  }

  // AgentProfile.tsx:1256-1261
  interface MetricCardProps {
    icon: React.ReactNode
    value: string | number
    label: string
    trend?: string  // <-- additional field with rendering logic
  }
  ```
- **Fix:** Consider extracting a shared `MetricCard` component, or at minimum keep both in sync.

### [CC-005] `cosDisplay` shows raw UUID when no matching agent found and chiefOfStaffId is set
- **File:** /Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx:37-40
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `team.chiefOfStaffId` is set but no matching agent is found in the `agents` array (e.g., the COS agent is on a different host or was deleted), `cosDisplay` falls through to the raw `team.chiefOfStaffId` UUID. This would display an ugly UUID in the UI.
- **Evidence:**
  ```typescript
  const cosDisplay = useMemo(() => {
    const cosAgent = agents.find(a => a.id === team.chiefOfStaffId)
    return cosAgent ? (cosAgent.label || cosAgent.name || cosAgent.alias || team.chiefOfStaffId) : team.chiefOfStaffId
  }, [agents, team.chiefOfStaffId])
  ```
  Used on line 141: `Chief-of-Staff: <strong>{cosDisplay}</strong>`
- **Fix:** When no agent is found, display a friendlier fallback like `"Unknown Agent (${team.chiefOfStaffId?.slice(0, 8)}...)"` instead of the full UUID.

### [CC-006] TeamDashboardPage loading state conflates "loading" with "team not found"
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx:31-42
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The conditional `if (loading || !team)` renders the same spinner UI for both "still loading" and "team not found" states. When loading is false but team is null, it shows a spinner with "Team not found" text, which is confusing UX (spinner implies loading, text says not found).
- **Evidence:**
  ```typescript
  if (loading || !team) {
    return (
      <div className="flex flex-col h-screen bg-gray-950 text-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-3 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">{loading ? 'Loading team...' : 'Team not found'}</p>
          </div>
        </div>
      </div>
    )
  }
  ```
- **Fix:** When `!loading && !team`, hide the spinner and show just "Team not found" text, possibly with a "Back to Teams" link.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx -- No issues. Team name validation is thorough with proper sanitization, collision checking, and boundary conditions. Error handling is correct.
