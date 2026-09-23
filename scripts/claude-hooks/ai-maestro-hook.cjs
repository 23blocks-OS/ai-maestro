#!/usr/bin/env node
/**
 * AI Maestro Agent Hook
 *
 * Universal hook for AI coding agents (Claude Code, Codex CLI, Gemini CLI).
 * Captures agent events, writes state for the Chat interface, and injects
 * AMP inbox notifications via each agent's native context injection.
 *
 * Supported agents and their event mappings:
 *   Claude Code: Stop, Notification(idle_prompt), SessionStart
 *   Codex CLI:   Stop, SessionStart
 *   Gemini CLI:  AfterAgent, Notification, SessionStart
 *
 * State is written to: ~/.aimaestro/chat-state/<cwd-hash>.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Claude Code's native session id for this invocation (from the hook payload).
// Single-shot process, so a module-level value set once in main() is sufficient.
let currentSessionId = null;

// Read stdin as JSON
async function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => { data += chunk; });
        process.stdin.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch (e) {
                resolve({ raw: data });
            }
        });
        process.stdin.on('error', reject);

        // Timeout after 5 seconds
        setTimeout(() => resolve({ timeout: true }), 5000);
    });
}

// Hash the working directory to create a unique state file
function hashCwd(cwd) {
    return crypto.createHash('md5').update(cwd || '').digest('hex').substring(0, 16);
}

// ── Hook time budget ─────────────────────────────────────────────────────────
// Claude Code kills a hook after 5s and DISCARDS its output ("UserPromptSubmit
// hook timed out after 5s"). The injection path fetches the local API on every
// user turn, and those fetches were unbounded — a slow or busy server (a build,
// a restart, load) hung the hook past 5s and the message injection was thrown
// away. Measured on a customer host.
//
// A discarded injection is only a DELAY — the Stop path and the 5-minute poll
// both re-deliver — so it is always better to return early than to hang. Every
// injection fetch now has a per-request timeout, and the whole injection step
// has an overall deadline well under 5s.
const HOOK_FETCH_TIMEOUT_MS = 1500;
const INJECT_DEADLINE_MS = 3500;
function withDeadline(promise, ms, fallback) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
}

// The agent list, fetched at most once per hook run: the inbox check and
// memory recall both need it and run in parallel. Resolves null on a non-OK
// response; rejects on a network error so callers keep their own fallbacks.
let agentsPromise = null;
function fetchAgentsOnce() {
    if (!agentsPromise) {
        agentsPromise = fetch('http://localhost:23000/api/agents', { signal: AbortSignal.timeout(HOOK_FETCH_TIMEOUT_MS) })
            .then(res => (res.ok ? res.json().then(d => d.agents || []) : null));
    }
    return agentsPromise;
}

// Resolve the agent for this hook invocation.
// Priority: AIM_AGENT_ID env (exact) > AIM_AGENT_NAME / CLAUDE_AGENT_NAME env
// (exact) > cwd exact match.
function resolveAgent(cwd, agents) {
    const envId = process.env.AIM_AGENT_ID;
    if (envId) {
        const byId = agents.find(a => a.id === envId);
        if (byId) {
            debugLog({ event: 'resolved_agent_from_env', source: 'id', value: envId });
            return byId;
        }
    }
    // AIM_AGENT_NAME is what AI Maestro's launcher sets. CLAUDE_AGENT_NAME is
    // what the AMP tooling reads and what the documented detached-session hint
    // in .claude/settings.local.json actually writes — so accept both.
    //
    // Two names for one concept is how a detached session ends up with no
    // identity at all: the hint file said CLAUDE_AGENT_NAME=ai-maestro, this
    // function only looked for AIM_AGENT_NAME, fell through to the cwd match,
    // found three agents sharing that directory, and correctly refused to
    // guess. The result was an agent that received messages and was never once
    // told about them, because the ONE delivery route that does not need a tmux
    // pane could not work out who it was talking to.
    const envName = process.env.AIM_AGENT_NAME || process.env.CLAUDE_AGENT_NAME;
    if (envName) {
        const byName = agents.find(a => a.name === envName);
        if (byName) {
            debugLog({ event: 'resolved_agent_from_env', source: 'name', value: envName });
            return byName;
        }
    }
    // cwd match — but ONLY when it uniquely identifies one agent. Many agents can
    // share a working directory (a dev dir, /private/tmp, or $HOME), so returning the
    // FIRST match silently misattributes a session to the wrong agent — e.g. every
    // detached session started from $HOME becoming "piano-instructor", or a session
    // in the dev dir picking a random one of the agents that live there. When the cwd
    // is ambiguous we refuse to guess and return null: the session shows no identity
    // rather than a wrong one. To identify such a session, launch it with AIM_AGENT_ID
    // or AIM_AGENT_NAME (AI Maestro's launcher sets these; manual sessions don't).
    const cwdMatches = agents.filter(a => {
        const agentWd = a.workingDirectory || a.session?.workingDirectory;
        return agentWd && agentWd === cwd;
    });
    if (cwdMatches.length === 1) return cwdMatches[0];
    if (cwdMatches.length > 1) {
        debugLog({ event: 'ambiguous_cwd_no_guess', cwd, count: cwdMatches.length });
    }
    return null;
}

// Broadcast status update via WebSocket (non-blocking)
async function broadcastStatusUpdate(cwd, state) {
    try {
        // Find the session name for this working directory
        const agentsResponse = await fetch('http://localhost:23000/api/agents');
        if (!agentsResponse.ok) return;

        const agentsData = await agentsResponse.json();
        const agent = resolveAgent(cwd, agentsData.agents || []);

        if (!agent) return;

        const sessionName = agent.name || agent.alias || agent.session?.tmuxSessionName;
        if (!sessionName) return;

        // Build hookState payload for events that produce meaningful state
        const hookStateData = (state.status === 'permission_request' || state.notificationType)
            ? {
                status: state.status,
                toolName: state.toolName,
                toolInput: state.toolInput,
                description: state.description,
                options: state.options,
                message: state.message,
                notificationType: state.notificationType,
              }
            : undefined;

        // Broadcast the status update
        await fetch('http://localhost:23000/api/sessions/activity/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionName,
                agentId: agent.id,
                status: state.status,
                hookStatus: state.status,
                notificationType: state.notificationType,
                ...(hookStateData && { hookState: hookStateData })
            })
        });

        // Also send heartbeat so standalone agents appear in dashboard. Include
        // Claude Code's native session id (present in the hook payload) so the
        // registry can link the agent to its transcript / support native resume.
        if (agent.id) {
            await fetch(`http://localhost:23000/api/agents/${encodeURIComponent(agent.id)}/heartbeat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: state.status, claudeSessionId: currentSessionId })
            }).catch(() => {});
        }

        debugLog({ event: 'status_broadcast', sessionName, agentId: agent.id, status: state.status });
    } catch (err) {
        debugLog({ event: 'status_broadcast_error', error: err.message });
    }
}

// Write state to file. Returns the broadcast promise so callers can await if needed.
function writeState(cwd, state) {
    const stateDir = path.join(os.homedir(), '.aimaestro', 'chat-state');
    fs.mkdirSync(stateDir, { recursive: true });

    const cwdHash = hashCwd(cwd);
    const stateFile = path.join(stateDir, `${cwdHash}.json`);

    const fullState = {
        ...state,
        cwd,
        cwdHash,
        updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(stateFile, JSON.stringify(fullState, null, 2));

    // Also write to a "by-cwd" index for easy lookup
    const indexFile = path.join(stateDir, 'index.json');
    let index = {};
    try {
        index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    } catch (e) {}
    index[cwd] = cwdHash;
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));

    // Broadcast status update via WebSocket
    return broadcastStatusUpdate(cwd, state).catch(() => {});
}

// Log to debug file
function debugLog(data) {
    const debugFile = path.join(os.homedir(), '.aimaestro', 'chat-state', 'hook-debug.log');
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${JSON.stringify(data)}\n`;
    fs.appendFileSync(debugFile, line);
}

// Detect which AI agent is calling this hook
function detectAgent(input) {
    // Gemini CLI sets GEMINI_SESSION_ID or has gemini-specific fields
    if (process.env.GEMINI_SESSION_ID || process.env.GEMINI_PROJECT_DIR) return 'gemini';
    // Codex CLI sets model field with gpt- prefix or has turn_id
    if (input.model && input.model.startsWith('gpt-')) return 'codex';
    if (input.turn_id !== undefined) return 'codex';
    // Default to Claude Code
    return 'claude';
}

// Normalize event names across agents to our internal names
function normalizeEvent(hookEvent, agent) {
    // Gemini's AfterAgent = Claude/Codex's Stop
    if (agent === 'gemini' && hookEvent === 'AfterAgent') return 'Stop';
    return hookEvent;
}

// Build the context injection response in the correct format for each agent
function buildContextResponse(agent, hookEvent, message) {
    if (!message) return {};

    switch (agent) {
        case 'codex':
            // Codex CLI uses systemMessage field
            return { systemMessage: message };
        case 'gemini':
            // Gemini CLI uses systemMessage or additionalContext
            return { systemMessage: message };
        case 'claude':
        default:
            // Claude Code uses hookSpecificOutput.additionalContext
            return {
                hookSpecificOutput: {
                    hookEventName: hookEvent,
                    additionalContext: message
                }
            };
    }
}

// Check for unread messages using AMP CLI (standalone — no AI Maestro needed)
async function checkUnreadMessagesStandalone() {
    const { execSync } = require('child_process');
    try {
        const output = execSync('amp-inbox.sh --count 2>/dev/null', {
            encoding: 'utf8',
            timeout: 3000,
            env: { ...process.env, PATH: process.env.PATH }
        }).trim();

        // amp-inbox.sh --count returns a number
        const count = parseInt(output, 10);
        if (isNaN(count) || count === 0) return null;

        return `You have ${count} unread message${count === 1 ? '' : 's'} in your AMP inbox. Check them with: amp-inbox.sh`;
    } catch (err) {
        debugLog({ event: 'standalone_inbox_check_failed', error: err.message });
        return null;
    }
}

// Check for unread messages for this agent
async function checkUnreadMessages(cwd) {
    try {
        // Find agent by working directory
        const agents = await fetchAgentsOnce();
        if (!agents) return null;
        const agent = resolveAgent(cwd, agents);

        if (!agent) {
            debugLog({ event: 'no_agent_for_cwd', cwd });
            return null;
        }

        // Check for unread messages
        const messagesResponse = await fetch(
            `http://localhost:23000/api/messages?agent=${encodeURIComponent(agent.id)}&box=inbox&status=unread`,
            { signal: AbortSignal.timeout(HOOK_FETCH_TIMEOUT_MS) }
        );
        if (!messagesResponse.ok) return null;

        const messagesData = await messagesResponse.json();
        const messages = messagesData.messages || [];

        if (messages.length === 0) return null;

        // Dedup BEFORE announcing. Without this the notice was rebuilt from the
        // live unread list on every single user turn — measured on mini-lola
        // 2026-09-19: 39 injections against 3 Stop blocks, `count=1` on every
        // one of them, 17:57 through 19:46. Same message, twenty-odd identical
        // "you have a new message" announcements.
        const announced = loadAnnounced(cwd);
        const decision = decideInboxAnnouncement({ messages, announced, now: Date.now() });
        if (!decision.notice) {
            debugLog({ event: 'inbox_announce_suppressed', agentId: agent.id, count: messages.length });
            return null;
        }
        saveAnnounced(cwd, decision.announced);
        debugLog({
            event: 'unread_messages_found',
            agentId: agent.id,
            count: messages.length,
            fresh: decision.freshIds.length,
            reminders: decision.reminderIds.length,
        });
        return decision.notice;
    } catch (err) {
        debugLog({ event: 'message_check_error', error: err.message });
        // Fall back to standalone AMP check (works without AI Maestro)
        return checkUnreadMessagesStandalone();
    }
}

// Drain the meeting inject queue for this session
async function drainMeetingInjectQueue(cwd) {
    try {
        // Resolve agent to get session name
        const agentsResponse = await fetch('http://localhost:23000/api/agents', { signal: AbortSignal.timeout(HOOK_FETCH_TIMEOUT_MS) });
        if (!agentsResponse.ok) return null;

        const agentsData = await agentsResponse.json();
        const agent = resolveAgent(cwd, agentsData.agents || []);
        if (!agent) return null;

        const sessionName = agent.name || agent.alias || agent.session?.tmuxSessionName;
        if (!sessionName) return null;

        const queueResponse = await fetch(
            `http://localhost:23000/api/meetings/inject-queue?session=${encodeURIComponent(sessionName)}`,
            { signal: AbortSignal.timeout(HOOK_FETCH_TIMEOUT_MS) }
        );
        if (!queueResponse.ok) return null;

        const queueData = await queueResponse.json();
        if (!queueData.messages || queueData.messages.length === 0) return null;

        debugLog({ event: 'meeting_queue_drained', sessionName, count: queueData.count });

        // Combine all queued messages into one context block
        const combined = queueData.messages.map(m => m.text).join('\n\n---\n\n');
        return combined;
    } catch (err) {
        debugLog({ event: 'meeting_queue_drain_error', error: err.message });
        return null;
    }
}

// ── Stop-hook AMP delivery ──────────────────────────────────────────────────
// Fetch raw unread messages (with IDs) for dedup on the Stop-hook block path.
// Returns { agentId, messages } or null.
async function fetchUnreadMessages(cwd) {
    const agentsResponse = await fetch('http://localhost:23000/api/agents', { signal: AbortSignal.timeout(2500) });
    if (!agentsResponse.ok) return null;
    const agentsData = await agentsResponse.json();
    const agent = resolveAgent(cwd, agentsData.agents || []);
    if (!agent) { debugLog({ event: 'no_agent_for_cwd', cwd }); return null; }

    const messagesResponse = await fetch(
        `http://localhost:23000/api/messages?agent=${encodeURIComponent(agent.id)}&box=inbox&status=unread`,
        { signal: AbortSignal.timeout(2500) }
    );
    if (!messagesResponse.ok) return null;
    const messagesData = await messagesResponse.json();
    const messages = messagesData.messages || [];
    if (messages.length === 0) return null;
    return { agentId: agent.id, messages };
}

function formatMessageSender(msg) {
    const name = msg.fromAlias || (msg.from ? msg.from.substring(0, 8) : 'unknown');
    const host = msg.fromHost ? ` (${msg.fromHost})` : '';
    return `${name}${host}`;
}

// ── Inbox announcement dedup (context-injection path) ───────────────────────
//
// TWO paths announce unread AMP messages and only one of them used to dedup:
//
//   Stop hook              decideStopDelivery + <hash>.notified.json   once per message
//   context injection      checkUnreadMessages                         EVERY user turn
//
// The injection path fires far more often (39 vs 3 in one measured day), so the
// path without dedup was the one doing nearly all the talking. A notifier that
// repeats itself trains the reader to ignore it, and then the one real alert is
// the one that gets dismissed — which is exactly what happened on 2026-09-19.
//
// The two stores are deliberately SEPARATE. Letting an injection consume the
// Stop path's first-fire would disarm the Stop block, and the Stop block is the
// forcing mechanism — the only one that can start a turn on an already-idle
// agent. Share the logic, not the state.
//
// Repeats are rate-limited rather than silenced outright: a message that is
// still unread an hour later is worth mentioning again, just not every turn,
// and not in words that make it sound like it just arrived.
const INBOX_REMIND_MS = Number(process.env.AIM_INBOX_REMIND_MS || 30 * 60 * 1000);
const ANNOUNCED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ANNOUNCED_CAP = 200;

// Keep the newest entries, drop anything past the TTL. Pure.
function pruneAnnounced(announced, now, ttlMs, cap) {
    const ttl = typeof ttlMs === 'number' ? ttlMs : ANNOUNCED_TTL_MS;
    const max = typeof cap === 'number' ? cap : ANNOUNCED_CAP;
    const kept = Object.entries(announced || {})
        .filter(([, t]) => typeof t === 'number' && now - t < ttl)
        .sort((a, b) => b[1] - a[1])
        .slice(0, max);
    return Object.fromEntries(kept);
}

// The AMP filesystem store names messages with underscores (msg_123_abc) while
// the HTTP API reports the same message with hyphens (msg-123-abc). pas-lola
// spotted the divergence; it is harmless where she expected it (both sides of
// the dedup comparison come from the API) but NOT harmless here — an id in the
// API's form is rejected by amp-read.sh:
//
//     $ amp-read.sh msg-1789863849489-zl8spaj
//     Error: Message not found
//
// So anything we print for a human or an agent to act on gets converted first.
function ampMessageId(id) {
    return typeof id === 'string' && id.startsWith('msg-') ? id.replace(/-/g, '_') : id;
}

// Wording carries the distinction the old code lost: `fresh` messages are new,
// `reminders` are explicitly NOT. Calling a two-hour-old message "new" on the
// twentieth announcement is the part that destroys trust in the notifier.
//
// The notice also names the message ID. It used to identify a message only by
// sender and subject — and a reply carries `Re: <same subject>` from the same
// sender, so a genuinely new message in a live thread produced a notice byte
// -identical to the repeats around it. That is not a cosmetic problem: it is
// precisely what made a real message indistinguishable from noise on
// 2026-09-19. An id is the one thing that tells them apart.
function buildInboxNotice(fresh, reminders) {
    const parts = [];
    if (fresh.length === 1) {
        const m = fresh[0];
        const subject = m.subject ? ` about "${m.subject}"` : '';
        const urgent = m.priority === 'urgent' ? '[URGENT] ' : '';
        parts.push(`${urgent}You have a new message from ${formatMessageSender(m)}${subject}.`);
        parts.push(`Read it with: amp-read.sh ${ampMessageId(m.id)}`);
    } else if (fresh.length > 1) {
        const urgentCount = fresh.filter(m => m.priority === 'urgent').length;
        const senders = [...new Set(fresh.map(formatMessageSender))].slice(0, 3).join(', ');
        const urgent = urgentCount > 0 ? `[${urgentCount} URGENT] ` : '';
        parts.push(`${urgent}You have ${fresh.length} new messages from ${senders}.`);
    }
    if (reminders.length > 0) {
        const senders = [...new Set(reminders.map(formatMessageSender))].slice(0, 3).join(', ');
        const ids = reminders.slice(0, 3).map(m => ampMessageId(m.id)).join(', ');
        parts.push(reminders.length === 1
            ? `Still unread from earlier: a message from ${senders} (${ids}).`
            : `Still unread from earlier: ${reminders.length} messages from ${senders} (${ids}).`);
    }
    parts.push('Please check your inbox using the agent-messaging skill.');
    return parts.join(' ');
}

// Pure decision — no I/O, unit-testable. `announced` maps message id to the ms
// timestamp it was last announced at. Returns notice:null when there is nothing
// worth saying, which is the common case and the whole point.
function decideInboxAnnouncement({ messages, announced, now, remindAfterMs }) {
    const seen = (announced && typeof announced === 'object' && !Array.isArray(announced)) ? announced : {};
    const gap = typeof remindAfterMs === 'number' ? remindAfterMs : INBOX_REMIND_MS;
    const fresh = [];
    const reminders = [];
    for (const m of messages || []) {
        if (!m || !m.id) continue;
        const last = seen[m.id];
        if (typeof last !== 'number') fresh.push(m);
        else if (now - last >= gap) reminders.push(m);
    }
    if (fresh.length === 0 && reminders.length === 0) {
        return { notice: null, announced: seen, freshIds: [], reminderIds: [] };
    }
    const next = { ...seen };
    for (const m of fresh.concat(reminders)) next[m.id] = now;
    return {
        notice: buildInboxNotice(fresh, reminders),
        announced: pruneAnnounced(next, now),
        freshIds: fresh.map(m => m.id),
        reminderIds: reminders.map(m => m.id),
    };
}

function announcedFile(cwd) {
    return path.join(os.homedir(), '.aimaestro', 'chat-state', `${hashCwd(cwd)}.announced.json`);
}
function loadAnnounced(cwd) {
    try {
        const o = JSON.parse(fs.readFileSync(announcedFile(cwd), 'utf8'));
        return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
}
function saveAnnounced(cwd, announced) {
    try {
        fs.mkdirSync(path.join(os.homedir(), '.aimaestro', 'chat-state'), { recursive: true });
        fs.writeFileSync(announcedFile(cwd), JSON.stringify(announced));
    } catch (e) { debugLog({ event: 'save_announced_failed', error: e.message }); }
}

// Per-cwd dedup so each message triggers the Stop-hook block exactly once.
function notifiedIdsFile(cwd) {
    return path.join(os.homedir(), '.aimaestro', 'chat-state', `${hashCwd(cwd)}.notified.json`);
}
function loadNotifiedIds(cwd) {
    try { const a = JSON.parse(fs.readFileSync(notifiedIdsFile(cwd), 'utf8')); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
}
function saveNotifiedIds(cwd, ids) {
    try {
        fs.mkdirSync(path.join(os.homedir(), '.aimaestro', 'chat-state'), { recursive: true });
        fs.writeFileSync(notifiedIdsFile(cwd), JSON.stringify(ids.slice(-200)));
    } catch (e) { debugLog({ event: 'save_notified_ids_failed', error: e.message }); }
}

// ── Memory recall ────────────────────────────────────────────────────────────
// Agents should check memory before re-reading files. On SessionStart the hook
// injects the agent's standing decisions and preferences; on each user prompt,
// the long-term memories nearest to that prompt. Each memory is injected at most
// once per session, so a long session is not re-told the same thing every turn.
const RECALL_PROMPT_LIMIT = 3;
const RECALL_PRIMER_LIMIT = 6;
const RECALL_MEMORY_CHARS = 500;

function recalledFile(cwd) {
    return path.join(os.homedir(), '.aimaestro', 'chat-state', `${hashCwd(cwd)}.recalled.json`);
}
function loadRecalled(cwd, sessionId) {
    try {
        const o = JSON.parse(fs.readFileSync(recalledFile(cwd), 'utf8'));
        return (o && o.sessionId === sessionId && Array.isArray(o.ids)) ? o.ids : [];
    } catch (e) { return []; }
}
function saveRecalled(cwd, sessionId, ids) {
    try {
        fs.mkdirSync(path.join(os.homedir(), '.aimaestro', 'chat-state'), { recursive: true });
        fs.writeFileSync(recalledFile(cwd), JSON.stringify({ sessionId, ids: ids.slice(-300) }));
    } catch (e) { debugLog({ event: 'save_recalled_failed', error: e.message }); }
}

// Pure: turn recalled memories into the context block. Returns null when empty.
function buildMemoryNotice(memories, { primer }) {
    if (!Array.isArray(memories) || memories.length === 0) return null;
    const lines = memories.map(m => {
        const text = String(m.content || '').replace(/\s+/g, ' ').trim();
        const clipped = text.length > RECALL_MEMORY_CHARS ? `${text.slice(0, RECALL_MEMORY_CHARS)}…` : text;
        const date = m.created_at ? new Date(m.created_at).toISOString().slice(0, 10) : 'undated';
        return `- [${m.category} · ${date}] ${clipped}`;
    });
    const title = primer
        ? '## Memory: your standing decisions and preferences'
        : '## Memory: notes from your past sessions on this topic';
    return [
        title,
        'Check these before re-reading files or re-deciding. They are verbatim excerpts from earlier sessions and may be outdated, so verify anything you act on. Search for more with memory-search.sh.',
        '',
        ...lines,
    ].join('\n');
}

// Pure: drop memories already injected this session.
function selectFreshMemories(memories, alreadyIds, limit) {
    const seen = new Set(alreadyIds);
    return (memories || []).filter(m => m && m.memory_id && !seen.has(m.memory_id)).slice(0, limit);
}

async function recallMemories(cwd, sessionId, prompt) {
    try {
        const agents = await fetchAgentsOnce();
        if (!agents) return null;
        const agent = resolveAgent(cwd, agents);
        if (!agent) return null;

        const primer = !prompt;
        const limit = primer ? RECALL_PRIMER_LIMIT : RECALL_PROMPT_LIMIT;
        const qs = primer ? `limit=${limit}` : `limit=${limit + 3}&q=${encodeURIComponent(String(prompt).slice(0, 2000))}`;
        const res = await fetch(`http://localhost:23000/api/agents/${encodeURIComponent(agent.id)}/memory/recall?${qs}`, {
            signal: AbortSignal.timeout(HOOK_FETCH_TIMEOUT_MS * 2),
        });
        if (!res.ok) return null;

        const already = loadRecalled(cwd, sessionId);
        const fresh = selectFreshMemories((await res.json()).memories, already, limit);
        if (fresh.length === 0) return null;

        saveRecalled(cwd, sessionId, [...already, ...fresh.map(m => m.memory_id)]);
        debugLog({ event: 'memory_recalled', agentId: agent.id, primer, count: fresh.length });
        return buildMemoryNotice(fresh, { primer });
    } catch (err) {
        debugLog({ event: 'memory_recall_error', error: err.message });
        return null;
    }
}

// Multi-line reason handed back to Claude on a Stop-hook block — its instruction
// to read + respond before going idle.
function buildAmpBlockReason(messages) {
    const urgentCount = messages.filter(m => m.priority === 'urgent').length;
    // Lead with the count and the word, not a bracketed tag.
    //
    // Claude Code renders a Stop hook's `decision: block` as "Stop hook error:"
    // followed by the start of this string, TRUNCATED to the label width. We
    // cannot change its wording (nothing failed here — block is the documented
    // way to hand work back to an agent), but we choose what survives the
    // truncation. Leading with "[AMP]" made the label read
    //
    //     Stop hook error: [A
    //
    // which tells the reader nothing at all. Putting the count first means even
    // a dozen characters carry the message: "1 unread AMP m…".
    const header = messages.length === 1
        ? `1 unread AMP message in your inbox:`
        : `${messages.length} unread AMP messages in your inbox${urgentCount > 0 ? ` (${urgentCount} urgent)` : ''}:`;
    const lines = messages.slice(0, 10).map((m, i) => {
        const urgent = m.priority === 'urgent' ? '[URGENT] ' : '';
        const subj = m.subject ? ` — "${m.subject}"` : '';
        return `  ${i + 1}. ${urgent}from ${formatMessageSender(m)}${subj}`;
    });
    const more = messages.length > 10 ? `  …and ${messages.length - 10} more` : '';
    return [
        header, ...lines, more, '',
        'Read and respond to these now using the agent-messaging skill',
        '(amp-inbox.sh, amp-read.sh <id>, amp-reply.sh <id> "..."), then continue.',
    ].filter(Boolean).join('\n');
}

// Drop messages we've already surfaced (dedup) and those lacking an id.
function filterFreshMessages(messages, alreadyIds) {
    const already = new Set(alreadyIds || []);
    return (messages || []).filter(m => m && m.id && !already.has(m.id));
}

// Pure Stop-hook decision — no I/O, unit-testable. Returns:
//   { block: false, freshIds: [] }                        → let the agent go idle
//   { block: true, response: {...}, freshIds: [...] }     → force a continuation
function decideStopDelivery({ agent, stopHookActive, messages, alreadyIds }) {
    // decision:block is a Claude Code capability; never loop (stop_hook_active).
    if (agent !== 'claude' || stopHookActive) return { block: false, freshIds: [] };
    const fresh = filterFreshMessages(messages, alreadyIds);
    if (fresh.length === 0) return { block: false, freshIds: [] };
    return {
        block: true,
        response: { decision: 'block', reason: buildAmpBlockReason(fresh) },
        freshIds: fresh.map(m => m.id),
    };
}

// Main
async function main() {
    const input = await readStdin();
    currentSessionId = input.session_id || null;

    // Log all input for debugging
    debugLog({ event: 'hook_received', input });

    const agent = detectAgent(input);
    const rawEvent = input.hook_event_name || process.env.CLAUDE_HOOK_EVENT;
    const hookEvent = normalizeEvent(rawEvent, agent);
    const cwd = input.cwd || process.env.GEMINI_CWD || process.cwd();
    const sessionId = input.session_id;
    const transcriptPath = input.transcript_path;

    debugLog({ event: 'agent_detected', agent, rawEvent, hookEvent });

    // Hook response — may be enriched with context injection for inbox notifications
    let hookResponse = {};

    // Handle different hook events
    switch (hookEvent) {
        case 'PermissionRequest':
            // Claude is asking for permission to use a tool
            // Input includes: tool_name, tool_input, tool_use_id, permission_suggestions
            const toolName = input.tool_name || input.toolName;
            const toolInput = input.tool_input || input.toolInput || {};
            const permissionSuggestions = input.permission_suggestions || [];

            // Create a human-readable description of what's being asked
            let description = `Allow ${toolName}?`;
            if (toolName === 'Edit' && toolInput.file_path) {
                description = `Edit ${toolInput.file_path}?`;
            } else if (toolName === 'Write' && toolInput.file_path) {
                description = `Create ${toolInput.file_path}?`;
            } else if (toolName === 'Bash' && toolInput.command) {
                description = `Run: ${toolInput.command}`;
            } else if (toolName === 'Read' && toolInput.file_path) {
                description = `Read ${toolInput.file_path}?`;
            } else if (toolName === 'Grep' && toolInput.path) {
                description = `Search in ${toolInput.path}?`;
            }

            // Build options matching Claude Code source (Qv2/Vd5 functions).
            // Structure is always: [Yes] + [middle from suggestions] + [No]
            const options = [
                { key: '1', label: 'Yes', value: 'yes' }
            ];

            // Middle options — built from permission_suggestions using Vd5 logic.
            // Categorize suggestions into read rules, bash rules, and directories.
            if (permissionSuggestions.length > 0) {
                const readPaths = [];
                const bashCmds = [];
                const dirs = [];

                for (const s of permissionSuggestions) {
                    if (s.type === 'addDirectories' && s.directories) {
                        dirs.push(...s.directories.map(d => d.split('/').pop() || d));
                    } else if (s.type === 'addRules' && s.rules) {
                        for (const r of s.rules) {
                            if (r.toolName === 'Read') {
                                readPaths.push(r.ruleContent || '');
                            } else if (r.toolName === 'Bash') {
                                bashCmds.push(r.ruleContent || '');
                            }
                        }
                    }
                }

                // Build label following Vd5 logic from Claude Code source
                let middleLabel = '';
                const allPaths = [...dirs, ...readPaths.map(p => p.split('/').pop() || p)].filter(Boolean);

                if (allPaths.length > 0 && bashCmds.length > 0) {
                    middleLabel = `Yes, and allow ${allPaths.join(', ')} access and ${bashCmds.join(', ')} commands`;
                } else if (allPaths.length > 0) {
                    middleLabel = readPaths.length > 0
                        ? `Yes, allow reading from ${allPaths.join(', ')} from this project`
                        : `Yes, and always allow access to ${allPaths.join(', ')} from this project`;
                } else if (bashCmds.length > 0) {
                    middleLabel = `Yes, and don't ask again for ${bashCmds.join(', ')} commands in this project`;
                } else {
                    // Generic fallback for other suggestion types
                    middleLabel = `Yes, and don't ask again for ${toolName} in this project`;
                }

                options.push({
                    key: '2',
                    label: middleLabel,
                    value: 'yes-apply-suggestions',
                    suggestions: permissionSuggestions
                });
            } else if (['Edit', 'Write', 'MultiEdit'].includes(toolName)) {
                // File operations always get a session-scoped option per dx2 logic
                const filePath = toolInput.file_path || toolInput.path || '';
                const isInCwd = filePath.startsWith(cwd);
                const label = isInCwd
                    ? 'Yes, allow all edits during this session'
                    : `Yes, allow all edits in ${filePath.replace(/\/[^/]+$/, '/')} during this session`;
                options.push({
                    key: '2',
                    label,
                    value: 'yes-session'
                });
            } else if (toolName === 'Read') {
                options.push({
                    key: '2',
                    label: 'Yes, during this session',
                    value: 'yes-session'
                });
            }

            // Last option is always No with feedback
            options.push({
                key: String(options.length + 1),
                label: 'No, and tell Claude what to do differently',
                value: 'no'
            });

            // Await the HTTP broadcast for permission_request — this is the critical
            // path for the chat UI. Other hooks fire-and-forget, but permissions must
            // reach WebSocket clients before process.exit() kills pending fetches.
            await writeState(cwd, {
                status: 'permission_request',
                toolName,
                toolInput,
                description,
                options,
                message: `Claude wants to ${toolName.toLowerCase()}`,
                sessionId,
                transcriptPath
            });
            break;

        case 'Notification':
            // Check notification type
            const notificationType = input.notification_type || input.type;

            if (notificationType === 'idle_prompt') {
                // Claude is waiting for regular input - perfect time to check messages!
                await writeState(cwd, {
                    status: 'waiting_for_input',
                    message: input.message || 'Waiting for your input...',
                    notificationType,
                    sessionId,
                    transcriptPath
                });

                // Check for unread messages and meeting inject queue
                const [idleMessagePrompt, meetingContext] = await withDeadline(Promise.all([
                    checkUnreadMessages(cwd),
                    drainMeetingInjectQueue(cwd)
                ]), INJECT_DEADLINE_MS, [null, null]);
                const combined = [idleMessagePrompt, meetingContext].filter(Boolean).join('\n\n');
                if (combined) {
                    debugLog({ event: 'injecting_context', cwd, agent, trigger: 'idle_prompt', hasInbox: !!idleMessagePrompt, hasMeeting: !!meetingContext });
                    hookResponse = buildContextResponse(agent, rawEvent, combined);
                }
            } else if (notificationType === 'permission_prompt') {
                // Notification(permission_prompt) fires ~6s AFTER PermissionRequest.
                // If PermissionRequest already wrote the state with full tool data,
                // do NOT overwrite it — just skip. The permission_request state is
                // strictly more informative than waiting_for_input.
                const stateDir = path.join(os.homedir(), '.aimaestro', 'chat-state');
                const cwdHash = hashCwd(cwd);
                const stateFile = path.join(stateDir, `${cwdHash}.json`);

                let existingState = {};
                try {
                    if (fs.existsSync(stateFile)) {
                        existingState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                        const age = Date.now() - new Date(existingState.updatedAt).getTime();
                        if (existingState.status === 'permission_request' && age < 30000) {
                            // PermissionRequest hook already wrote the good state — don't touch it
                            debugLog({ event: 'notification_skipped', reason: 'permission_request already active', age });
                            break;
                        }
                    }
                } catch (e) {}

                // No existing permission_request — write what we have
                await writeState(cwd, {
                    status: 'waiting_for_input',
                    message: input.message || 'Waiting for your input...',
                    notificationType,
                    sessionId,
                    transcriptPath
                });
            }
            break;

        case 'Stop': {
            // The reliable AMP delivery slot. Injecting context on idle_prompt /
            // UserPromptSubmit cannot start a turn on an already-idle agent — the
            // failure that forced operators to manually type "check your inbox".
            // Returning { decision: "block", reason } forces the agent to read +
            // respond before it goes idle. Loop-safe: honor stop_hook_active
            // (never block twice in a row) and dedup on message IDs.
            let blocked = false;
            if (agent === 'claude' && !input.stop_hook_active) {
                try {
                    const unread = await fetchUnreadMessages(cwd);
                    const alreadyIds = loadNotifiedIds(cwd);
                    const decision = decideStopDelivery({
                        agent,
                        stopHookActive: input.stop_hook_active,
                        messages: unread ? unread.messages : [],
                        alreadyIds,
                    });
                    if (decision.block) {
                        saveNotifiedIds(cwd, [...alreadyIds, ...decision.freshIds]);
                        debugLog({ event: 'stop_block_delivery', cwd, count: decision.freshIds.length });
                        hookResponse = decision.response;
                        blocked = true;
                    }
                } catch (err) {
                    debugLog({ event: 'stop_block_check_failed', error: err.message });
                }
            }
            // MUST be awaited: process.exit(0) at the end of run() kills any
            // in-flight fetch. Measured on a customer estate 10-14 Sep 2026,
            // 0 of 56 Stop broadcasts reached the server without this.
            await writeState(cwd, {
                status: blocked ? 'active' : 'idle',
                message: null,
                sessionId,
                transcriptPath
            });
            break;
        }

        case 'SessionStart':
            // Session started - record the session info
            await writeState(cwd, {
                status: 'active',
                message: null,
                sessionId,
                transcriptPath,
                source: input.source
            });

            // Check for unread messages and meeting inject queue
            // ...and the agent's standing decisions/preferences from long-term memory.
            // Each part has its own deadline so a slow recall never costs the inbox.
            const [startMessagePrompt, startMeetingContext, startMemory] = await Promise.all([
                withDeadline(checkUnreadMessages(cwd), INJECT_DEADLINE_MS, null),
                withDeadline(drainMeetingInjectQueue(cwd), INJECT_DEADLINE_MS, null),
                withDeadline(recallMemories(cwd, sessionId, null), INJECT_DEADLINE_MS, null)
            ]);
            const startCombined = [startMessagePrompt, startMeetingContext, startMemory].filter(Boolean).join('\n\n');
            if (startCombined) {
                debugLog({ event: 'injecting_context', cwd, agent, trigger: 'session_start', hasInbox: !!startMessagePrompt, hasMeeting: !!startMeetingContext, hasMemory: !!startMemory });
                hookResponse = buildContextResponse(agent, rawEvent, startCombined);
            }
            break;

        case 'UserPromptSubmit': {
            // The only event that means "a turn just STARTED".
            //
            // Without this the dashboard could never show an agent as working:
            // SessionStart fires once per session, Stop reports idle at the end,
            // and nothing in between said the agent was busy. An agent that took
            // a twelve-minute turn stayed 'idle' throughout.
            await writeState(cwd, {
                status: 'active',
                message: null,
                sessionId,
                transcriptPath
            });

            // Drain on every user prompt — this is the reliable delivery slot
            // for Claude Code. SessionStart can be preempted by other plugins'
            // hooks; UserPromptSubmit fires once per user turn and is rarely contended.
            //
            // Memory recall runs alongside: the long-term memories nearest to what
            // the user just asked, so the agent sees past decisions before it
            // starts reading files.
            const [upsInbox, upsMeeting, upsMemory] = await Promise.all([
                withDeadline(checkUnreadMessages(cwd), INJECT_DEADLINE_MS, null),
                withDeadline(drainMeetingInjectQueue(cwd), INJECT_DEADLINE_MS, null),
                input.prompt ? withDeadline(recallMemories(cwd, sessionId, input.prompt), INJECT_DEADLINE_MS, null) : null
            ]);
            const upsContext = [upsMeeting, upsInbox, upsMemory].filter(Boolean).join('\n\n');
            if (upsContext) {
                debugLog({ event: 'injecting_context', cwd, agent, trigger: 'user_prompt_submit', hasInbox: !!upsInbox, hasMeeting: !!upsMeeting, hasMemory: !!upsMemory });
                hookResponse = buildContextResponse(agent, rawEvent, upsContext);
            }
            break;
        }

        default:
            // Unknown event - just log it
            if (process.env.DEBUG) {
                console.error(`[ai-maestro-hook] Unknown event: ${hookEvent}`);
            }
    }

    // Output hook response (may include additionalContext for inbox notifications).
    // Force immediate exit — pending fire-and-forget fetches (broadcastStatusUpdate)
    // can keep the event loop alive past Claude Code's hook deadline.
    process.stdout.write(JSON.stringify(hookResponse));
    process.exit(0);
}

// Only run when invoked directly (node ai-maestro-hook.cjs). When require()'d
// by the test suite, export the pure decision helpers instead of executing.
if (require.main === module) {
    main().catch(err => {
        console.error('[ai-maestro-hook] Error:', err);
        process.exit(0); // Don't block Claude
    });
}

module.exports = {
    buildMemoryNotice,
    selectFreshMemories,
    buildAmpBlockReason,
    filterFreshMessages,
    decideStopDelivery,
    formatMessageSender,
    decideInboxAnnouncement,
    buildInboxNotice,
    pruneAnnounced,
    ampMessageId,
};
