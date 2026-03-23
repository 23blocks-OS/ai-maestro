yarn run v1.22.22
(node:70613) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
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
./services/agents-graph-service.ts
./app/api/agents/[id]/database/route.ts

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

./app/plugin-builder/page.tsx
29:6  Warning: React Hook useCallback has an unnecessary dependency: 'getSkillKey'. Either exclude it or remove the dependency array. Outer scope values like 'getSkillKey' aren't valid dependencies because mutating them doesn't re-render the component.  react-hooks/exhaustive-deps
33:6  Warning: React Hook useCallback has an unnecessary dependency: 'getSkillKey'. Either exclude it or remove the dependency array. Outer scope values like 'getSkillKey' aren't valid dependencies because mutating them doesn't re-render the component.  react-hooks/exhaustive-deps

./app/zoom/agent/page.tsx
108:23  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./app/zoom/page.tsx
364:25  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/AMPAddressesSection.tsx
53:6  Warning: React Hook useEffect has a missing dependency: 'fetchAddresses'. Either include it or remove the dependency array.  react-hooks/exhaustive-deps

./components/AgentGraph.tsx
296:6  Warning: React Hook useEffect has missing dependencies: 'detectProjectPath', 'fetchGraphData', and 'fetchStats'. Either include them or remove the dependency array.  react-hooks/exhaustive-deps

./components/AgentList.tsx
1174:47  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

./components/AgentProfile.tsx
492:27  Warning: Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

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

./components/HaephestosEmbeddedView.tsx
170:6  Warning: React Hook useEffect has a missing dependency: 'onAgentCreated'. Either include it or remove the dependency array. If 'onAgentCreated' changes too often, find the parent component that defines it and wrap that definition in useCallback.  react-hooks/exhaustive-deps

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

./components/plugin-builder/SkillPicker.tsx
40:6  Warning: React Hook useMemo has an unnecessary dependency: 'getSkillKey'. Either exclude it or remove the dependency array. Outer scope values like 'getSkillKey' aren't valid dependencies because mutating them doesn't re-render the component.  react-hooks/exhaustive-deps

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

info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules
Failed to compile.

./services/plugin-builder-service.ts:925:17
Type error: Cannot find name 'existing'.

[0m [90m 923 |[39m       status[33m:[39m [32m'failed'[39m[33m,[39m[0m
[0m [90m 924 |[39m       logs[33m,[39m[0m
[0m[31m[1m>[22m[39m[90m 925 |[39m       buildDir[33m:[39m existing[33m.[39mbuildDir[33m,[39m[0m
[0m [90m     |[39m                 [31m[1m^[22m[39m[0m
[0m [90m 926 |[39m       outputPath[33m:[39m undefined[33m,[39m[0m
[0m [90m 927 |[39m       stats[33m:[39m undefined[33m,[39m[0m
[0m [90m 928 |[39m     })[0m
Next.js build worker exited with code: 1 and signal: null
error Command failed with exit code 1.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.
