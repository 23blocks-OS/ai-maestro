/**
 * Replay a sequence of agent hook events through the REAL hook logic
 * (scripts/claude-hooks/ai-maestro-hook.cjs `handleEvent`) against a temporary HOME,
 * and read back the recorded status after every step (F029 item 4).
 *
 * The hook is a separate process per event in production; here each `send` is one such
 * event handled in-process, with the state file as the only thing carried between
 * them, exactly like production. Nothing touches the real ~/.aimaestro and nothing
 * reaches a real server: fetch answers "not ok", PATH is emptied so the standalone
 * `amp-inbox.sh` fallback cannot run, and the clock is a fake Date the test advances.
 */
import { vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

const require = createRequire(import.meta.url)

export type HookPayload = Record<string, any>

export interface Recorded {
  status: string | null
  notificationType?: string
  state: Record<string, any> | null
  response: Record<string, any>
}

export interface Replay {
  home: string
  cwd: string
  /** Handle one event; resolves with the state file as the hook left it. */
  send(payload: HookPayload): Promise<Recorded>
  /** Move the (fake) clock forward. */
  wait(ms: number): void
  /** The state file now, without sending anything. */
  state(): Record<string, any> | null
  /** Every event of a sequence; `{ wait }` items advance the clock. */
  run(steps: Array<HookPayload | { wait: number }>): Promise<Recorded[]>
  cleanup(): void
}

export function hashCwd(cwd: string): string {
  return crypto.createHash('md5').update(cwd).digest('hex').substring(0, 16)
}

export function createReplay(opts: { cwd?: string; hookPath?: string } = {}): Replay {
  const cwd = opts.cwd ?? '/replay/project'
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-replay-'))
  const emptyBin = path.join(home, 'empty-bin')
  fs.mkdirSync(emptyBin)

  vi.stubEnv('HOME', home)
  vi.stubEnv('PATH', emptyBin)
  vi.stubEnv('AIM_AGENT_ID', '')
  vi.stubEnv('AIM_AGENT_NAME', '')
  vi.stubEnv('CLAUDE_AGENT_NAME', '')
  vi.stubEnv('GEMINI_SESSION_ID', '')
  vi.stubEnv('GEMINI_PROJECT_DIR', '')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-09T12:00:00.000Z'))

  const hook = require(opts.hookPath ?? process.env.HOOK_REPLAY_PATH ?? '../../scripts/claude-hooks/ai-maestro-hook.cjs')
  const stateFile = path.join(home, '.aimaestro', 'chat-state', `${hashCwd(cwd)}.json`)

  const readState = () => {
    try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { return null }
  }

  const send = async (payload: HookPayload): Promise<Recorded> => {
    const response = await hook.handleEvent({ cwd, ...payload })
    const state = readState()
    return { status: state?.status ?? null, notificationType: state?.notificationType, state, response }
  }

  return {
    home,
    cwd,
    send,
    wait: (ms) => { vi.setSystemTime(Date.now() + ms) },
    state: readState,
    async run(steps) {
      const out: Recorded[] = []
      for (const step of steps) {
        if ('wait' in step && typeof step.wait === 'number' && Object.keys(step).length === 1) {
          vi.setSystemTime(Date.now() + step.wait)
          continue
        }
        out.push(await send(step as HookPayload))
      }
      return out
    },
    cleanup() {
      vi.useRealTimers()
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
      fs.rmSync(home, { recursive: true, force: true })
    },
  }
}

// ── Payload builders, shaped like captured payloads ──────────────────────────
// Claude: ~/.aimaestro/chat-state/hook-debug.log, 2026-10-07/08 (UserPromptSubmit, Stop,
// PostToolBatch, Notification idle_prompt, SessionStart compact all carry prompt_id).
// Events the log does not contain (SessionEnd, StopFailure) follow the Claude Code hooks
// reference (code.claude.com/docs/en/hooks).

const SID = 'd367a1a7-3a30-4314-8dd7-a6432b3ffcbf'
const TP = '/Users/x/.claude/projects/-replay-project/d367a1a7-3a30-4314-8dd7-a6432b3ffcbf.jsonl'

export function claude(event: string, over: HookPayload = {}): HookPayload {
  const base: HookPayload = {
    session_id: SID,
    transcript_path: TP,
    cwd: '/replay/project',
    scratchpad_dir: '/private/tmp/claude-501/-replay-project/scratchpad',
    hook_event_name: event,
  }
  switch (event) {
    case 'Stop':
      return { ...base, prompt_id: 'p1', permission_mode: 'bypassPermissions', effort: { level: 'medium' }, stop_hook_active: false, last_assistant_message: 'done', ...over }
    case 'StopFailure':
      return { ...base, prompt_id: 'p1', permission_mode: 'default', effort: { level: 'medium' }, error_type: 'rate_limit', error_message: '429', ...over }
    case 'UserPromptSubmit':
      return { ...base, prompt_id: 'p1', permission_mode: 'bypassPermissions', user_prompt: 'do the thing', ...over }
    case 'PostToolBatch':
      return { ...base, prompt_id: 'p1', permission_mode: 'bypassPermissions', tool_calls: [{ tool_name: 'Bash', tool_input: { command: 'ls' }, tool_output: '', tool_use_id: 't1' }], ...over }
    case 'Notification':
      return { ...base, prompt_id: 'p1', message: 'Claude is waiting for your input', notification_type: 'idle_prompt', ...over }
    case 'PermissionRequest':
      return { ...base, prompt_id: 'p1', permission_mode: 'default', tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, tool_use_id: 't2', ...over }
    case 'SessionStart':
      return { ...base, prompt_id: 'p0', source: 'startup', model: 'claude-sonnet-5-5', ...over }
    case 'SessionEnd':
      return { ...base, reason: 'other', ...over }
    default:
      return { ...base, ...over }
  }
}

// Grok sends BOTH key styles (see tests/ai-maestro-hook-grok.test.ts, captured from Grok
// 1.0.46). The turn-end events below follow Grok's hooks guide (10-hooks.md); the Grok
// fixtures in tests/fixtures/grok only record hook executions, not stdin payloads.
const GROK_TP = '/Users/x/.grok/sessions/%2Freplay%2Fproject/01a1/updates.jsonl'
const GROK_SID = '01a11267-e308-7fc1-ae44-da77d8c47e25'

export function grok(event: string, over: HookPayload = {}): HookPayload {
  const camel = event.charAt(0).toLowerCase() + event.slice(1)
  return {
    hookEventName: camel,
    hook_event_name: event,
    sessionId: GROK_SID,
    session_id: GROK_SID,
    cwd: '/replay/project',
    transcriptPath: GROK_TP,
    transcript_path: GROK_TP,
    ...(event === 'Stop' && { stopHookActive: false, reason: 'end_turn' }),
    ...over,
  }
}

/** Codex: only Stop and SessionStart are installed (scripts/claude-hooks/install-hooks.sh). */
export function codex(event: string, over: HookPayload = {}): HookPayload {
  return {
    session_id: 'codex-1',
    transcript_path: '/Users/x/.codex/sessions/2026/10/09/rollout-2026-10-09T12-00-00-codex-1.jsonl',
    cwd: '/replay/project',
    hook_event_name: event,
    model: 'gpt-5-codex',
    ...(event === 'Stop' && { turn_id: 't1' }),
    ...over,
  }
}
