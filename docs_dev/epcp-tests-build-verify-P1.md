# EPCP Tests & Build Verification - Pass 1

**Date:** 2026-02-22
**Branch:** feature/team-governance
**Commit:** 0a6b95e (fix: pass 4 -- resolve 25 review findings)

---

## Test Summary

| Metric | Value |
|--------|-------|
| **Test Files** | 29 passed (29 total) |
| **Tests** | 836 passed (836 total) |
| **Failed** | 0 |
| **Skipped** | 0 |
| **Duration** | 4.99s (transform 2.04s, setup 0ms, import 3.18s, tests 7.33s) |
| **Vitest Version** | v4.0.18 |

### Test Files Breakdown

| # | Test File | Tests | Duration |
|---|-----------|-------|----------|
| 1 | tests/host-keys.test.ts | 15 | 48ms |
| 2 | tests/task-registry.test.ts | (included) | - |
| 3 | tests/services/agents-core-service.test.ts | 75 | 4539ms |
| 4-29 | (other 26 test files) | (remaining ~746) | - |

### Failing Tests

**NONE** -- All 836 tests passed across 29 test files.

---

## Build Summary

| Metric | Value |
|--------|-------|
| **Result** | SUCCESS |
| **Framework** | Next.js 14.2.35 |
| **Duration** | 18.78s |
| **Static Pages** | 57/57 generated |
| **Type Checking** | Passed (no errors) |
| **Errors** | 0 |
| **Warnings** | ~40+ (non-blocking, see below) |

### Build Warnings (non-blocking)

**Critical Dependencies (3):**
- `lib/cerebellum/voice-subsystem.ts` - dynamic dependency expression
- `lib/memory/claude-provider.ts` - dynamic dependency expression
- `@huggingface/transformers` - `import.meta` access unsupported

**React Hooks Warnings (~15):**
- Missing dependencies in useEffect/useCallback/useMemo across multiple components (companion, immersive, ChatView, ConversationDetailPanel, DocumentationPanel, MemoryViewer, MobileConversationDetail, MobileHostsList, MobileKeyToolbar, MobileWorkTree, TransferAgentDialog, WorkTree, AgentGraph, marketplace/SkillDetailModal, settings/HostsSection, AMPAddressesSection, EmailAddressDialog, EmailAddressesSection)

**Next.js Image Warnings (~20):**
- Multiple `<img>` tags recommended to use `next/image` `<Image />` component (companion, zoom, AgentBadge, AgentCreationWizard, AgentList, AgentProfile, AvatarPicker, CreateAgentAnimation, TabletDashboard, TeamCard, TeamListView, AgentPicker, MeetingSidebar, RingingAnimation, SelectedAgentsBar, zoom/AgentCard, zoom/AgentProfileTab, onboarding/FirstAgentWizard, onboarding/UseCaseSelector)

**Other Warnings (1):**
- `MessageCenter.tsx:1133` - `aria-expanded` not supported by role `textbox`

### Build Output Routes

- **App Routes:** ~120 routes (API + pages)
- **Static:** 14 pages prerendered
- **Dynamic:** ~106 server-rendered on demand
- **First Load JS shared:** 88.2 kB

---

## Verdict

| Check | Status |
|-------|--------|
| Tests | PASS (836/836) |
| Build | PASS (no errors) |
| Type Check | PASS |
| Lint | PASS (warnings only) |
