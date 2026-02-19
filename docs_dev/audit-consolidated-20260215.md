# Consolidated PR Audit Report — 2026-02-15

## PRs Audited

| PR | Branch | Issue | Verdict | Critical? |
|---|---|---|---|---|
| #206 | fix/aim-222-all-fixes | AIM-222 (36 files) | APPROVED (minor cosmetic) | No |
| #213 | fix/issue-207-amp-labels | #207 AMP labels | APPROVED | No |
| #214 | fix/issue-208-amp-signature | #208 AMP signature | APPROVED (merge conflict risk) | YES |
| #215 | fix/issue-210-chat-quoting | #210 chat quoting | STALE DIFF — needs rework | YES |
| #216 | fix/issue-211-install-unquoted | #211 install quoting | PARTIAL — more unquoted vars | No |
| #217 | fix/issue-212-update-y-flag | #212 update -y flag | APPROVED (cosmetic fix) | No |

---

## Critical Issue 1: PR #215 has a stale diff

**Problem:** PR #215 was branched from commit `d5ca179` (pre-PR#206). PR #206 already fixed the POST handler at line 315 of `app/api/agents/[id]/chat/route.ts` with atomic tmux sends. The only meaningful fix in PR #215 is the GET handler at line 174, which STILL has single quotes:

```
tmux capture-pane -t '${sessionName}' -p -S -40 2>/dev/null || echo ""
```

The POST handler changes in PR #215 are **redundant** with PR #206.

**Options:**
- A) Close PR #215, fold the line 174 fix into PR #206
- B) Rebase PR #215 onto PR #206's branch, removing redundant POST changes

**Additional unquoted tmux targets found elsewhere:**
- `server.mjs:840` — `tmux capture-pane -t ${sessionName}`
- `agent-container/agent-server.js:107,119,147,177` — multiple unquoted targets

---

## Critical Issue 2: PR #213 + PR #214 merge conflict

**Problem:** Both PRs modify `convertAMPToMessage()` in `lib/messageQueue.ts` starting from the same base commit `d5ca179`.

- PR #213 adds label resolution (fromLabel/toLabel via registry lookup)
- PR #214 adds amp field with signature/publicKey data

These changes touch adjacent/overlapping lines in the same function and **will** conflict when both are merged.

**Options:**
- A) Merge one first, then rebase the other onto the result
- B) Combine both into a single PR
- C) Document the merge order and resolve conflicts during merge

---

## PR-by-PR Findings

### PR #206 — APPROVED (minor cosmetic)

- All 36 changed files verified correct
- Soft-delete architecture consistent across 15+ lookup functions
- Tmux atomic sends uniform across 4 files
- Tests properly updated for soft-delete behavior

**Warnings:**
1. Box character misalignment in `update-aimaestro.sh:324` — 65 chars content vs 64 chars border
2. Circular import between `agent-registry.ts` and `messageQueue.ts` (safe at runtime, architectural smell)
3. Cmd+C comment at `hooks/useTerminal.ts:247` slightly misleading

### PR #213 — APPROVED

- Fix correctly resolves labels from agent registry with proper fallback to name
- `getAgentByName` and `getAgentByAlias` imports already exist at line 6
- `Message` type already has `fromLabel`/`toLabel` fields (lines 27, 33)
- UI components use `(msg as any).fromLabel` with fallback chain

### PR #214 — APPROVED (merge conflict risk with #213)

- `writeToAMPInbox` correctly stores `sender_public_key` at top level and `envelope.signature` inside envelope
- `writeToAMPSent` does NOT store `sender_public_key` (correct — sender knows their own key)
- No tests for `convertAMPToMessage` (pre-existing gap, not introduced by this PR)

### PR #215 — STALE DIFF (see Critical Issue 1)

- POST handler fix at line 315 is redundant with PR #206
- GET handler at line 174 still has single quotes (THE actual fix needed)
- Needs rework or folding into PR #206

### PR #216 — PARTIAL

- Both targeted fixes verified correct (lines 293 and 997, shifted from issue's 284 and 982)
- Additional unquoted `$INSTALL_DIR` occurrences at lines 1022, 1024, 1039
- `case $choice in` at line 825 also unquoted
- Additional unquoted `$NODE_VERSION` at line 293

### PR #217 — APPROVED (cosmetic)

- `-y` flag added correctly to line 262 for consistency
- All other 5 installer calls (lines 225, 234, 241, 248, 255) already pass `-y`
- `install-hooks.sh` has **zero argument parsing** and **zero interactive prompts**
- The `-y` flag is silently ignored — fix is cosmetic/future-proofing
- Change is harmless and consistent

---

## Recommended Actions

1. **PR #215**: Close it. Fold the line 174 GET handler fix into PR #206. Also fix `server.mjs:840` and `agent-container/agent-server.js` unquoted targets.
2. **PR #213 + #214**: Merge #213 first, then rebase #214 onto the result (simpler conflict resolution since #214 adds new fields rather than modifying existing ones).
3. **PR #206**: Optionally fix the box misalignment in `update-aimaestro.sh:324`.
4. **PR #216**: Consider adding fixes for the additional unquoted variables found.
5. **PR #217**: Merge as-is (harmless consistency fix).
