yarn run v1.22.22
(node:9601) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)
$ NEXT_PRIVATE_SKIP_LOCKFILE_CHECK=1 next build
  ▲ Next.js 14.2.35

   Creating an optimized production build ...
[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
 ⚠ Compiled with warnings

./lib/cerebellum/voice-subsystem.ts
Critical dependency: the request of a dependency is an expression

Import trace for requested module:
./lib/cerebellum/voice-subsystem.ts
./lib/agent.ts
./services/agents-docs-service.ts
./app/api/agents/[id]/docs/route.ts

./lib/memory/claude-provider.ts
Critical dependency: the request of a dependency is an expression

Import trace for requested module:
./lib/memory/claude-provider.ts
./lib/memory/consolidate.ts
./services/agents-memory-service.ts
./app/api/agents/[id]/index-delta/route.ts

./node_modules/@huggingface/transformers/dist/transformers.node.mjs
Critical dependency: Accessing import.meta directly is unsupported (only property access or destructuring is supported)

Import trace for requested module:
./node_modules/@huggingface/transformers/dist/transformers.node.mjs
./lib/rag/embeddings.ts
./services/agents-memory-service.ts
./app/api/agents/[id]/index-delta/route.ts

   Linting and checking validity of types ...

./app/companion/page.tsx
122:6  Warning: React Hook useEffect has a missing dependency: 'activeAgentId'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
356:6  Warning: React Hook useEffect has a missing dependency: 'activeAgent.hostId'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
408:13  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
615:27  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
647:11  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
906:21  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
1002:29  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./app/immersive/page.tsx
237:6  Warning: React Hook useEffect has a missing dependency: 'activeAgent.hostId'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./app/zoom/agent/page.tsx
108:23  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./app/zoom/page.tsx
364:25  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/AMPAddressesSection.tsx
53:6  Warning: React Hook useEffect has a missing dependency: 'fetchAddresses'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/AgentBadge.tsx
343:13  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/AgentCreationHelper.tsx
258:6  Warning: React Hook useCallback has a missing dependency: 'captureInitialGreeting'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
508:13  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
590:25  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
671:21  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/AgentCreationWizard.tsx
463:15  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
653:11  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/AgentGraph.tsx
296:6  Warning: React Hook useEffect has missing dependencies: 'detectProjectPath', 'fetchGraphData', and 'fetchStats'. Either include them or remove the dependency array.  react-hooks/exhaustive-deps

./components/AgentList.tsx
1261:47  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/AgentProfile.tsx
450:27  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/AvatarPicker.tsx
171:19  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/ChatView.tsx
133:6  Warning: React Hook useCallback has an unnecessary dependency: 'messages.length'. Either exclude it or remove the dependency array.  react-hooks/exhaustive-deps
155:6  Warning: React Hook useEffect has a missing dependency: 'fetchMessages'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/ConversationDetailPanel.tsx
76:6  Warning: React Hook useEffect has a missing dependency: 'loadConversation'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
484:6  Warning: React Hook useEffect has a missing dependency: 'performSemanticSearch'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
494:9  Warning: The 'matchIndices' conditional could make the dependencies of useEffect Hook (at line 555) change on every render. To fix this, wrap the initialization of 'matchIndices' in its own useMemo() Hook.  react-hooks/exhaustive-deps

./components/CreateAgentAnimation.tsx
359:11  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
466:13  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/DocumentationPanel.tsx
160:6  Warning: React Hook useEffect has missing dependencies: 'fetchDocuments' and 'fetchStats'. Either include them or remove the dependency array.  react-hooks/exhaustive-deps

./components/EmailAddressDialog.tsx
76:6  Warning: React Hook useEffect has a missing dependency: 'fetchDomains'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/EmailAddressesSection.tsx
55:6  Warning: React Hook useEffect has a missing dependency: 'fetchAddresses'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/MemoryViewer.tsx
209:6  Warning: React Hook useEffect has missing dependencies: 'fetchMemories' and 'fetchStats'. Either include them or remove the dependency array.  react-hooks/exhaustive-deps
216:6  Warning: React Hook useEffect has a missing dependency: 'fetchGraph'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
810:6  Warning: React Hook useEffect has a missing dependency: 'nodes.length'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps
810:13  Warning: React Hook useEffect has a complex expression in the dependency array. Extract it to a separate variable so it can be statically checked.  react-hooks/exhaustive-deps

./components/MessageCenter.tsx
1137:15  Warning: The attribute aria-expanded is not supported by the role textbox. This role is implicit on the element input.  jsx-a11y/role-supports-aria-props

./components/MobileConversationDetail.tsx
87:6  Warning: React Hook useEffect has a missing dependency: 'loadConversation'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/MobileHostsList.tsx
124:6  Warning: React Hook useMemo has a missing dependency: 'getHostName'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/MobileKeyToolbar.tsx
90:6  Warning: React Hook useCallback has a missing dependency: 'stopRepeat'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/MobileWorkTree.tsx
260:6  Warning: React Hook useEffect has a missing dependency: 'fetchWorkTree'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/TabletDashboard.tsx
146:21  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/TransferAgentDialog.tsx
101:6  Warning: React Hook useEffect has a missing dependency: 'baseUrl'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/WorkTree.tsx
219:6  Warning: React Hook useEffect has a missing dependency: 'fetchWorkTree'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/marketplace/SkillDetailModal.tsx
55:6  Warning: React Hook useEffect has a missing dependency: 'loadSkillContent'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/onboarding/FirstAgentWizard.tsx
121:15  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/onboarding/UseCaseSelector.tsx
79:17  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/settings/HostsSection.tsx
146:6  Warning: React Hook useEffect has a missing dependency: 'refreshAllHosts'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/sidebar/TeamCard.tsx
56:19  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/sidebar/TeamListView.tsx
238:25  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/team-meeting/AgentPicker.tsx
75:21  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/team-meeting/MeetingSidebar.tsx
180:23  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
293:21  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/team-meeting/RingingAnimation.tsx
122:23  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/team-meeting/SelectedAgentsBar.tsx
52:23  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/zoom/AgentCard.tsx
129:15  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/zoom/AgentProfileTab.tsx
344:21  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules
Failed to compile.

./components/HaephestosLeftPanel.tsx:178:15
Type error: Type 'RefObject<HTMLInputElement | null>' is not assignable to type 'LegacyRef<HTMLInputElement> | undefined'.
  Type 'RefObject<HTMLInputElement | null>' is not assignable to type 'RefObject<HTMLInputElement>'.
    Type 'HTMLInputElement | null' is not assignable to type 'HTMLInputElement'.
      Type 'null' is not assignable to type 'HTMLInputElement'.

[0m [90m 176 |[39m             [33m<[39m[33minput[39m[0m
[0m [90m 177 |[39m               key[33m=[39m{[32m`input-${def.slot}`[39m}[0m
[0m[31m[1m>[22m[39m[90m 178 |[39m               ref[33m=[39m{inputRefs[def[33m.[39mslot]}[0m
[0m [90m     |[39m               [31m[1m^[22m[39m[0m
[0m [90m 179 |[39m               type[33m=[39m[32m"file"[39m[0m
[0m [90m 180 |[39m               accept[33m=[39m[32m".md,.txt,.toml,.ts,.tsx,.js,.jsx,.py,.sh,.json,.yaml,.yml,.xml,.html,.css"[39m[0m
[0m [90m 181 |[39m               className[33m=[39m[32m"hidden"[39m[0m
Next.js build worker exited with code: 1 and signal: null
error Command failed with exit code 1.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.
