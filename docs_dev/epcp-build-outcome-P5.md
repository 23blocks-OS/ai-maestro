# Build Outcome Report - P5

**Date:** 2026-02-22
**Branch:** feature/team-governance
**Command:** `yarn build`
**Duration:** 19.20s

## Result: PASS

The build completed successfully with **0 TypeScript errors** and **0 build-breaking issues**.

## Warnings Summary

### Critical Dependency Warnings (3)

These are non-breaking webpack warnings about dynamic imports:

1. `lib/cerebellum/voice-subsystem.ts` - dynamic dependency expression
2. `lib/memory/claude-provider.ts` - dynamic dependency expression
3. `@huggingface/transformers` - unsupported `import.meta` access

### ESLint Warnings (47)

**react-hooks/exhaustive-deps (27 instances):**
- `app/companion/page.tsx:122,356`
- `components/AMPAddressesSection.tsx:53`
- `components/AgentGraph.tsx:296`
- `components/ChatView.tsx:133,155`
- `components/ConversationDetailPanel.tsx:76,484,494`
- `components/DocumentationPanel.tsx:160`
- `components/EmailAddressDialog.tsx:76`
- `components/EmailAddressesSection.tsx:55`
- `components/MemoryViewer.tsx:209,216,810(x2)`
- `components/MobileConversationDetail.tsx:87`
- `components/MobileHostsList.tsx:124`
- `components/MobileKeyToolbar.tsx:90`
- `components/MobileWorkTree.tsx:260`
- `components/TransferAgentDialog.tsx:101`
- `components/WorkTree.tsx:219`
- `components/marketplace/SkillDetailModal.tsx:55`
- `components/settings/HostsSection.tsx:146`

**@next/next/no-img-element (19 instances):**
- `app/companion/page.tsx:408,615,647,906,1002`
- `app/zoom/agent/page.tsx:108`
- `app/zoom/page.tsx:364`
- `components/AgentBadge.tsx:343`
- `components/AgentCreationWizard.tsx:463,653`
- `components/AgentList.tsx:1258`
- `components/AgentProfile.tsx:450`
- `components/AvatarPicker.tsx:163`
- `components/CreateAgentAnimation.tsx:359,466`
- `components/TabletDashboard.tsx:146`
- `components/sidebar/TeamCard.tsx:56`
- `components/sidebar/TeamListView.tsx:238`
- `components/team-meeting/AgentPicker.tsx:75`
- `components/team-meeting/MeetingSidebar.tsx:180,293`
- `components/team-meeting/RingingAnimation.tsx:122`
- `components/team-meeting/SelectedAgentsBar.tsx:52`
- `components/zoom/AgentCard.tsx:129`
- `components/zoom/AgentProfileTab.tsx:340`
- `components/onboarding/FirstAgentWizard.tsx:121`
- `components/onboarding/UseCaseSelector.tsx:79`

**jsx-a11y/role-supports-aria-props (1 instance):**
- `components/MessageCenter.tsx:1133`

### Deprecation Notices
- `url.parse()` deprecation (DEP0169) - multiple worker processes
- `baseline-browser-mapping` data over two months old

## Build Output

- 56 static pages generated
- 88.2 kB shared JS bundle
- Largest page: `/` at 229 kB first load
- All API routes compiled (100+ endpoints)
- Both static and dynamic routes successful
