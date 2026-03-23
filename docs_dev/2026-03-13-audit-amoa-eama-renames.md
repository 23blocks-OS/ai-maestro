# Audit: Incorrect Prefix Renames in ai-maestro-orchestrator-agent

**Audit Date:** 2026-03-13  
**Repository:** Emasoft/ai-maestro-orchestrator-agent  
**Objective:** Find incorrect renames where AM* prefixes were changed to E* prefixes

## Summary

**FOUND: 5 Incorrect Renames**

Incorrect prefixes should be:
- ❌ `eoa` → ✅ `amoa` (AI Maestro Orchestration Agent)
- ❌ `ecos` → ✅ `amcos` (AI Maestro Chief of Staff)

The orchestrator agent repo has some code that uses the wrong prefixes from the Emasoft ecosystem instead of the AI Maestro ecosystem.

---

## Detailed Findings

### 1. **agents/amoa-experimenter.md** (Line 54)

**Incorrect Prefix:** `eoa`

```
File: ./agents/amoa-experimenter.md
Line: 54
Content: subagent_type="eoa:experimenter",
```

**Issue:** Should be `amoa:experimenter` not `eoa:experimenter`

**Fix:** Change `eoa:experimenter` → `amoa:experimenter`

---

### 2. **skills/amoa-agent-replacement/references/amcos-notification-handling.md** (Line 289)

**Incorrect Prefix:** `ecos`

```
File: ./skills/amoa-agent-replacement/references/amcos-notification-handling.md
Line: 289
Content: ecos_notifications:
```

**Issue:** Variable name uses `ecos_` prefix instead of `amcos_`

**Fix:** Change `ecos_notifications` → `amcos_notifications`

---

### 3. **skills/amoa-agent-replacement/references/confirmation-protocol.md** (Lines 305, 337)

**Incorrect Prefix:** `ecos`

```
File: ./skills/amoa-agent-replacement/references/confirmation-protocol.md
Line: 305
Content:   ecos_notification:

Line: 337
Content:   ecos_confirmation:
```

**Issue:** Variable names use `ecos_` prefix instead of `amcos_`

**Fix:** 
- Change `ecos_notification` → `amcos_notification`
- Change `ecos_confirmation` → `amcos_confirmation`

---

### 4. **skills/amoa-agent-replacement/references/op-receive-ecos-notification.md** (Lines 43, 58, 73, 135)

**Incorrect Prefix:** `ecos` (file name and content)

```
File: ./skills/amoa-agent-replacement/references/op-receive-ecos-notification.md
Line: 43
Content:   "from": "ecos",

Line: 58
Content: Use the `agent-messaging` skill to check your inbox for unread messages, then filter for messages from AMCOS (where `from` equals `ecos`).

Line: 73
Content: - **Recipient**: `ecos`

Line: 135
Content:   # - Recipient: ecos
```

**Issue:** 
- File name itself uses `ecos` instead of `amcos`
- Content references `ecos` as a message recipient identifier

**Fix:**
- Rename file: `op-receive-ecos-notification.md` → `op-receive-amcos-notification.md`
- Change all `ecos` → `amcos` in file content

---

### 5. **skills/amoa-agent-replacement/references/op-confirm-reassignment.md** (Lines 113, 226)

**Incorrect Prefix:** `ecos`

```
File: ./skills/amoa-agent-replacement/references/op-confirm-reassignment.md
Line: 113
Content: - **Recipient**: `ecos`

Line: 226
Content:   # - Recipient: ecos
```

**Issue:** Message recipient identifier uses `ecos` instead of `amcos`

**Fix:** Change `ecos` → `amcos` (2 occurrences)

---

## Semantic Impact

These aren't just naming issues — they affect message routing in the agent communication system:

1. **Agent Type System**: `eoa:experimenter` would be misidentified as an Emasoft agent instead of an AI Maestro agent
2. **Message Routing**: Messages with `"from": "ecos"` would fail to route to the correct AMCOS recipient
3. **API Recipient Validation**: Code checking for `ecos` recipients would reject legitimate AMCOS messages

## Correction Priority

**URGENT** — These affect runtime behavior:
1. Fix file names first (op-receive-ecos-notification.md)
2. Update all variable and constant names
3. Update message routing logic references
4. Run message protocol tests to verify delivery works

## Files Affected

| Count | File | Issue |
|-------|------|-------|
| 1 | agents/amoa-experimenter.md | Agent type prefix |
| 1 | skills/amoa-agent-replacement/references/amcos-notification-handling.md | Variable name |
| 2 | skills/amoa-agent-replacement/references/confirmation-protocol.md | Variable names |
| 4 | skills/amoa-agent-replacement/references/op-receive-ecos-notification.md | File name + recipient IDs |
| 2 | skills/amoa-agent-replacement/references/op-confirm-reassignment.md | Recipient IDs |

**Total Issues Found:** 5 locations with 10+ total references

---

## Verification Steps

After fixes applied:
1. Search repo for any remaining `ecos` (outside of documentation)
2. Search for `eoa:` (should only see `amoa:`)
3. Run message routing tests to verify `amcos` recipients work
4. Verify agent type system recognizes `amoa:experimenter`
