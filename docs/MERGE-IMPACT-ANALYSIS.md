# Merge Impact Analysis: refactor/agents → main

**Branch:** `refactor/agents`
**Target:** `main`
**Date:** 2025-01-11
**Version Change:** main (0.5.0) → refactor/agents (0.7.0)

## Executive Summary

**⚠️ BREAKING CHANGES: YES** - This merge introduces a major architectural shift from session-centric to agent-centric design.

**Risk Level:** 🟡 **MEDIUM** - Existing users will need data migration, but the migration is automatic.

**Recommendation:** ✅ **SAFE TO MERGE** with proper communication to users about the upgrade.

---

## Breaking Changes

### 1. **Architecture Shift: Sessions → Agents**

**Before (main):**
- Sessions are first-class citizens
- No agent concept
- Messages stored per session: `~/.aimaestro/messages/{sessionName}/`

**After (refactor/agents):**
- Agents are first-class citizens
- Sessions are tools owned by agents
- Messages stored per agent: `~/.aimaestro/agents/{agentId}/messages/`
- Sessions get optional `agentId` field

**Impact:**
- ✅ **Backward compatible for sessions** - Sessions without agents still work
- ✅ **Automatic message migration** - Built-in migration endpoint creates agents from sessions
- ⚠️ **New directory structure** - `~/.aimaestro/agents/` created on first run

---

### 2. **New Required Agent Field: `deployment`**

**Change:**
```typescript
// New required field in Agent interface
deployment: {
  type: 'local' | 'cloud'
  local?: { hostname: string, platform: string }
  cloud?: { provider, region, instanceId, ... }
}
```

**Impact:**
- ✅ **Auto-initialized** - New agents automatically get deployment field
- ✅ **Migration script exists** - We already ran it for existing agents
- ⚠️ **Users need to run migration** - First-time users on refactor/agents already have it, but clean installs need setup

---

### 3. **New API Endpoints**

**Added:**
- `/api/agents` - List all agents
- `/api/agents/[id]` - Get/update agent
- `/api/agents/[id]/messages` - Agent messages
- `/api/agents/[id]/messages/[messageId]` - Individual message
- `/api/agents/[id]/metadata` - Custom metadata
- `/api/agents/[id]/metrics` - Performance metrics
- `/api/agents/migrate` - Migration endpoint

**Impact:**
- ✅ **No breaking changes to existing endpoints** - All session endpoints still work
- ✅ **Additive only** - New endpoints don't affect old functionality

---

### 4. **Session Type Changes**

**Added field:**
```typescript
export interface Session {
  // ... existing fields
  agentId?: string  // NEW - optional for backward compatibility
}
```

**Impact:**
- ✅ **Optional field** - Existing sessions without agentId work fine
- ✅ **No data loss** - Sessions.json structure unchanged except for new optional field

---

## Data Migration Requirements

### What Happens on Upgrade?

1. **First Launch After Merge:**
   - App creates `~/.aimaestro/agents/` directory
   - No agents exist yet
   - Sessions work exactly as before

2. **User Can Manually Migrate (Optional):**
   - Click "Migrate Messages" in UI (or call `/api/agents/migrate`)
   - Creates agents from existing sessions
   - Links sessions to agents
   - Copies messages to agent directories

3. **User Can Create New Agents:**
   - Click "Create Agent" button
   - Choose Local/Cloud deployment
   - Agent automatically linked to new session

### What If User Does Nothing?

- ✅ **Everything still works** - Sessions function as before
- ✅ **No errors or crashes** - Agent features gracefully hidden if no agents exist
- ⚠️ **Missing features** - No agent profile, no deployment tracking, no message center

---

## File System Changes

### New Directories Created

```
~/.aimaestro/
├── agents/                    # NEW
│   ├── registry.json         # NEW - agent metadata
│   └── {agentId}/            # NEW - per-agent storage
│       └── messages/         # NEW - agent messages
│           ├── inbox/
│           └── sent/
├── messages/                  # EXISTING - still used for non-agent sessions
│   └── {sessionName}/
└── sessions.json              # EXISTING - unchanged
```

### Storage Migration

**Old (main):**
```
~/.aimaestro/messages/23blocks-apps-prompthub/inbox/msg-001.json
```

**New (refactor/agents):**
```
~/.aimaestro/agents/uuid-1234/messages/inbox/msg-001.json
```

**Impact:**
- ✅ **Migration copies files** - Original messages preserved
- ✅ **No data loss** - Both old and new messages coexist
- ⚠️ **Disk usage** - Temporarily doubled for migrated messages (can clean up old manually)

---

## User Experience Impact

### Existing Users (Upgrading from main → refactor/agents)

**On First Launch:**
1. See all existing sessions in sidebar (unchanged)
2. Notice new "Profile" tab doesn't appear (no agents yet)
3. Can continue working normally OR migrate to agents

**If They Choose to Migrate:**
1. Click any migrate button/endpoint
2. Wait ~5 seconds for migration
3. Refresh page
4. See agent profile tabs
5. See deployment icons
6. See messages in agent-based storage

**If They Choose Not to Migrate:**
1. Everything works as before
2. No agent features visible
3. Can migrate later anytime

### New Users (Clean Install)

**On First Launch:**
1. No sessions, no agents
2. Click "Create Agent"
3. Choose Local/Cloud
4. Agent created with deployment tracking
5. Full feature set available immediately

---

## Risk Assessment

### 🟢 Low Risk Items

✅ **Session functionality** - All session APIs unchanged
✅ **Terminal streaming** - WebSocket logic unchanged
✅ **UI compatibility** - Main dashboard works with or without agents
✅ **Type safety** - All TypeScript properly typed
✅ **Build process** - Clean build with no warnings

### 🟡 Medium Risk Items

⚠️ **Message storage migration** - Users must manually trigger migration
⚠️ **Agent registry creation** - New JSON file in ~/.aimaestro
⚠️ **Deployment field requirement** - All agents must have deployment info
⚠️ **Directory structure** - New folders created automatically

### 🔴 High Risk Items

❌ **None identified** - No critical breaking changes

---

## Recommended Merge Strategy

### Option 1: Direct Merge (Recommended)

**Pros:**
- Simple and clean
- All users get upgrade at once
- Migration is optional and non-destructive

**Cons:**
- Requires clear communication about migration
- Some users may not discover agent features

**Steps:**
1. Merge refactor/agents → main
2. Update README.md with migration instructions
3. Add migration banner in UI (optional)
4. Tag as v0.7.0

### Option 2: Feature Flag (Over-engineered)

**Pros:**
- Users can opt-in to agent features
- Gradual rollout possible

**Cons:**
- More complex code
- Unnecessary given backward compatibility
- Slows down development

**Verdict:** ❌ Not recommended - backward compatibility already exists

### Option 3: Separate Branch (Not Recommended)

**Pros:**
- Keep main "stable"

**Cons:**
- Fragments user base
- Delays valuable features
- Creates maintenance burden

**Verdict:** ❌ Not recommended - refactor/agents is stable

---

## Migration Checklist

### Before Merge

- [x] All tests passing
- [x] Build succeeds with no warnings
- [x] TypeScript types complete
- [x] Migration endpoint tested
- [x] Deployment field added to all agents
- [x] Documentation updated

### During Merge

- [ ] Create PR from refactor/agents → main
- [ ] Review all diffs
- [ ] Test migration on clean install
- [ ] Test migration on existing data
- [ ] Update CHANGELOG.md
- [ ] Tag as v0.7.0

### After Merge

- [ ] Update README.md with migration guide
- [ ] Create GitHub release notes
- [ ] Announce on X (Twitter) - per CLAUDE.md policy
- [ ] Monitor for user issues
- [ ] Update documentation site

---

## User Communication Plan

### README.md Update

Add new section:

```markdown
## Upgrading to v0.7.0 (Agent-Centric Architecture)

AI Maestro v0.7.0 introduces agents as first-class citizens!

### What's New?
- 🤖 Agent profiles with metadata, metrics, and documentation
- 🚀 Deployment tracking (local vs cloud)
- 📊 Performance metrics and cost tracking
- 💬 Agent-based message storage

### Do I Need to Migrate?
**No, but it's recommended.** Your existing sessions will continue to work,
but you'll unlock new features by migrating to agents.

### How to Migrate
1. Launch AI Maestro v0.7.0
2. Go to any session
3. Click "Migrate to Agents" button (appears once)
4. Wait ~5 seconds for migration to complete
5. Refresh the page

Your sessions will now be linked to agents with full metadata support!
```

### X (Twitter) Post

```
🚀 AI Maestro v0.7.0 is here!

Major update: Agent-centric architecture 🤖

✨ New features:
• Agent profiles with metadata & metrics
• Deployment tracking (local/cloud)
• Performance & cost tracking
• Enhanced message system

Upgrade is backward compatible - existing sessions work as-is!

#AIcoding #DevTools
```

---

## Migration Instructions for Users

### Automatic Migration Script

Users can run this in the AI Maestro terminal:

```bash
curl http://localhost:3000/api/agents/migrate -X POST
```

Or via the built-in UI (if we add a migration prompt).

### Manual Verification

After migration, users can verify:

```bash
# Check agents were created
ls ~/.aimaestro/agents/

# Check registry
cat ~/.aimaestro/agents/registry.json | jq length

# Check messages migrated
ls ~/.aimaestro/agents/*/messages/inbox/
```

---

## Rollback Plan

If critical issues are discovered after merge:

### Option 1: Revert Merge
```bash
git revert -m 1 <merge-commit-sha>
git push
```

### Option 2: Hotfix Branch
```bash
git checkout -b hotfix/v0.7.1 main
# Fix issues
git commit -m "fix: critical issue"
git push
```

### Option 3: User Can Manually Revert
Users can delete agent data without affecting sessions:
```bash
rm -rf ~/.aimaestro/agents/
# Sessions still work, agent features disabled
```

---

## Conclusion

**✅ SAFE TO MERGE** with the following conditions:

1. **Update README.md** with migration instructions
2. **Announce on X** per CLAUDE.md PR policy
3. **Tag as v0.7.0** for clear version tracking
4. **Monitor first 24 hours** for user issues

The refactor/agents branch is well-architected, backward compatible, and provides significant value. The migration is non-destructive and optional, giving users control over when to upgrade their data model.

**Recommended Action:** Create PR and merge to main this week.
