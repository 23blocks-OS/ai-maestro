#!/usr/bin/env node
/**
 * AI Maestro Claude Code Hook
 *
 * This hook captures Claude Code events and writes state to files
 * that AI Maestro can read to display in the Chat interface.
 *
 * Supported events:
 * - Notification (idle_prompt): When Claude is waiting for user input
 * - Stop: When Claude finishes responding
 * - SessionStart: When a session starts/resumes
 *
 * State is written to: ~/.aimaestro/chat-state/<cwd-hash>.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

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

// Write state to file
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
}

// Log to debug file
function debugLog(data) {
    const debugFile = path.join(os.homedir(), '.aimaestro', 'chat-state', 'hook-debug.log');
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${JSON.stringify(data)}\n`;
    fs.appendFileSync(debugFile, line);
}

// Main
async function main() {
    const input = await readStdin();

    // Log all input for debugging
    debugLog({ event: 'hook_received', input });

    const hookEvent = input.hook_event_name || process.env.CLAUDE_HOOK_EVENT;
    const cwd = input.cwd || process.cwd();
    const sessionId = input.session_id;
    const transcriptPath = input.transcript_path;

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

            // Build options array similar to Claude's terminal UI
            const options = [
                { key: '1', label: 'Yes', action: 'allow_once' }
            ];

            // Add session-scoped option if available
            const sessionSuggestion = permissionSuggestions.find(s => s.destination === 'session');
            if (sessionSuggestion && sessionSuggestion.rules && sessionSuggestion.rules[0]) {
                const rule = sessionSuggestion.rules[0];
                options.push({
                    key: '2',
                    label: `Yes, allow ${rule.toolName || toolName} from ${rule.ruleContent || 'this location'} during this session`,
                    action: 'allow_session',
                    rule: rule.ruleContent
                });
            }

            // Add local settings option if available
            const localSuggestion = permissionSuggestions.find(s => s.destination === 'localSettings');
            if (localSuggestion && localSuggestion.rules && localSuggestion.rules[0]) {
                const rule = localSuggestion.rules[0];
                options.push({
                    key: String(options.length + 1),
                    label: `Yes, always allow this command`,
                    action: 'allow_always',
                    rule: rule.ruleContent
                });
            }

            // Always add the "type to respond" option
            options.push({
                key: String(options.length + 1),
                label: 'Type here to tell Claude what to do differently',
                action: 'custom'
            });

            writeState(cwd, {
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
                // Claude is waiting for regular input
                writeState(cwd, {
                    status: 'waiting_for_input',
                    message: input.message || 'Waiting for your input...',
                    notificationType,
                    sessionId,
                    transcriptPath
                });
            } else if (notificationType === 'permission_prompt') {
                // For permission prompts, preserve existing tool info if we have it
                const stateDir = path.join(os.homedir(), '.aimaestro', 'chat-state');
                const cwdHash = hashCwd(cwd);
                const stateFile = path.join(stateDir, `${cwdHash}.json`);

                let existingState = {};
                try {
                    if (fs.existsSync(stateFile)) {
                        existingState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                        // Only preserve if it's a recent permission_request (within 10 seconds)
                        const age = Date.now() - new Date(existingState.updatedAt).getTime();
                        if (existingState.status !== 'permission_request' || age > 10000) {
                            existingState = {};
                        }
                    }
                } catch (e) {}

                writeState(cwd, {
                    status: 'waiting_for_input',
                    message: input.message || 'Waiting for your input...',
                    notificationType,
                    sessionId,
                    transcriptPath,
                    // Preserve tool info from PermissionRequest if we have it
                    toolName: existingState.toolName,
                    toolInput: existingState.toolInput,
                    options: existingState.options,
                    description: existingState.description || input.message
                });
            }
            break;

        case 'Stop':
            // Claude finished responding - clear the waiting state
            writeState(cwd, {
                status: 'idle',
                message: null,
                sessionId,
                transcriptPath
            });
            break;

        case 'SessionStart':
            // Session started - record the session info
            writeState(cwd, {
                status: 'active',
                message: null,
                sessionId,
                transcriptPath,
                source: input.source
            });
            break;

        default:
            // Unknown event - just log it
            if (process.env.DEBUG) {
                console.error(`[ai-maestro-hook] Unknown event: ${hookEvent}`);
            }
    }

    // Output empty JSON to indicate success
    console.log('{}');
}

main().catch(err => {
    console.error('[ai-maestro-hook] Error:', err);
    process.exit(0); // Don't block Claude
});
