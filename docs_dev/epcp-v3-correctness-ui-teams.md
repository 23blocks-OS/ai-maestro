# Code Correctness Report: ui-teams

**Agent:** epcp-code-correctness-agent
**Domain:** ui-teams
**Files audited:** 6
**Date:** 2026-02-17T01:50:00Z

## MUST-FIX

No must-fix issues found.

## SHOULD-FIX

### [CC-001] MessageCenter uses `sessionName` (not `messageIdentifier`) when sending regular messages
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:222
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `sendMessage()`, when sending a regular (non-forwarded) message, the `from` field is set to `sessionName` (line 222), while everywhere else the component uses `messageIdentifier` (which is `agentId || sessionName`) as the canonical identifier. For forwarded messages, `messageIdentifier` is correctly used as `fromSession` (line 191). This inconsistency means the `from` field in regular sent messages may use a different identifier than the rest of the system expects when `agentId` is available.
- **Evidence:**
  ```tsx
  // Line 28: messageIdentifier is the canonical ID
  const messageIdentifier = agentId || sessionName

  // Line 191: Forward uses messageIdentifier (correct)
  fromSession: messageIdentifier,

  // Line 222: Regular send uses sessionName (inconsistent)
  from: sessionName,
  ```
- **Fix:** Change line 222 from `from: sessionName` to `from: messageIdentifier` for consistency, or verify the server API requires the tmux session name specifically for the `from` field.

### [CC-002] Governance reachability check fires even when `isActive` is false
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:391-406
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `fetchReachable` useEffect on lines 391-406 depends only on `[agentId, apiBaseUrl]` and does NOT check `isActive`. The component comment says "Only fetch data when active (prevents API flood with many agents)" and other data-fetch effects properly gate on `isActive`, but this one does not. With 40+ agents, all MessageCenter instances will hit the governance reachability endpoint even if they are not the active tab.
- **Evidence:**
  ```tsx
  // Lines 408-415: correctly checks isActive
  useEffect(() => {
    if (!isActive) return
    fetchMessages()
    ...
  }, [messageIdentifier, isActive, ...])

  // Lines 391-406: does NOT check isActive
  useEffect(() => {
    const fetchReachable = async () => {
      try {
        if (!agentId) return
        const res = await fetch(`${apiBaseUrl}/api/governance/reachable?agentId=${agentId}`)
        ...
      }
    }
    fetchReachable()
  }, [agentId, apiBaseUrl])
  ```
- **Fix:** Add `if (!isActive) return` at the beginning of this effect, and add `isActive` to the dependency array.

### [CC-003] `handleSave` never sets `saving` back to false on HTTP error (non-ok response)
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:191-222
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `AgentProfile.handleSave()`, if `response.ok` is true, `saving` is set to false after a 500ms delay (line 216). If an exception is thrown, `saving` is set to false immediately (line 220). But if the response is not OK (i.e., `response.ok === false`) and no exception is thrown, `saving` is never set back to false, leaving the button permanently in "Saving" spinner state. The same pattern exists in `AgentProfileTab.tsx` line 141-172.
- **Evidence:**
  ```tsx
  // AgentProfile.tsx lines 191-222
  const handleSave = async () => {
    if (!agent || !hasChanges) return
    setSaving(true)
    try {
      const response = await fetch(...)
      if (response.ok) {
        setHasChanges(false)
        setTimeout(() => setSaving(false), 500)  // Only resets on success
      }
      // Missing: else { setSaving(false) }
    } catch (error) {
      console.error('Failed to save agent:', error)
      setSaving(false)
    }
  }
  ```
- **Fix:** Add an `else` branch after `if (response.ok)` that sets `setSaving(false)` (and ideally shows an error message). Apply the same fix in `AgentProfileTab.tsx`.

### [CC-004] `handleSave` in AgentProfileTab has the same saving-state bug
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:141-172
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-003 above. When the PATCH response is not OK, `saving` is never reset.
- **Evidence:**
  ```tsx
  // AgentProfileTab.tsx lines 141-172
  const handleSave = async () => {
    if (!hasChanges) return
    setSaving(true)
    try {
      const response = await fetch(...)
      if (response.ok) {
        setHasChanges(false)
        setTimeout(() => setSaving(false), 500)
      }
      // Missing: else { setSaving(false) }
    } catch (error) {
      console.error('Failed to save agent:', error)
      setSaving(false)
    }
  }
  ```
- **Fix:** Add an `else` branch to handle non-OK responses and reset `saving` state.

### [CC-005] `selectedMessage` state is shared across inbox and sent views but not cleared on view switch
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:33,710-941
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `selectedMessage` state is shared across the inbox and sent views. When you select a message in the inbox view, switch to the sent view, the same `selectedMessage` is displayed in the sent detail pane. The sent view's detail pane (lines 1008-1096) shows the message as a "Sent Message" with "To:" header, but if the selected message was actually an inbox message, it shows incorrect data (the inbox message rendered as if it were a sent message). No clearing of `selectedMessage` happens when switching between inbox/sent views via the tab buttons.
- **Evidence:**
  ```tsx
  // Lines 599-614: switching to inbox view - no setSelectedMessage(null)
  <button onClick={() => setView('inbox')} ...>
  // Lines 615-625: switching to sent view - no setSelectedMessage(null)
  <button onClick={() => setView('sent')} ...>
  ```
- **Fix:** Add `setSelectedMessage(null)` when switching views (in the onClick handlers for inbox/sent/compose buttons), or filter selectedMessage display based on whether it belongs to the current view.

## NIT

### [CC-006] `editingField` state declared but never used in AgentProfile
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:45
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `editingField` and its setter `setEditingField` are declared on line 45 but never referenced anywhere else in the component. This is dead code.
- **Evidence:**
  ```tsx
  const [editingField, setEditingField] = useState<string | null>(null)
  ```
- **Fix:** Remove the unused state declaration.

### [CC-007] Unused imports in AgentProfile.tsx
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:4-11
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Several lucide-react icons are imported but may not be used in the component: `Building2`, `Plus`, `Server`, `ExternalLink`, `Crown` appear in the import list but are not referenced in the JSX. The `Play` icon is imported and used. `Crown` is imported but not used in the visible code.
- **Evidence:**
  ```tsx
  import {
    X, User, Building2, Briefcase, Code2, Cpu, Tag,
    ...
    Cloud, Monitor, Server, Play, Wifi, WifiOff, ...
    Crown, Shield
  } from 'lucide-react'
  ```
- **Fix:** Run a linter or remove unused imports. Minor bundle-size impact only since tree-shaking should handle it.

### [CC-008] Repository list uses array index as React key
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:779
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:604
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both AgentProfile and AgentProfileTab render repository lists using `key={idx}` (array index). If repositories are reordered or removed, React may incorrectly reuse DOM nodes. Should use a stable key like `repo.remoteUrl` or `repo.localPath`.
- **Evidence:**
  ```tsx
  {repositories.map((repo, idx) => (
    <div key={idx} ...>
  ```
- **Fix:** Use `key={repo.remoteUrl || repo.localPath || idx}` for a more stable key.

### [CC-009] `deleteMessage` confirmation timer is not cleaned up on unmount
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:266
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `setTimeout(() => setPendingDelete(null), 5000)` on line 266 can fire after the component unmounts if the user navigates away within 5 seconds, causing a "Can't perform a React state update on an unmounted component" warning. Same issue with `showToast`'s `setTimeout` on line 71.
- **Evidence:**
  ```tsx
  setTimeout(() => setPendingDelete(null), 5000) // Reset after 5s
  ```
- **Fix:** Store the timeout ID and clear it in a cleanup effect, or use a ref to track mount status. This is a minor issue since React 18 does not crash on this, but it generates console warnings.

### [CC-010] AgentProfileTab avatar rendering differs from AgentProfile
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:334-344
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:436-448
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** AgentProfileTab (line 334-337) checks `isAvatarUrl` to decide whether to render the avatar as an `<img>` tag, a text emoji, or a fallback emoji. It handles 3 cases: URL, non-URL string (emoji), and no avatar. AgentProfile (line 436-443) only checks `agent.avatar` truthiness and always renders as `<img>` when avatar exists, which would break for emoji avatars (rendering `<img src="🤖">` which would fail). The behaviors are inconsistent.
- **Evidence:**
  ```tsx
  // AgentProfileTab.tsx - handles emoji avatars correctly
  {isAvatarUrl ? (
    <img src={agent.avatar} ... />
  ) : agent.avatar ? (
    agent.avatar  // renders as text (emoji)
  ) : ( '🤖' )}

  // AgentProfile.tsx - treats ALL avatars as URLs
  {agent.avatar ? (
    <img src={agent.avatar} alt={...} ... />
  ) : ( '🤖' )}
  ```
- **Fix:** Use the same 3-way check (`isAvatarUrl`/emoji/fallback) in AgentProfile.tsx as is done in AgentProfileTab.tsx.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx -- No issues. Clean component with proper error handling, state sync via useEffect, and correct prop usage.
- /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx -- No issues. Proper validation, error handling, and dialog management.
- /Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx -- No issues. Clean composition with proper prop passing and hook usage. The `agentsError.message` conversion on line 104 correctly adapts the `Error | null` type to `string | null`.
