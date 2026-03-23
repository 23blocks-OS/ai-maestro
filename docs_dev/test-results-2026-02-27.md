yarn run v1.22.22
(node:39489) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)
warning ../package.json: No license field
$ vitest run

[1m[46m RUN [49m[22m [36mv4.0.18 [39m[90m/Users/emanuelesabetta/ai-maestro[39m

[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mgetOrCreateHostKeyPair[2m > [22m[2mgenerates a new keypair when no keys exist on disk
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mgetOrCreateHostKeyPair[2m > [22m[2mreturns the same keys on subsequent calls (from cache)
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mgetOrCreateHostKeyPair[2m > [22m[2mregenerates keys when existing files are corrupt (too short)
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstderr[2m | tests/host-keys.test.ts[2m > [22m[2mgetOrCreateHostKeyPair[2m > [22m[2mregenerates keys when existing files are corrupt (too short)
[22m[39m[host-keys] Key files exist but appear corrupt (unexpected length), regenerating

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mkey persistence[2m > [22m[2mwrites keys to disk using atomic rename pattern
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mkey persistence[2m > [22m[2mcreates the host-keys directory if it does not exist
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mgetHostPublicKeyHex[2m > [22m[2mreturns only the public key hex string
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2msignHostAttestation[2m > [22m[2mproduces a valid base64 signature for given data
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2msignHostAttestation[2m > [22m[2mproduces different signatures for different data
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mverifyHostAttestation[2m > [22m[2mreturns true for a valid signature matching data and key
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mverifyHostAttestation[2m > [22m[2mreturns false when data has been tampered with
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mverifyHostAttestation[2m > [22m[2mreturns false when verified with a different public key
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2mverifyHostAttestation[2m > [22m[2mreturns false for malformed signature input without throwing
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2medge cases[2m > [22m[2msigns and verifies empty string data
[22m[39m[host-keys] Generated new Ed25519 host keypair

[90mstdout[2m | tests/host-keys.test.ts[2m > [22m[2medge cases[2m > [22m[2msigns and verifies very long data (100KB)
[22m[39m[host-keys] Generated new Ed25519 host keypair

 [32m✓[39m tests/host-keys.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 46[2mms[22m[39m
[90mstderr[2m | tests/task-registry.test.ts[2m > [22m[2mloadTasks[2m > [22m[2mreturns empty array when file contains invalid JSON
[22m[39mFailed to load tasks for team aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa: SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)
    at JSON.parse (<anonymous>)
    at Module.loadTasks [90m(/Users/emanuelesabetta/ai-maestro/[39mlib/task-registry.ts:40:36[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/task-registry.test.ts:136:19
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m

[90mstderr[2m | tests/task-registry.test.ts[2m > [22m[2mloadTasks[2m > [22m[2mrejects path traversal teamId by returning empty array
[22m[39mFailed to load tasks for team ../../../etc/passwd: Error: Invalid team ID
    at tasksFilePath [90m(/Users/emanuelesabetta/ai-maestro/[39mlib/task-registry.ts:27:35[90m)[39m
    at Module.loadTasks [90m(/Users/emanuelesabetta/ai-maestro/[39mlib/task-registry.ts:35:22[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/task-registry.test.ts:150:19
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m

[90mstderr[2m | tests/task-registry.test.ts[2m > [22m[2mcreateTask[2m > [22m[2mrejects non-UUID teamId
[22m[39mFailed to load tasks for team not-a-uuid: Error: Invalid team ID
    at tasksFilePath [90m(/Users/emanuelesabetta/ai-maestro/[39mlib/task-registry.ts:27:35[90m)[39m
    at loadTasks [90m(/Users/emanuelesabetta/ai-maestro/[39mlib/task-registry.ts:35:22[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mlib/task-registry.ts:108:19
    at withLock [90m(/Users/emanuelesabetta/ai-maestro/[39mlib/file-lock.ts:107:18[90m)[39m
[90m    at processTicksAndRejections (node:internal/process/task_queues:104:5)[39m

 [32m✓[39m tests/task-registry.test.ts [2m([22m[2m47 tests[22m[2m)[22m[32m 14[2mms[22m[39m
[90mstderr[2m | tests/services/teams-service.test.ts[2m > [22m[2mcreateNewTeam[2m > [22m[2mreturns 500 when createTeam throws
[22m[39mFailed to create team: Error: disk full
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/teams-service.test.ts:199:44
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m
    at trace [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/test.B8ej_ZHS.js:239:21[90m)[39m
    at runTest [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:12[90m)[39m

[90mstderr[2m | tests/services/teams-service.test.ts[2m > [22m[2mupdateTeamById[2m > [22m[2mreturns 500 when updateTeam throws
[22m[39mFailed to update team: Error: write error
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/teams-service.test.ts:293:44
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m
    at trace [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/test.B8ej_ZHS.js:239:21[90m)[39m
    at runTest [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:12[90m)[39m

[90mstderr[2m | tests/services/teams-service.test.ts[2m > [22m[2mcreateTeamTask[2m > [22m[2mreturns 500 when createTask throws
[22m[39mFailed to create task: Error: boom
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/teams-service.test.ts:484:44
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m
    at trace [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/test.B8ej_ZHS.js:239:21[90m)[39m
    at runTest [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:12[90m)[39m

[90mstderr[2m | tests/services/teams-service.test.ts[2m > [22m[2mupdateTeamTask[2m > [22m[2mreturns 500 when updateTask throws
[22m[39mFailed to update task: Error: write fail
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/teams-service.test.ts:594:44
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m
    at trace [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/test.B8ej_ZHS.js:239:21[90m)[39m
    at runTest [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:12[90m)[39m

[90mstderr[2m | tests/services/teams-service.test.ts[2m > [22m[2mcreateTeamDocument[2m > [22m[2mreturns 500 when createDocument throws
[22m[39mFailed to create document: Error: boom
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/teams-service.test.ts:741:47
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m
    at trace [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/test.B8ej_ZHS.js:239:21[90m)[39m
    at runTest [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:12[90m)[39m

[90mstderr[2m | tests/services/teams-service.test.ts[2m > [22m[2mupdateTeamDocument[2m > [22m[2mreturns 500 when updateDocument throws
[22m[39mFailed to update document: Error: write error
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/teams-service.test.ts:831:47
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m
    at trace [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/test.B8ej_ZHS.js:239:21[90m)[39m
    at runTest [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:12[90m)[39m

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mlistSessions[2m > [22m[2mreturns sessions and caches subsequent calls
[22m[39m[Sessions] Fetching from 1 host(s)...

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mlistSessions[2m > [22m[2mreturns sessions and caches subsequent calls
[22m[39m[Agents] Found 1 local tmux session(s)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mlistLocalSessions[2m > [22m[2mreturns local sessions
[22m[39m[Agents] Found 1 local tmux session(s)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mlistLocalSessions[2m > [22m[2mreturns empty when no self host configured
[22m[39m[Agents] Found 0 local tmux session(s)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mlistLocalSessions[2m > [22m[2mreturns empty when no sessions found
[22m[39m[Agents] Found 0 local tmux session(s)

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2madd-skill creates skill directory and SKILL.md
[22m[39m[config-deploy] Deployed 1 skill(s) to /tmp/test-agent/.claude

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2madd-skill creates skill directory and SKILL.md
[22m[39m[config-deploy] WARNING: Skill "test-analysis-skill" deployed WITHOUT ToxicSkills scan (not yet implemented). Skills are NOT checked for malicious content.

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mremove-skill removes existing skill directory
[22m[39m[config-deploy] Removed 1 skill(s) from /tmp/test-agent/.claude

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mremove-skill is idempotent for non-existent skill (no error)
[22m[39m[config-deploy] Removed 1 skill(s) from /tmp/test-agent/.claude

 [32m✓[39m tests/services/teams-service.test.ts [2m([22m[2m73 tests[22m[2m)[22m[32m 14[2mms[22m[39m
[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2madd-plugin creates plugin directory
[22m[39m[config-deploy] Deployed 1 plugin(s) to /tmp/test-agent/.claude

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mremove-plugin removes existing plugin directory
[22m[39m[config-deploy] Removed 1 plugin(s) from /tmp/test-agent/.claude

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mupdate-hooks merges hooks into settings.json
[22m[39m[config-deploy] Updated hooks in /tmp/test-agent/.claude/settings.json

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mupdate-mcp merges mcpServers into settings.json
[22m[39m[config-deploy] Updated mcpServers in /tmp/test-agent/.claude/settings.json

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mupdate-model calls updateAgentById with the new model
[22m[39m[config-deploy] Updated model for agent 550e8400-e29b-41d4-a716-446655440000 to 'claude-sonnet-4-20250514'

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mbulk-config handles multiple operations in one deployment
[22m[39m[config-deploy] Deployed 1 skill(s) to /tmp/test-agent/.claude

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mbulk-config handles multiple operations in one deployment
[22m[39m[config-deploy] WARNING: Skill "bulk-skill-1" deployed WITHOUT ToxicSkills scan (not yet implemented). Skills are NOT checked for malicious content.

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mbulk-config handles multiple operations in one deployment
[22m[39m[config-deploy] Updated hooks in /tmp/test-agent/.claude/settings.json

[90mstderr[2m | tests/team-registry.test.ts[2m > [22m[2mloadTeams[2m > [22m[2mreturns empty array for invalid JSON
[22m[39mFailed to load teams: SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)
    at JSON.parse (<anonymous>)
    at Module.loadTeams [90m(/Users/emanuelesabetta/ai-maestro/[39mlib/team-registry.ts:215:36[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/team-registry.test.ts:115:12
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mlistLocalSessions[2m > [22m[2mmarks session as active when recently active
[22m[39m[Agents] Found 1 local tmux session(s)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mlistLocalSessions[2m > [22m[2mmarks session as disconnected when no activity recorded
[22m[39m[Agents] Found 1 local tmux session(s)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mlistLocalSessions[2m > [22m[2mmarks session as idle when activity is old
[22m[39m[Agents] Found 1 local tmux session(s)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mlistLocalSessions[2m > [22m[2mlinks agentId from registry
[22m[39m[Agents] Found 1 local tmux session(s)

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mbulk-config handles multiple operations in one deployment
[22m[39m[config-deploy] Bulk config deployed for agent 550e8400-e29b-41d4-a716-446655440000

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mupdate-hooks handles missing settings.json gracefully (creates from scratch)
[22m[39m[config-deploy] Updated hooks in /tmp/test-agent/.claude/settings.json

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig deploy service[2m > [22m[2mdeployConfigToAgent returns 500 when filesystem operation throws unexpected error
[22m[39m[config-deploy] Deployment failed for agent 550e8400-e29b-41d4-a716-446655440000: EACCES: permission denied

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mreceiveCrossHostRequest accepts configure-agent as a valid type
[22m[39m[cross-host-governance] Received request req-ext-001 (type=configure-agent) from host host-remote

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mapproveCrossHostRequest triggers execution for configure-agent when dual-approved
[22m[39m[cross-host-governance] Executing request req-ext-001 (type=configure-agent)

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mapproveCrossHostRequest triggers execution for configure-agent when dual-approved
[22m[39m[cross-host-governance] configure-agent execution failed for request req-ext-001: Agent working directory '/tmp/test-agent' does not exist

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mapproveCrossHostRequest triggers execution for configure-agent when dual-approved
[22m[39m[cross-host-governance] Successfully executed request req-ext-001 (type=configure-agent)

[90mstdout[2m | tests/team-registry.test.ts[2m > [22m[2mcreateTeam[2m > [22m[2mcreates a team with name and agentIds
[22m[39m[Hosts] No configuration found, using self host only

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mcreates a local session successfully
[22m[39m[Sessions] Registered new agent: my-agent (new-agent-id)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mcreates a local session successfully
[22m[39m[Sessions] Set AMP_DIR=/tmp/amp/test for agent my-agent

[90mstderr[2m | tests/agent-registry.test.ts[2m > [22m[2mloadAgents[2m > [22m[2mreturns an empty array when registry file contains invalid JSON
[22m[39mFailed to load agents: SyntaxError: Expected property name or '}' in JSON at position 1 (line 1 column 2)
    at JSON.parse (<anonymous>)
    at Module.loadAgents [90m(/Users/emanuelesabetta/ai-maestro/[39mlib/agent-registry.ts:180:25[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/agent-registry.test.ts:174:20
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m

 [32m✓[39m tests/team-registry.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 15[2mms[22m[39m
[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2mdeleteAgent[2m > [22m[2msoft-deletes agent by default (marks deletedAt, keeps in registry)
[22m[39m[Agent Registry] Killed tmux session: delete-me
[Agent Registry] Soft-deleted agent delete-me (id: 00000000-0000-0000-0000-000000000001)

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2mdeleteAgent[2m > [22m[2mhard-deletes agent when hard=true (removes from registry)
[22m[39m[Agent Registry] Killed tmux session: hard-delete-me
[Agent Registry] Backed up agent hard-delete-me to /Users/emanuelesabetta/.aimaestro/backups/agents/00000000-0000-0000-0000-000000000001-2026-02-27T04-38-45-550Z
[Agent Registry] Removed hard-delete-me from AMP index

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2mdeleteAgent[2m > [22m[2msoft-deletes the correct agent when multiple exist
[22m[39m[Agent Registry] Killed tmux session: delete-me
[Agent Registry] Soft-deleted agent delete-me (id: 00000000-0000-0000-0000-000000000002)

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2mdeleteAgent[2m > [22m[2mhard-deletes the correct agent when multiple exist
[22m[39m[Agent Registry] Killed tmux session: delete-me
[Agent Registry] Backed up agent delete-me to /Users/emanuelesabetta/.aimaestro/backups/agents/00000000-0000-0000-0000-000000000002-2026-02-27T04-38-45-551Z
[Agent Registry] Removed delete-me from AMP index

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2msoft-delete filtering[2m > [22m[2mgetAgent() returns null for soft-deleted agent
[22m[39m[Agent Registry] Killed tmux session: soft-del-lookup
[Agent Registry] Soft-deleted agent soft-del-lookup (id: 00000000-0000-0000-0000-000000000001)

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2msoft-delete filtering[2m > [22m[2mgetAgent() returns soft-deleted agent with includeDeleted=true
[22m[39m[Agent Registry] Killed tmux session: soft-del-include
[Agent Registry] Soft-deleted agent soft-del-include (id: 00000000-0000-0000-0000-000000000001)

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2msoft-delete filtering[2m > [22m[2mgetAgentByName() excludes soft-deleted agents
[22m[39m[Agent Registry] Killed tmux session: soft-del-byname
[Agent Registry] Soft-deleted agent soft-del-byname (id: 00000000-0000-0000-0000-000000000001)

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2msoft-delete filtering[2m > [22m[2mlistAgents() excludes soft-deleted agents
[22m[39m[Agent Registry] Killed tmux session: list-delete
[Agent Registry] Soft-deleted agent list-delete (id: 00000000-0000-0000-0000-000000000002)

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2msoft-delete filtering[2m > [22m[2msearchAgents() excludes soft-deleted agents
[22m[39m[Agent Registry] Killed tmux session: searchable-soft-del
[Agent Registry] Soft-deleted agent searchable-soft-del (id: 00000000-0000-0000-0000-000000000001)

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2msoft-delete filtering[2m > [22m[2mcreateAgent() succeeds with same name as soft-deleted agent
[22m[39m[Agent Registry] Killed tmux session: name-reuse-test
[Agent Registry] Soft-deleted agent name-reuse-test (id: 00000000-0000-0000-0000-000000000001)

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2msoft-delete filtering[2m > [22m[2mlistAgents(true) includes soft-deleted agents
[22m[39m[Agent Registry] Killed tmux session: listall-delete
[Agent Registry] Soft-deleted agent listall-delete (id: 00000000-0000-0000-0000-000000000002)

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mlistAgents[2m > [22m[2mreturns empty list when no agents and no sessions
[22m[39m[Agents] Found 0 local tmux session(s)

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mperformRequestExecution handles deployment failure gracefully for configure-agent
[22m[39m[cross-host-governance] Executing request req-ext-001 (type=configure-agent)

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mperformRequestExecution handles deployment failure gracefully for configure-agent
[22m[39m[cross-host-governance] configure-agent execution failed for request req-ext-001: Agent '550e8400-e29b-41d4-a716-446655440000' not found

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mperformRequestExecution handles deployment failure gracefully for configure-agent
[22m[39m[cross-host-governance] Successfully executed request req-ext-001 (type=configure-agent)

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mlistAgents[2m > [22m[2mreturns agents from registry with session status
[22m[39m[Agents] Found 1 local tmux session(s)

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mreceiveCrossHostRequest auto-approves configure-agent via manager trust
[22m[39m[cross-host-governance] Received request req-ext-001 (type=configure-agent) from host host-remote
[cross-host-governance] Auto-approving request req-ext-001 from trusted manager on host host-remote

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mreceiveCrossHostRequest auto-approves configure-agent via manager trust
[22m[39m[cross-host-governance] Executing request req-ext-001 (type=configure-agent)

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mreceiveCrossHostRequest auto-approves configure-agent via manager trust
[22m[39m[cross-host-governance] configure-agent execution failed for request req-ext-001: Agent working directory '/tmp/test-agent' does not exist

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mcross-host configure-agent[2m > [22m[2mreceiveCrossHostRequest auto-approves configure-agent via manager trust
[22m[39m[cross-host-governance] Successfully executed request req-ext-001 (type=configure-agent)

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mlistAgents[2m > [22m[2mcreates orphan agents for sessions without registry entries
[22m[39m[Agents] Found 1 local tmux session(s)
[Agents] Auto-registered 1 orphan session(s) as agents

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mapproved configure-agent triggers notification with approved outcome
[22m[39m[cross-host-governance] Executing request req-ext-001 (type=configure-agent)

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mapproved configure-agent triggers notification with approved outcome
[22m[39m[cross-host-governance] configure-agent execution failed for request req-ext-001: Agent working directory '/tmp/test-agent' does not exist

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2mrenameAgent[2m > [22m[2mrenames an agent successfully
[22m[39m[Agent Registry] Renaming agent from "old-name" to "new-name"
[Agent Registry] Updated AMP index: old-name -> new-name (00000000-0000-0000-0000-000000000001)

[90mstdout[2m | tests/agent-registry.test.ts[2m > [22m[2mrenameAgent[2m > [22m[2mnormalizes new name to lowercase
[22m[39m[Agent Registry] Renaming agent from "rename-case" to "upper-name"
[Agent Registry] Updated AMP index: rename-case -> upper-name (00000000-0000-0000-0000-000000000001)

[90mstderr[2m | tests/agent-registry.test.ts[2m > [22m[2mrenameAgent[2m > [22m[2mrejects duplicate name on same host
[22m[39m[Agent Registry] Cannot rename: agent "existing-name" already exists on host "test-host"

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mlistAgents[2m > [22m[2mmarks agents offline when no matching tmux session
[22m[39m[Agents] Found 0 local tmux session(s)

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mlistAgents[2m > [22m[2mmarks agents active when matching tmux session exists
[22m[39m[Agents] Found 1 local tmux session(s)

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mapproved configure-agent triggers notification with approved outcome
[22m[39m[cross-host-governance] Successfully executed request req-ext-001 (type=configure-agent)

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mlistAgents[2m > [22m[2msorts online agents before offline
[22m[39m[Agents] Found 1 local tmux session(s)

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mlistAgents[2m > [22m[2mincludes host info in response
[22m[39m[Agents] Found 0 local tmux session(s)

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mnon-configure-agent request type does not trigger notification on approval
[22m[39m[cross-host-governance] Executing request req-ext-001 (type=add-to-team)

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mnon-configure-agent request type does not trigger notification on approval
[22m[39m[cross-host-governance] Successfully executed request req-ext-001 (type=add-to-team)

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mnotification failure does not propagate as error to caller
[22m[39m[cross-host-governance] Executing request req-ext-001 (type=configure-agent)

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mnotification failure does not propagate as error to caller
[22m[39m[cross-host-governance] configure-agent execution failed for request req-ext-001: Agent working directory '/tmp/test-agent' does not exist

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mnotification failure does not propagate as error to caller
[22m[39m[cross-host-governance] Successfully executed request req-ext-001 (type=configure-agent)

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mnotification failure does not propagate as error to caller
[22m[39m[cross-host-governance] Failed to send config notification: AMP service unavailable

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mauto-approved configure-agent sends notification on receive
[22m[39m[cross-host-governance] Received request req-ext-001 (type=configure-agent) from host host-remote
[cross-host-governance] Auto-approving request req-ext-001 from trusted manager on host host-remote

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mauto-approved configure-agent sends notification on receive
[22m[39m[cross-host-governance] Executing request req-ext-001 (type=configure-agent)

[90mstderr[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mauto-approved configure-agent sends notification on receive
[22m[39m[cross-host-governance] configure-agent execution failed for request req-ext-001: Agent working directory '/tmp/test-agent' does not exist

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mauto-approved configure-agent sends notification on receive
[22m[39m[cross-host-governance] Successfully executed request req-ext-001 (type=configure-agent)

[90mstdout[2m | tests/agent-config-governance-extended.test.ts[2m > [22m[2mconfig notifications[2m > [22m[2mrejected configure-agent on receive does not send notification (only on reject)
[22m[39m[cross-host-governance] Received request req-ext-001 (type=configure-agent) from host host-remote

 [32m✓[39m tests/agent-config-governance.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 25[2mms[22m[39m
 [32m✓[39m tests/agent-registry.test.ts [2m([22m[2m91 tests[22m[2m)[22m[32m 25[2mms[22m[39m
[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mlistAgents[2m > [22m[2mreturns 500 on unexpected error
[22m[39m[Agents] Failed to fetch agents: Error: disk error
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:247:67
    at Mock [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/spy[24m/dist/index.js:285:34[90m)[39m
    at Module.listAgents [90m(/Users/emanuelesabetta/ai-maestro/[39mservices/agents-core-service.ts:419:20[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:249:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37

 [32m✓[39m tests/agent-config-governance-extended.test.ts [2m([22m[2m56 tests[22m[2m)[22m[32m 36[2mms[22m[39m
[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mcreateNewAgent[2m > [22m[2mreturns 400 when createAgent throws (e.g., duplicate name)
[22m[39mFailed to create agent: Error: Agent name already exists
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:301:68
    at Mock [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/spy[24m/dist/index.js:285:34[90m)[39m
    at Module.createNewAgent [90m(/Users/emanuelesabetta/ai-maestro/[39mservices/agents-core-service.ts:621:25[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:303:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37

[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mgetAgentById[2m > [22m[2mreturns 500 on unexpected error
[22m[39mFailed to get agent: Error: read error
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:338:65
    at Mock [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/spy[24m/dist/index.js:285:34[90m)[39m
    at Module.getAgentById [90m(/Users/emanuelesabetta/ai-maestro/[39mservices/agents-core-service.ts:636:19[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:340:20
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37

[90mstderr[2m | tests/transfer-resolve-route.test.ts[2m > [22m[2mSR-007: saveTeams failure triggers compensating revert[2m > [22m[2mreverts transfer to pending when saveTeams returns false
[22m[39m[TransferResolve] Failed to save teams after approval: Error: ENOSPC: disk full
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/transfer-resolve-route.test.ts:274:52
    at Mock [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/spy[24m/dist/index.js:285:34[90m)[39m
    at saveTeams [90m(/Users/emanuelesabetta/ai-maestro/[39mtests/transfer-resolve-route.test.ts:24:38[90m)[39m
    at Module.POST [90m(/Users/emanuelesabetta/ai-maestro/[39mapp/api/governance/transfers/[id]/resolve/route.ts:175:11[90m)[39m
[90m    at processTicksAndRejections (node:internal/process/task_queues:104:5)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/transfer-resolve-route.test.ts:278:17
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:20

[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mupdateAgentById[2m > [22m[2mreturns 400 when updateAgent throws (e.g., duplicate name)
[22m[39mFailed to update agent: Error: Name taken
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:384:68
    at Mock [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/spy[24m/dist/index.js:285:34[90m)[39m
    at Module.updateAgentById [90m(/Users/emanuelesabetta/ai-maestro/[39mservices/agents-core-service.ts:681:25[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:386:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37

[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mdeleteAgentById[2m > [22m[2msoft deletes agent
[22m[39m[agents] Failed to auto-reject pending config requests: __vite_ssr_import_0__.default.renameSync is not a function

[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mdeleteAgentById[2m > [22m[2mhard deletes agent
[22m[39m[agents] Failed to auto-reject pending config requests: __vite_ssr_import_0__.default.renameSync is not a function

[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mdeleteAgentById[2m > [22m[2mallows hard delete of already soft-deleted agent
[22m[39m[agents] Failed to auto-reject pending config requests: __vite_ssr_import_0__.default.renameSync is not a function

 [32m✓[39m tests/transfer-resolve-route.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 16[2mms[22m[39m
[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mwakeAgent[2m > [22m[2mwakes a hibernated agent
[22m[39m[Agents] Set AMP_DIR=/tmp/amp/test for agent my-agent

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mwakeAgent[2m > [22m[2mwakes a hibernated agent
[22m[39m[Wake] Agent my-agent (agent-1) session 0 woken up successfully

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mwakeAgent[2m > [22m[2mpersists session metadata on wake
[22m[39m[Agents] Set AMP_DIR=/tmp/amp/test for agent my-agent

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mwakeAgent[2m > [22m[2mpersists session metadata on wake
[22m[39m[Wake] Agent my-agent (agent-1) session 0 woken up successfully

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mwakeAgent[2m > [22m[2msets up AMP for the session
[22m[39m[Agents] Set AMP_DIR=/tmp/amp/test for agent my-agent

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mwakeAgent[2m > [22m[2msets up AMP for the session
[22m[39m[Wake] Agent my-agent (agent-1) session 0 woken up successfully

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mwakeAgent[2m > [22m[2muses session index for multi-brain sessions
[22m[39m[Agents] Set AMP_DIR=/tmp/amp/test for agent my-agent

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mwakeAgent[2m > [22m[2muses session index for multi-brain sessions
[22m[39m[Wake] Agent my-agent (agent-1) session 2 woken up successfully

[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mwakeAgent[2m > [22m[2mreturns 500 when tmux session creation fails
[22m[39m[Wake] Failed to create tmux session: Error: tmux error
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:643:49
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m
    at trace [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/test.B8ej_ZHS.js:239:21[90m)[39m
    at runTest [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:12[90m)[39m

[90mstdout[2m | tests/team-api.test.ts[2m > [22m[2mGET /api/teams[2m > [22m[2mreturns all teams
[22m[39m[Hosts] No configuration found, using self host only

 [32m✓[39m tests/cross-host-governance.test.ts [2m([22m[2m40 tests[22m[2m)[22m[32m 71[2mms[22m[39m
[90mstdout[2m | tests/document-api.test.ts[2m > [22m[2mGET /api/teams/[id]/documents[2m > [22m[2mreturns empty documents array for team with no docs
[22m[39m[Hosts] No configuration found, using self host only

 [32m✓[39m tests/team-api.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m tests/document-api.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/governance-peers.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 7[2mms[22m[39m
[90mstdout[2m | tests/governance-sync.test.ts[2m > [22m[2mhandleGovernanceSyncMessage[2m > [22m[2msaves peer governance state to disk with correct fields
[22m[39m[governance-sync] Updated peer state for host-remote-1: type=manager-changed, manager=agent-mgr-remote, teams=1

[90mstdout[2m | tests/governance-sync.test.ts[2m > [22m[2mhandleGovernanceSyncMessage[2m > [22m[2mhandles missing teams in payload by defaulting to empty array
[22m[39m[governance-sync] Updated peer state for host-remote-2: type=manager-changed, manager=agent-mgr-2, teams=0

[90mstdout[2m | tests/governance-sync.test.ts[2m > [22m[2mhandleGovernanceSyncMessage[2m > [22m[2mhandles null managerId and managerName in payload gracefully
[22m[39m[governance-sync] Updated peer state for host-remote-3: type=team-updated, manager=none, teams=1

 [32m✓[39m tests/governance-sync.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 15[2mms[22m[39m
[90mstderr[2m | tests/document-registry.test.ts[2m > [22m[2mloadDocuments[2m > [22m[2mreturns empty array when file contains invalid JSON
[22m[39mFailed to load documents for team 00000000-0000-4000-8000-000000000001: SyntaxError: Expected property name or '}' in JSON at position 2 (line 1 column 3)
    at JSON.parse (<anonymous>)
    at Module.loadDocuments [90m(/Users/emanuelesabetta/ai-maestro/[39mlib/document-registry.ts:39:44[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/document-registry.test.ts:137:18
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m

 [32m✓[39m tests/document-registry.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 14[2mms[22m[39m
[90mstderr[2m | tests/use-governance-hook.test.ts[2m > [22m[2mresolveConfigRequest API contract[2m > [22m[2mhandles unparseable error response body gracefully
[22m[39m[useGovernance] Failed to parse response JSON: Error: Unexpected token
    at Object.json [90m(/Users/emanuelesabetta/ai-maestro/[39mtests/use-governance-hook.test.ts:320:33[90m)[39m
    at resolveConfigRequest [90m(/Users/emanuelesabetta/ai-maestro/[39mtests/use-governance-hook.test.ts:105:30[90m)[39m
[90m    at processTicksAndRejections (node:internal/process/task_queues:104:5)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/use-governance-hook.test.ts:323:20
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:20

 [32m✓[39m tests/use-governance-hook.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 11[2mms[22m[39m
[90mstderr[2m | tests/governance-request-registry.test.ts[2m > [22m[2mloadGovernanceRequests[2m > [22m[2mhandles corrupted JSON gracefully and backs up corrupted file
[22m[39m[governance-requests] CORRUPTION: governance-requests.json contains invalid JSON -- returning defaults. Manual inspection required: /Users/emanuelesabetta/.aimaestro/governance-requests.json
[governance-requests] Corrupted file backed up to /Users/emanuelesabetta/.aimaestro/governance-requests.json.corrupted.1772167125786

 [32m✓[39m tests/transfer-registry.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 8[2mms[22m[39m
[90mstdout[2m | tests/governance-request-registry.test.ts[2m > [22m[2mpurgeOldRequests[2m > [22m[2malso expires stale pending requests via 7-day TTL
[22m[39m[governance-requests] Expired 1 pending request(s) past 7-day TTL

[90mstdout[2m | tests/governance-request-registry.test.ts[2m > [22m[2mexpirePendingRequests[2m > [22m[2mexpires pending requests older than TTL days
[22m[39m[governance-requests] Expired 1 pending request(s) past 7-day TTL

 [32m✓[39m tests/governance-request-registry.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 9[2mms[22m[39m
[90mstderr[2m | tests/manager-trust.test.ts[2m > [22m[2mloadManagerTrust[2m > [22m[2mhandles corrupted JSON gracefully
[22m[39m[manager-trust] CORRUPTION: manager-trust.json contains invalid JSON -- returning defaults. Manual inspection required: /Users/emanuelesabetta/.aimaestro/manager-trust.json
[manager-trust] Corrupted file backed up to /Users/emanuelesabetta/.aimaestro/manager-trust.json.corrupted.1772167125798

 [32m✓[39m tests/manager-trust.test.ts [2m([22m[2m15 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/content-security.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 4[2mms[22m[39m
[90mstderr[2m | tests/governance.test.ts[2m > [22m[2mloadGovernance[2m > [22m[2mreturns defaults and backs up when governance file contains invalid JSON
[22m[39m[governance] CORRUPTION: governance.json contains invalid JSON — returning defaults. Manual inspection required: /Users/emanuelesabetta/.aimaestro/governance.json
[governance] Corrupted config backed up to /Users/emanuelesabetta/.aimaestro/governance.json.corrupted.1772167125807

 [32m✓[39m tests/role-attestation.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m tests/governance.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/governance-endpoint-auth.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/message-filter.test.ts [2m([22m[2m28 tests[22m[2m)[22m[32m 5[2mms[22m[39m
[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mcreates a local session successfully
[22m[39m[Sessions] Launched program "claude" in session my-agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mnormalizes name to lowercase
[22m[39m[Sessions] Registered new agent: myagent (id)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mnormalizes name to lowercase
[22m[39m[Sessions] Set AMP_DIR=/tmp/amp/test for agent myagent

 [32m✓[39m tests/validate-team-mutation.test.ts [2m([22m[2m18 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/agent-auth.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/agent-utils.test.ts [2m([22m[2m21 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/amp-address.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 2[2mms[22m[39m
 [32m✓[39m tests/amp-auth.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 3[2mms[22m[39m
[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mnormalizes name to lowercase
[22m[39m[Sessions] Launched program "claude" in session myagent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2muses provided working directory
[22m[39m[Sessions] Registered new agent: agent (id)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2muses provided working directory
[22m[39m[Sessions] Set AMP_DIR=/tmp/amp/test for agent agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2muses provided working directory
[22m[39m[Sessions] Launched program "claude" in session agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mregisters a new agent when not found in registry
[22m[39m[Sessions] Registered new agent: agent (new-id)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mregisters a new agent when not found in registry
[22m[39m[Sessions] Set AMP_DIR=/tmp/amp/test for agent agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mregisters a new agent when not found in registry
[22m[39m[Sessions] Launched program "claude" in session agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mskips registration when agent exists in registry
[22m[39m[Sessions] Set AMP_DIR=/tmp/amp/test for agent agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mskips registration when agent exists in registry
[22m[39m[Sessions] Launched program "claude" in session agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mpersists session metadata
[22m[39m[Sessions] Registered new agent: agent (id)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mpersists session metadata
[22m[39m[Sessions] Set AMP_DIR=/tmp/amp/test for agent agent

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mhibernateAgent[2m > [22m[2mhibernates an active agent
[22m[39m[Hibernate] Agent my-agent (agent-1) session 0 hibernated successfully

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2mpersists session metadata
[22m[39m[Sessions] Launched program "claude" in session agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2minitializes AMP for the session
[22m[39m[Sessions] Registered new agent: agent (id)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2minitializes AMP for the session
[22m[39m[Sessions] Set AMP_DIR=/tmp/amp/test for agent agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2minitializes AMP for the session
[22m[39m[Sessions] Launched program "claude" in session agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2maccepts valid session names with hyphens and underscores
[22m[39m[Sessions] Registered new agent: my-test_agent (id)

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2maccepts valid session names with hyphens and underscores
[22m[39m[Sessions] Set AMP_DIR=/tmp/amp/test for agent my-test_agent

[90mstdout[2m | tests/services/sessions-service.test.ts[2m > [22m[2mcreateSession[2m > [22m[2maccepts valid session names with hyphens and underscores
[22m[39m[Sessions] Launched program "claude" in session my-test_agent

 [32m✓[39m tests/services/sessions-service.test.ts [2m([22m[2m60 tests[22m[2m)[22m[33m 2427[2mms[22m[39m
     [33m[2m✓[22m[39m creates a local session successfully [33m 304[2mms[22m[39m
     [33m[2m✓[22m[39m normalizes name to lowercase [33m 301[2mms[22m[39m
     [33m[2m✓[22m[39m uses provided working directory [33m 302[2mms[22m[39m
     [33m[2m✓[22m[39m registers a new agent when not found in registry [33m 302[2mms[22m[39m
     [33m[2m✓[22m[39m skips registration when agent exists in registry [33m 301[2mms[22m[39m
     [33m[2m✓[22m[39m persists session metadata [32m 300[2mms[22m[39m
     [33m[2m✓[22m[39m initializes AMP for the session [33m 301[2mms[22m[39m
     [33m[2m✓[22m[39m accepts valid session names with hyphens and underscores [33m 301[2mms[22m[39m
[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mhibernateAgent[2m > [22m[2munpersists session after hibernate
[22m[39m[Hibernate] Agent my-agent (agent-1) session 0 hibernated successfully

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mhibernateAgent[2m > [22m[2mattempts graceful shutdown before kill
[22m[39m[Hibernate] Agent my-agent (agent-1) session 0 hibernated successfully

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2minitializeStartup[2m > [22m[2minitializes all agents
[22m[39m[Startup] Initializing all agents...

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2minitializeStartup[2m > [22m[2minitializes all agents
[22m[39m[Startup] Complete: 2 agents initialized

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2minitializeStartup[2m > [22m[2mreports partial failures
[22m[39m[Startup] Initializing all agents...

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2minitializeStartup[2m > [22m[2mreports partial failures
[22m[39m[Startup] Complete: 1 agents initialized

[90mstdout[2m | tests/services/agents-core-service.test.ts[2m > [22m[2minitializeStartup[2m > [22m[2mreturns 500 on unexpected error
[22m[39m[Startup] Initializing all agents...

[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2minitializeStartup[2m > [22m[2mreturns 500 on unexpected error
[22m[39m[Startup] Error: Error: init failed
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:990:60
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37
    at Traces.$ [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/traces.CCmnQaNT.js:142:27[90m)[39m
    at trace [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4mvitest[24m/dist/chunks/test.B8ej_ZHS.js:239:21[90m)[39m
    at runTest [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:12[90m)[39m

[90mstderr[2m | tests/services/agents-core-service.test.ts[2m > [22m[2mgetStartupInfo[2m > [22m[2mreturns 500 on error
[22m[39m[Startup] Error: Error: fail
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:1013:72
    at Mock [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/spy[24m/dist/index.js:285:34[90m)[39m
    at Module.getStartupInfo [90m(/Users/emanuelesabetta/ai-maestro/[39mservices/agents-core-service.ts:1591:20[90m)[39m
    at [90m/Users/emanuelesabetta/ai-maestro/[39mtests/services/agents-core-service.test.ts:1015:20
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:145:11
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:915:26
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1243:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1209:10[90m)[39m
    at [90mfile:///Users/emanuelesabetta/ai-maestro/[39mnode_modules/[4m@vitest/runner[24m/dist/index.js:1653:37

 [32m✓[39m tests/services/agents-core-service.test.ts [2m([22m[2m75 tests[22m[2m)[22m[33m 4537[2mms[22m[39m
     [33m[2m✓[22m[39m hibernates an active agent [33m 1503[2mms[22m[39m
     [33m[2m✓[22m[39m unpersists session after hibernate [33m 1502[2mms[22m[39m
     [33m[2m✓[22m[39m attempts graceful shutdown before kill [33m 1502[2mms[22m[39m

[2m Test Files [22m [1m[32m30 passed[39m[22m[90m (30)[39m
[2m      Tests [22m [1m[32m869 passed[39m[22m[90m (869)[39m
[2m   Start at [22m 05:38:45
[2m   Duration [22m 5.04s[2m (transform 2.90s, setup 0ms, import 4.12s, tests 7.39s, environment 5ms)[22m

Done in 5.63s.
