# SkillPicker.tsx Bug Fix Report
Date: 2026-03-22

## Source file fixed
`/Users/emanuelesabetta/ai-maestro/components/plugin-builder/SkillPicker.tsx`

## Findings reviewed
`/Users/emanuelesabetta/ai-maestro/.rechecker/reports/rck-20260322_171538_606726-[LP00002-IT00002-FID00004]-review.md`

---

## Bug 1 (high): Missing `fetch` in useEffect dependency array
**Verdict: SKIPPED — not a real bug.**

`fetch` is a global browser built-in, not a React reactive value (not a prop, state, or ref). Adding it to a `useEffect` dependency array would be incorrect and would cause an ESLint `react-hooks/exhaustive-deps` warning for listing a non-reactive global. The existing dependency array `[setMarketplaceSkills, setLoadingMarketplace]` is correct: both are stable `useState` setters (React guarantees their identity never changes), listed only for exhaustive-deps lint compliance as noted by the existing comment on lines 69-71. No fix applied.

## Bug 2 (low): Inconsistent aria-label for marketplace skills
**Verdict: SKIPPED — self-corrected by the reviewer.**

The reviewer acknowledged mid-report that the aria-label was already correct. No fix needed.

## Bug 3 (low): Redundant `onSkillsFound={() => {}}` prop on RepoScanner
**Verdict: FIXED.**

**Root cause:** `RepoScanner`'s `onSkillsFound` prop is declared as optional (`onSkillsFound?:`) and is called with optional chaining (`onSkillsFound?.()`). Passing an explicit empty no-op `() => {}` is dead code — it communicates nothing, adds noise, and could mislead future readers into thinking skills-found events are being handled when they are not.

**Fix applied:** Removed the `onSkillsFound={() => {}}` prop from the `RepoScanner` JSX in `SkillPicker.tsx`. The component now correctly omits the optional prop, relying on the optional chaining at the call site to be a no-op when the prop is absent.

**Change:**
```diff
-          <RepoScanner
-            onSkillsFound={() => {}}
-            onAddSkill={onAddSkill}
-            selectedSkillKeys={selectedKeys}
-          />
+          <RepoScanner
+            onAddSkill={onAddSkill}
+            selectedSkillKeys={selectedKeys}
+          />
```
