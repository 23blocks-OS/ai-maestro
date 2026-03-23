# Build Check v19 - 2026-03-22

## Result: FAILED

## Type Error (build-blocking)

```
./services/headless-router.ts:1229:7
Type error: Argument of type 'string | undefined' is not assignable to parameter of type 'string | null'.
  Type 'undefined' is not assignable to type 'string | null'.

  1227 |     // Layer 5: optional governance enforcement when agent identity is provided
  1228 |     const auth = authenticateAgent(
> 1229 |       getHeader(_req, 'Authorization'),
       |       ^
  1230 |       getHeader(_req, 'X-Agent-Id')
  1231 |     )
  1232 |     // If auth credentials were provided but invalid, reject immediately — consistent with other governed routes.
```

**Root cause:** `getHeader()` returns `string | undefined`, but `authenticateAgent()` expects `string | null`. Need to coalesce `undefined` to `null` (e.g., `getHeader(_req, 'Authorization') ?? null`).

## Warnings (non-blocking)

### Critical Dependencies
- `lib/cerebellum/voice-subsystem.ts` — dynamic require expression
- `lib/memory/claude-provider.ts` — dynamic require expression
- `@huggingface/transformers` — `import.meta` access unsupported

### ESLint Warnings
- `app/companion/page.tsx` — missing deps in useEffect (activeAgentId, activeAgent.hostId), `<img>` usage
- `app/immersive/page.tsx` — missing dep in useEffect (activeAgent.hostId)
- `app/plugin-builder/page.tsx` — unnecessary deps in useCallback (getSkillKey)
- `app/zoom/agent/page.tsx` — `<img>` usage
- `app/zoom/page.tsx` — `<img>` usage
- `components/AMPAddressesSection.tsx` — missing dep in useEffect
- `components/AgentBadge.tsx` — `<img>` usage
- `components/AgentProfilePanel.tsx` — missing dep in useEffect (fetchLocalConfig)
- `components/AvatarPicker.tsx` — `<img>` usage
- `components/CreateAgentAnimation.tsx` — `<img>` usage
- `components/SessionList.tsx` — missing deps in useEffect, `<img>` usage
- `components/onboarding/UseCaseSelector.tsx` — `<img>` usage
- `components/plugin-builder/SkillPicker.tsx` — unnecessary dep in useMemo (getSkillKey)
- `components/settings/HostsSection.tsx` — missing dep in useEffect (refreshAllHosts)
- `components/sidebar/TeamCard.tsx` — `<img>` usage
- `components/sidebar/TeamListView.tsx` — `<img>` usage
- `components/team-meeting/AgentPicker.tsx` — `<img>` usage
- `components/team-meeting/MeetingSidebar.tsx` — `<img>` usage
- `components/team-meeting/RingingAnimation.tsx` — `<img>` usage
- `components/team-meeting/SelectedAgentsBar.tsx` — `<img>` usage
- `components/zoom/AgentCard.tsx` — `<img>` usage

### Other
- `baseline-browser-mapping` module data over two months old
- `url.parse()` deprecation warning (DEP0169)
