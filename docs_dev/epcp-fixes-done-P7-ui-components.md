# EPCP Fix Report - Pass 7: UI Components
Generated: 2026-02-22T22:45:00Z

## Fixes Applied: 4/4

### SF-001 (components/zoom/AgentProfileTab.tsx)
**Issue:** `handleSave` does not reset `saving` state on non-OK response, leaving the save button stuck in loading state.
**Fix:** Added `else { setSaving(false) }` branch after the `if (response.ok)` check at line 169.
**Lines affected:** 169-176

### SF-002 (components/zoom/AgentProfileTab.tsx)
**Issue:** Repositories list uses unstable `key={idx}` which can cause incorrect reconciliation on list changes.
**Fix:** Changed to `key={repo.remoteUrl || repo.localPath || idx}` to match the sibling AgentProfile.tsx pattern.
**Lines affected:** 610-612

### SF-003 (components/TerminalView.tsx)
**Issue:** Multiple `localStorage.getItem` and `localStorage.setItem` calls not wrapped in try/catch, which can throw in private browsing or when storage is full.
**Fix:** Wrapped all four localStorage useEffect blocks (two reads, two writes) in try/catch with fallback values, matching the SF-018 pattern already present in the same file at line 57.
**Lines affected:** 506-536 (now 506-550 due to added lines)

### NT-006 (components/plugin-builder/RepoScanner.tsx)
**Issue:** No unmount cleanup to abort in-flight fetch scan, risking state updates on unmounted component.
**Fix:** Added `useEffect(() => { return () => { abortRef.current?.abort() } }, [])` cleanup effect. Also added `useEffect` to the import statement.
**Lines affected:** 3, 19-22

### Skipped
- **NT-005:** Deprecated `document.execCommand` - no immediate fix needed per instructions.
