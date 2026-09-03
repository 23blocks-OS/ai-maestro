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
        const agentsResponse = await fetch('http://localhost:23000/api/agents');
        if (!agentsResponse.ok) return null;

        const agentsData = await agentsResponse.json();
        const agents = agentsData.agents || [];
        const agent = resolveAgent(cwd, agents);

        if (!agent) {
            debugLog({ event: 'no_agent_for_cwd', cwd });
            return null;
        }

        // Check for unread messages
        const messagesResponse = await fetch(
            `http://localhost:23000/api/messages?agent=${encodeURIComponent(agent.id)}&box=inbox&status=unread`
        );
        if (!messagesResponse.ok) return null;

        const messagesData = await messagesResponse.json();
        const messages = messagesData.messages || [];

        if (messages.length === 0) return null;

        debugLog({ event: 'unread_messages_found', agentId: agent.id, count: messages.length });

        // Format message notification
        const formatSender = (msg) => {
            const name = msg.fromAlias || (msg.from ? msg.from.substring(0, 8) : 'unknown');
            const host = msg.fromHost ? ` (${msg.fromHost})` : '';
            return `${name}${host}`;
        };

        if (messages.length === 1) {
            const msg = messages[0];
            const fromInfo = formatSender(msg);
            const subjectInfo = msg.subject ? ` about "${msg.subject}"` : '';
            const urgentFlag = msg.priority === 'urgent' ? '[URGENT] ' : '';
            return `${urgentFlag}You have a new message from ${fromInfo}${subjectInfo}. Please check your inbox using the agent-messaging skill.`;
        } else {
            const urgentCount = messages.filter(m => m.priority === 'urgent').length;
            const senderInfos = messages.map(m => formatSender(m));
            const uniqueSenders = [...new Set(senderInfos)].slice(0, 3);
            const sendersInfo = uniqueSenders.join(', ');
            const urgentFlag = urgentCount > 0 ? `[${urgentCount} URGENT] ` : '';
            return `${urgentFlag}You have ${messages.length} new messages from ${sendersInfo}. Please check your inbox using the agent-messaging skill.`;
        }
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
        const agentsResponse = await fetch('http://localhost:23000/api/agents');
        if (!agentsResponse.ok) return null;

        const agentsData = await agentsResponse.json();
        const agent = resolveAgent(cwd, agentsData.agents || []);
        if (!agent) return null;

        const sessionName = agent.name || agent.alias || agent.session?.tmuxSessionName;
        if (!sessionName) return null;

        const queueResponse = await fetch(
            `http://localhost:23000/api/meetings/inject-queue?session=${encodeURIComponent(sessionName)}`
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

// Multi-line reason handed back to Claude on a Stop-hook block — its instruction
// to read + respond before going idle.
function buildAmpBlockReason(messages) {
    const urgentCount = messages.filter(m => m.priority === 'urgent').length;
    const header = messages.length === 1
        ? `[AMP] You have 1 unread message in your inbox:`
        : `[AMP] You have ${messages.length} unread messages in your inbox${urgentCount > 0 ? ` (${urgentCount} urgent)` : ''}:`;
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
                writeState(cwd, {
                    status: 'waiting_for_input',
                    message: input.message || 'Waiting for your input...',
                    notificationType,
                    sessionId,
                    transcriptPath
                });

                // Check for unread messages and meeting inject queue
                const [idleMessagePrompt, meetingContext] = await Promise.all([
                    checkUnreadMessages(cwd),
                    drainMeetingInjectQueue(cwd)
                ]);
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
                writeState(cwd, {
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
            writeState(cwd, {
                status: blocked ? 'active' : 'idle',
                message: null,
                sessionId,
                transcriptPath
            });
            break;
        }

        case 'SessionStart':
            // Session started - record the session info
            writeState(cwd, {
                status: 'active',
                message: null,
                sessionId,
                transcriptPath,
                source: input.source
            });

            // Check for unread messages and meeting inject queue
            const [startMessagePrompt, startMeetingContext] = await Promise.all([
                checkUnreadMessages(cwd),
                drainMeetingInjectQueue(cwd)
            ]);
            const startCombined = [startMessagePrompt, startMeetingContext].filter(Boolean).join('\n\n');
            if (startCombined) {
                debugLog({ event: 'injecting_context', cwd, agent, trigger: 'session_start', hasInbox: !!startMessagePrompt, hasMeeting: !!startMeetingContext });
                hookResponse = buildContextResponse(agent, rawEvent, startCombined);
            }
            break;

        case 'UserPromptSubmit': {
            // Drain on every user prompt — this is the reliable delivery slot
            // for Claude Code. SessionStart can be preempted by other plugins'
            // hooks; UserPromptSubmit fires once per user turn and is rarely contended.
            const [upsInbox, upsMeeting] = await Promise.all([
                checkUnreadMessages(cwd),
                drainMeetingInjectQueue(cwd)
            ]);
            const upsContext = [upsMeeting, upsInbox].filter(Boolean).join('\n\n');
            if (upsContext) {
                debugLog({ event: 'injecting_context', cwd, agent, trigger: 'user_prompt_submit', hasInbox: !!upsInbox, hasMeeting: !!upsMeeting });
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
    buildAmpBlockReason,
    filterFreshMessages,
    decideStopDelivery,
    formatMessageSender,
};
