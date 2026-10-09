# B014 - Logs and files that grow without limit across the AI Maestro ecosystem

**Status:** In Progress (shipped: AI Maestro 0.61.0, plugin 1.5.0 / claude-plugin 0.3.0, aimaestro-gateways 0.1.1, lolabot 1.0.2; upstream agent-browser PR #2080. Open: agent.db retention (19 GB), gateway retry path verified only by tests, email-bridge / slack-watcher / cloudflare-tunnel not audited)
**Type:** Bug (epic, one fix per repo)
**Created:** 2026-10-08
**Requested by:** Juan, 2026-10-08 ("evaluate the logs problem in all the repos of the AI Maestro ecosystem")
**Method:** four read-only audits (code read, plus the live logs on this Mac and mini-lola). Each finding says whether it was verified by reading or inferred. Follow-up to B013 (rotation, 0.60.5-0.60.7) and B009.

**Ownership (checked on GitHub, 2026-10-08):** ours are ai-maestro, ai-maestro-plugins, aimaestro-gateways, lolabot, lolabot-factory and the agentmessaging repos. `agent-browser` (fork of vercel-labs/agent-browser), `gstack` (fork of garrytan/gstack) and `agents-cli` (fork of google/agents-cli) are third-party tools we use; their code is not ours to fix here. For those, this item lists only what we do around them, and what could be reported upstream if Juan decides to.

Rotation (B013) stops the damage; this item removes the causes. Principle for every fix: a log line that can repeat for the same cause must be logged once, then counted; every file that only grows gets a cap, a TTL or a cleanup.

## Ranked

### 1. agent-browser (third-party: vercel-labs/agent-browser, installed from npm as 0.38.1): leaks processes and temp profiles (verified by reading; matches the 25 Chrome processes found on 2026-10-08)
Not our code. The audit read our fork (`23blocks-OS/agent-browser`, identical to upstream apart from sync commits):
- `cli/src/native/cdp/chrome.rs:537-542` makes `$TMPDIR/agent-browser-chrome-<uuid>` per launch; it is removed only in `Drop for ChromeProcess`. If the daemon crashes or is SIGKILLed, nothing runs: Chrome (own process group) and the profile (50-500 MB, inferred) stay. Nothing sweeps old `agent-browser-chrome-*` dirs at startup.
- The idle timeout (default 1 h, `daemon.rs:175`) never fires for headed or attached browsers, or with `AGENT_BROWSER_IDLE_TIMEOUT_MS=0`. Screenshots and HAR files under `~/.agent-browser/tmp/` have no TTL.
What is ours to do:
- Our usage guidance: the agent-browser skill in this repo (`.agents/skills/agent-browser/SKILL.md`) should tell agents to always close their session and to set `AGENT_BROWSER_IDLE_TIMEOUT_MS=300000`.
- A small cleanup in AI Maestro or the plugin (a script or a periodic task) that removes `agent-browser-chrome-*` temp dirs and kills Chrome-for-Testing processes whose session is gone, because we cannot fix the tool.
- Optional, Juan's call: report the missing orphan sweep upstream to vercel-labs/agent-browser.

### 2. AI Maestro: disk that only grows (verified by reading and `ls`)
- `~/.aimaestro/backups/agents/`: 7.2 GB in 24 folders. `backupAgentData` (`lib/agent-registry.ts` ~762-820) copies the whole agent folder, `agent.db` included, on every permanent delete; no prune, no cap, on by default. Fix: keep the last N or N days, skip the database, or make it opt-in.
- `~/.aimaestro/agents/*/agent.db`: 19 GB, 570-700 MB each (CozoDB on SQLite, `lib/cozo-db.ts:56`). No retention, vacuum or compaction found; embedding vectors (`msg_vec`, `doc_chunk_vec`) are the likely bulk (inferred). Fix: TTL or cap per table, periodic compaction, stop re-indexing dead conversations (`lib/index-delta.ts:743` logs "no longer exist" on every sweep).
- Smaller: `chat-state/*.json` one per cwd, never pruned (370 files, 9 MB); `wake-state.json` entries for deleted agents; `logs/*.txt` terminal logs (off by default, no rotation if enabled); old one-off backup folders in `~/.aimaestro/`.

### 3. AI Maestro: the log volume itself (verified from the live log: 38 MB in 21 h, 505k lines)
- About 65% is the CozoDB init block, about 100 lines (7 KB) per open, 3,326 opens in 21 h. Cause: a short-lived `AgentDatabase` per request (`services/agents-memory-service.ts:792`, `lib/agent-db-sync.ts:65`, `lib/agent.ts:895`) re-runs the schema check for about 45 tables each time. This is also wasted work, not only noise. Bug inside it: `lib/cozo-db.ts:55-64` logs an unawaited Promise, which dumps about 45 lines of Next.js internals. Fix: reuse the open database per agent, skip schema init after the first time, make "already exists" debug-only, await or drop the Promise log. Candidates: `lib/cozo-schema-rag.ts:19-795`.
- `[Agents] Found N local tmux session(s)` (`services/sessions-service.ts:521,571`, `agents-core-service.ts:749`) on every `/api/sessions`, about every 10 s per open tab. Fix: log only when the count changes.
- `[Embeddings] Loading… N%` (`lib/rag/embeddings.ts:54`) logs every progress tick. Fix: throttle to every 10%.
- `pm2-error.log`: about 85% is one malformed message repeated on every poll (`lib/messageQueue.ts:199`). Fix: quarantine the file and log once. `[Memory Service] initializeMemory Error: fetch failed` logs a 20-line stack 134 times (`agents-memory-service.ts:469`): log the message only.
- The hook debug log is capped now but still always on (`ai-maestro-hook.cjs`, `debugLog` called at least twice per event); gate it behind `AIM_HOOK_DEBUG=1`.
- Not audited: `channels/amp-plugin`, headless-only code paths, `lib/transcript-export.ts`, the inbox sweeper, scheduler and cerebellum tick loops line by line.

### 4. aimaestro-gateways (23blocks-OS/aimaestro-gateways): the 13 GB came from here
- What happened (live evidence on mini-lola): an older gateway version re-scanned the same outbound files every 3 s and logged "[OUTBOUND] No Slack context in msg_….json, skipping" for each one every time. The deployed version (`2d2e30b`, same as the repo head) already parks such files (`park()`, `slack-gateway/src/outbound.ts:141`), and the log now shows "Undeliverable … parked" 43 times.
- Still open (verified by reading, not run): the retry branch (`outbound.ts:181` and `:255`, poll every 3 s, no backoff) keeps a failing file forever and logs the whole Slack error object (2-20 KB, stack plus response body) each time. A permanent Slack error (`channel_not_found`, `not_in_channel`, `invalid_blocks`, `is_archived`) loops forever: about 140 MB a day. Fix: per-file attempt count and error signature, exponential backoff, a maximum, then `park()`; log `error.message` and `error.data?.error` on one line; log a repeated error once, then every 5 minutes with a count.
- Email gateway: an unparseable outbound file is logged every 30 s forever and never moved (`email-gateway/src/outbound.ts:216-219`; move it to `undeliverable/`); every HTTP request is logged, including `/health` and internet scans through the tunnel (`server.ts:283-286`), 6-9 lines per email (`:383-408`), full error objects (`:398`, `:424`). Fix: method, path and status only; skip `/health`; `err.message`.
- Slack websocket "pong wasn't received" warnings (about 2,900 in the error log) and DNS-failure retries (303): rate-limit.
- Neither `ecosystem.config.cjs` sets any log option. Not audited, because they are not in this repo: email-bridge, slack-watcher, cloudflare-tunnel (they live under `~/23smartagents` on mini-lola).

### 5. Plugin and protocol repos (agentmessaging/claude-plugin via ai-maestro-plugins; verified by reading)
- No retention for messages: every message is a file in `~/.agent-messaging/agents/<id>/messages/{inbox,sent}` forever (`amp-helper.sh:1257-1258`, `:1295`; only manual `amp-delete.sh` removes). Attachments are copied on send (`amp-send.sh:362-364`) and again on receive (`amp-download.sh:181-183`) and never cleaned: this one can fill a disk. Fix: `amp-prune.sh` or an opportunistic prune: delete read messages and attachments older than N days (default 30-90), cap `attachments/`.
- `amp-statusline.sh:226-231` runs `find` plus one `jq` per inbox file on every refresh (at least once a minute per session): cost grows with the inbox. Fix: one `jq -s` or an unread counter file; cache the `/api/agents` lookup.
- `memory-recalls.jsonl` appended per prompt, no cap (`ai-maestro-hook.cjs:722`): reuse `rotateDebugLog` at 5 MB.
- Per-cwd state files in `chat-state/` are never garbage-collected: delete files older than 30 days on SessionStart.
- Temp files without a trap on error: `export-agent.sh:73-74`, `amp-register.sh:386`, `agent-helper.sh:137,332,370,413`.
- Fine: backups (5 per file), the replay database (pruned at 24 h), `agent-files` and `agent-identity` (no log writers). `reference-server` and `sdk-typescript` are only a README.

### 6. Smaller, in our own repos (verified by reading)
- lolabot: `tools/memory-integrity-check.sh:16,75` appends to `/tmp/integrity-alerts.log` with `tee -a` (only on a mismatch); `email_client.py:296` one JSON per email, no TTL; `heic-convert.sh` never cleans `/tmp/heic-converted`.
- lolabot-factory: nothing relevant to the hosts. lolabot and lolabot-factory do not write anything that could have produced 13 GB or 3.4 GB.

### 7. Third-party tools we run (not ours; noted so nobody is surprised)
- gstack (garrytan/gstack) `browse/src/server.ts`: console and network logs appended every second with no size cap, deleted only at shutdown; idle exit is off in headed and tunnel modes, so they can reach GBs. `browse-audit.jsonl` and `~/.gstack/security/attempts.jsonl` have no rotation.
- agents-cli (google/agents-cli) `run/_local_server.py:366-413`: `.adk/run_server.log` appended on every start, no rotation.
- If we use either on a host, watch their folders; nothing for us to patch.

## Suggested order
1. agent-browser: not ours. Update our skill guidance (close the session, short idle timeout) and add a small cleanup of leftover Chrome processes and temp profiles on our side.
2. AI Maestro: backup retention, database reuse and the log-line fixes (one release; big win, mostly small edits).
3. Gateways: retry cap and backoff, email gateway fixes, pm2 log options in both ecosystem files.
4. Plugin: message and attachment retention, statusline, chat-state GC.
5. Smaller repos.

Each of our repos gets its own PR; AI Maestro and plugin changes follow the normal release chain.
