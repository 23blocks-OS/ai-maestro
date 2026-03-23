# Implementation Report: lib/governance-peers.ts
Generated: 2026-02-20T23:37Z

## Task
Created `/Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts` - a file-based cache of governance state from peer hosts in the AMP mesh network.

## Functions Implemented
- `ensurePeersDir()` - ensures `~/.aimaestro/governance-peers/` directory exists
- `loadPeerGovernance(hostId)` - read peer state from `{hostId}.json`, null on missing/corrupt
- `savePeerGovernance(hostId, state)` - write peer state to `{hostId}.json`
- `deletePeerGovernance(hostId)` - remove peer state file
- `getAllPeerGovernance()` - read all peer states, filter expired by TTL (default 300s)
- `isManagerOnAnyHost(agentId)` - check MANAGER role locally + all peers
- `isChiefOfStaffOnAnyHost(agentId)` - check COS role locally + all peers
- `getTeamFromAnyHost(teamId)` - find team by ID across local + peers, returns PeerTeamSummary + hostId
- `getPeerTeamsForAgent(agentId)` - get all peer teams containing an agent

## Design Decisions
- Synchronous FS ops (readFileSync/writeFileSync) to match lib/governance.ts patterns
- JSON.parse wrapped in try/catch, returns null on corrupt files
- TTL expiry: `Date.now() - Date.parse(state.lastSyncAt) > state.ttl * 1000`
- Local teams converted to PeerTeamSummary shape in getTeamFromAnyHost for uniform return type
- getPeerTeamsForAgent only returns peer teams (not local) to avoid duplication with loadTeams()

## Verification
- `npx tsc --noEmit` passes with zero errors for this file
