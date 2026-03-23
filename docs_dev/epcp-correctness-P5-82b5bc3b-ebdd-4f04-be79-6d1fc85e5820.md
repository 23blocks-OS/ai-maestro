# Code Correctness Report: hooks-ui

**Agent:** epcp-code-correctness-agent
**Domain:** hooks-ui
**Files audited:** 1
**Date:** 2026-02-22T18:52:00Z

## MUST-FIX

_No must-fix issues found._

## SHOULD-FIX

### [CC-P5-A0-001] Floating promise in onSkillsChange callback passed to SkillBrowser
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:591-593
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `onSkillsChange` callback passed to `SkillBrowser` calls `loadSkills()` without awaiting it. `loadSkills` is async and sets loading/error state. If it fails, the error is silently swallowed because the promise is not awaited and the caller has no error boundary for it. This is different from the `onSkillInstall` handler on line 588 which correctly uses `async/await`.
- **Evidence:**
  ```tsx
  onSkillsChange={() => {
    loadSkills()       // floating promise -- not awaited
    onSkillsChange?.()
  }}
  ```
- **Fix:** Either make the callback async and await `loadSkills()`, or add a `.catch()` handler:
  ```tsx
  onSkillsChange={async () => {
    await loadSkills()
    onSkillsChange?.()
  }}
  ```

### [CC-P5-A0-002] Potential duplicate skill addition (no guard against adding already-installed skill)
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:142-166
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `handleAddSkill` sends a PATCH request to add a skill without checking if the skill is already in `skills.marketplace`. While the server may reject duplicates, the client-side function has no guard. If the server does not deduplicate, this could result in the same skill appearing multiple times. The `SkillBrowser` component may filter installed skills, but the `SkillDetailModal` also calls `handleAddSkill` (line 619) and the `isInstalled` check on line 620 only controls UI display, not the function itself.
- **Evidence:**
  ```tsx
  const handleAddSkill = async (skill: MarketplaceSkill) => {
    setSaving(true)
    // No check: if (skills?.marketplace.some(s => s.id === skill.id)) return
    ...
  }
  ```
- **Fix:** Add an early return if the skill is already installed:
  ```tsx
  if (skills?.marketplace.some(s => s.id === skill.id)) return
  ```

## NIT

### [CC-P5-A0-003] Checkbox `checked` prop receives `undefined` when skills is null
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:450
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The checkbox for toggling all AI Maestro skills uses `checked={skills?.aiMaestro.enabled}`. When `skills` is null, the optional chain evaluates to `undefined`, which makes the checkbox uncontrolled. Although in practice `skills` is non-null by the time this section renders (the loading state returns early), the type system allows this path. Using `?? false` would make it explicit.
- **Evidence:**
  ```tsx
  <input
    type="checkbox"
    checked={skills?.aiMaestro.enabled}  // could be undefined
    onChange={e => handleToggleAllAiMaestro(e.target.checked)}
  />
  ```
- **Fix:** Change to `checked={skills?.aiMaestro.enabled ?? false}` for explicitness.

### [CC-P5-A0-004] Unused import: `selectedSkill` state is set but never populated from UI interaction
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:71
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `selectedSkill` state (line 71) is initialized as `null` and passed to `SkillDetailModal` (line 616), but there is no code path in this component that calls `setSelectedSkill(someSkill)`. The modal will never open from this component because `isOpen={!!selectedSkill}` will always be `false`. This is dead code -- either the detail modal integration is incomplete, or it was superseded by the `SkillBrowser` modal approach.
- **Evidence:**
  ```tsx
  const [selectedSkill, setSelectedSkill] = useState<MarketplaceSkill | null>(null)
  // ... no call to setSelectedSkill anywhere except setSelectedSkill(null) in onClose
  <SkillDetailModal
    skill={selectedSkill}
    isOpen={!!selectedSkill}    // always false
    onClose={() => setSelectedSkill(null)}
    ...
  />
  ```
- **Fix:** Either remove the `SkillDetailModal` and `selectedSkill` state (dead code), or wire up a click handler on marketplace skill items to call `setSelectedSkill(skill)`.

### [CC-P5-A0-005] Custom skill key uses `skill.name` instead of a unique identifier
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:529
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Custom skills use `key={skill.name}` for the React key prop. If two custom skills have the same name (unlikely but possible with different paths), React will produce duplicate key warnings and may fail to correctly re-render. Using `skill.path` or a combination `${skill.name}:${skill.path}` would be more robust.
- **Evidence:**
  ```tsx
  {skills?.custom.map(skill => (
    <div key={skill.name} ...>
  ```
- **Fix:** Use `key={skill.path || skill.name}` or `key={\`${skill.name}:${skill.path}\`}`.

## CLEAN

_All findings are listed above. No files had zero issues._

## Pass 4 Fix Verification

The file was modified in Pass 4 to fix SF-011, SF-012, NT-008, NT-009. Based on my review:

1. **SF-011 (timer cleanup on unmount):** Line 63-67 shows `saveSuccessTimerRef` with proper `useRef` + `useEffect` cleanup pattern. Lines 159-160 and 181-182 correctly clear the previous timer before setting a new one. **FIX VERIFIED -- CORRECT.**

2. **SF-012 (loading state for resolve buttons):** Lines 85, 95, 105 show `resolvingIds` Set state that properly tracks in-flight requests. Lines 333, 342 disable buttons when the request is being resolved. **FIX VERIFIED -- CORRECT.**

3. **NT-008 (aria-labels on approve/reject buttons):** Lines 336, 345 show `aria-label` attributes added to both buttons. **FIX VERIFIED -- CORRECT.**

4. **NT-009 (portal for modal to escape stacking context):** Line 11 imports `createPortal`, line 562 uses `createPortal(..., document.body)` with SSR guard `typeof document !== 'undefined'`. **FIX VERIFIED -- CORRECT.**

All four Pass 4 fixes are correctly implemented and complete.

## Test Coverage Notes

- No test file was found for `AgentSkillEditor.tsx`. Given the component has multiple async operations (add, remove, toggle skills), governance request resolution, and modal lifecycle, test coverage is recommended.
- Key scenarios to test: loading state, 404 fallback to defaults, add/remove skill API calls, AI Maestro toggle, pending config request approve/reject, error states.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly (SHOULD-FIX = bugs that don't crash but produce incorrect behavior, NIT = minor improvement)
- [x] My finding IDs use the assigned prefix: CC-P5-A0-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P5-82b5bc3b-ebdd-4f04-be79-6d1fc85e5820.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN status (no files fully clean -- all findings documented)
- [x] Total finding count in my return message matches the actual count in the report (5 total: 2 SHOULD-FIX, 3 NIT)
- [x] My return message to the orchestrator is exactly 1-2 lines
