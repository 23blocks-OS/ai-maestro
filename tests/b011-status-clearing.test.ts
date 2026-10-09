/**
 * B011: agent status that is set and never cleared, as replayed event sequences
 * (tests/helpers/hook-replay.ts) with the recorded status asserted after every step.
 *
 * Each describe block names the B011 finding it covers. Where a finding could not be
 * confirmed from the Claude Code / Grok hook docs or a captured log, the block says
 * so instead of asserting a guess.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
import { createReplay, claude, grok, codex, type Replay } from './helpers/hook-replay'

const require = createRequire(import.meta.url)
const hook = require('../scripts/claude-hooks/ai-maestro-hook.cjs')

let r: Replay
afterEach(() => r?.cleanup())

const HOOK_STATUS_TTL_MS = 15 * 60 * 1000
const age = (s: any) => Date.now() - new Date(s.updatedAt).getTime()

describe('baseline: the sequences that already worked', () => {
  it('Claude turn: SessionStart idle, prompt active, Stop idle, idle_prompt ready', async () => {
    r = createReplay()
    const out = await r.run([
      claude('SessionStart'),
      claude('UserPromptSubmit'),
      claude('PostToolBatch'),
      claude('Stop'),
      claude('Notification'),
    ])
    expect(out.map(o => o.status)).toEqual(['idle', 'active', 'active', 'idle', 'waiting_for_input'])
    expect(out[4].notificationType).toBe('idle_prompt')
  })

  it('answering a permission prompt clears needs-you on the next tool batch', async () => {
    r = createReplay()
    await r.send(claude('UserPromptSubmit'))
    expect((await r.send(claude('PermissionRequest'))).status).toBe('permission_request')
    r.wait(6000)
    // Notification(permission_prompt) 6s later must NOT replace the richer state
    const n = await r.send(claude('Notification', { notification_type: 'permission_prompt', message: 'needs permission' }))
    expect(n.status).toBe('permission_request')
    expect((await r.send(claude('PostToolBatch'))).status).toBe('active')
  })
})

// Real sequence from ~/.aimaestro/chat-state/hook-debug.log (2026-10-09 03:24-03:31): the
// agent kept running tool batches for minutes AFTER a Stop, with no UserPromptSubmit.
describe('captured Claude sequence: work continues after a Stop', () => {
  it('reads active again when tool batches resume after a Stop', async () => {
    r = createReplay()
    const out = await r.run([
      claude('UserPromptSubmit', { prompt_id: '3f479230' }),
      claude('PostToolBatch', { prompt_id: '3f479230' }),
      { wait: 4000 },
      claude('Stop', { prompt_id: '3f479230' }),
      { wait: 23000 },
      claude('PostToolBatch', { prompt_id: '3f479230' }), // 03:25:37 Stop, 03:26:00 batch
      { wait: 600000 },
      claude('UserPromptSubmit', { prompt_id: '172c561d' }),
      claude('PostToolBatch', { prompt_id: '172c561d' }),
      claude('Stop', { prompt_id: '172c561d' }),
      { wait: 60000 },
      claude('Notification', { prompt_id: '172c561d' }),
    ])
    expect(out.map(o => o.status)).toEqual([
      'active', 'active', 'idle', 'active', 'active', 'active', 'idle', 'waiting_for_input',
    ])
  })

  it('does not let a late async PostToolBatch undo the Stop it raced', async () => {
    r = createReplay()
    await r.run([claude('UserPromptSubmit'), claude('Stop')])
    r.wait(800)
    expect((await r.send(claude('PostToolBatch'))).status).toBe('idle')
  })
})

describe('B011 #3: no clearing on interrupt, API error, crash or kill', () => {
  it('SessionEnd stops an active status from outliving the session', async () => {
    r = createReplay()
    await r.run([claude('SessionStart'), claude('UserPromptSubmit')])
    expect((await r.send(claude('SessionEnd'))).status).toBe('ended')
  })

  it('SessionEnd clears a pending permission prompt too', async () => {
    r = createReplay()
    await r.run([claude('UserPromptSubmit'), claude('PermissionRequest')])
    expect((await r.send(claude('SessionEnd', { reason: 'prompt_input_exit' }))).status).toBe('ended')
  })

  it('a /clear ends one session and starts the next: the new one reads idle', async () => {
    r = createReplay()
    await r.run([claude('UserPromptSubmit')])
    await r.send(claude('SessionEnd', { reason: 'clear' }))
    expect((await r.send(claude('SessionStart', { source: 'clear', session_id: 'new-session' }))).status).toBe('idle')
  })

  it('a SessionEnd processed after the next session started does not clobber it', async () => {
    r = createReplay()
    await r.run([claude('UserPromptSubmit'), claude('SessionStart', { source: 'clear', session_id: 'new-session' })])
    expect((await r.send(claude('SessionEnd', { reason: 'clear' }))).status).toBe('idle')
  })

  it('Claude StopFailure (API error) settles the turn to idle', async () => {
    r = createReplay()
    await r.run([claude('UserPromptSubmit')])
    const out = await r.send(claude('StopFailure'))
    expect(out.status).toBe('idle')
    expect(out.state?.stopFailure).toBe('rate_limit')
  })

  it('Grok: StopFailure, StopCancelled and SessionEnd each settle', async () => {
    r = createReplay()
    await r.send(grok('UserPromptSubmit', { promptId: 'g1' }))
    expect((await r.send(grok('StopFailure', { promptId: 'g1', error: 'server_error' }))).status).toBe('idle')
    await r.send(grok('UserPromptSubmit', { promptId: 'g2' }))
    const c = await r.send(grok('StopCancelled', { promptId: 'g2', reason: 'user_interrupt', cancelledBy: 'user' }))
    expect(c.status).toBe('idle')
    expect(c.state?.stopCancelled).toBe('user_interrupt')
    await r.send(grok('UserPromptSubmit', { promptId: 'g3' }))
    expect((await r.send(grok('SessionEnd', { reason: 'other' }))).status).toBe('ended')
  })

  it("a Grok subagent's own turn ending does not settle the session", async () => {
    r = createReplay()
    await r.send(grok('UserPromptSubmit', { promptId: 'g1' }))
    expect((await r.send(grok('StopCancelled', { subagentType: 'explore', reason: 'max_turns' }))).status).toBe('active')
    expect((await r.send(grok('Stop', { subagentType: 'explore' }))).status).toBe('active')
  })
})

describe('B011 #4: interrupted permission prompt', () => {
  it('Grok: a declined or dismissed prompt ends the turn with StopCancelled and clears needs-you', async () => {
    r = createReplay()
    await r.run([grok('UserPromptSubmit', { promptId: 'g1' }), claude('PermissionRequest', { prompt_id: 'g1' })])
    expect(r.state()?.status).toBe('permission_request')
    const out = await r.send(grok('StopCancelled', { promptId: 'g1', reason: 'permission_rejected' }))
    expect(out.status).toBe('idle')
  })

  it('Claude: the next prompt clears it; a prompt left on screen stays needs-you for hours', async () => {
    r = createReplay()
    await r.run([claude('UserPromptSubmit'), claude('PermissionRequest')])
    r.wait(3 * 60 * 60 * 1000)
    // No event proves progress while the dialog is unanswered, so the hook leaves it be
    expect(r.state()?.status).toBe('permission_request')
    expect((await r.send(claude('UserPromptSubmit', { prompt_id: 'p2' }))).status).toBe('active')
  })
  // NOT REPRODUCED for Claude: the docs say a user interrupt fires no hook (no Stop), and
  // nothing in the captured log shows what follows a denied prompt, so there is no event
  // to clear on beyond the ones above. getActivity's pane/transcript upgrade covers it.
})

describe('B011 #1: Codex and Gemini start with a claim they cannot back', () => {
  it('Codex SessionStart claims nothing instead of "active"', async () => {
    r = createReplay()
    const out = await r.send(codex('SessionStart', { source: 'startup' }))
    expect(out.status).toBe('started')
    expect(out.status).not.toBe('active')
  })

  it('Codex Stop still records idle (a fact), Gemini AfterAgent too', async () => {
    r = createReplay()
    expect((await r.send(codex('Stop'))).status).toBe('idle')
    vi.stubEnv('GEMINI_SESSION_ID', 'gem-1') // how the hook recognises Gemini
    expect((await r.send({ hook_event_name: 'SessionStart', session_id: 'gem-1' })).status).toBe('started')
    expect((await r.send({ hook_event_name: 'AfterAgent', session_id: 'gem-1' })).status).toBe('idle')
  })

  it('sessionStartStatus: claude/grok idle, codex/gemini claim nothing, compact preserves', () => {
    for (const a of ['claude', 'grok']) expect(hook.sessionStartStatus(a, 'startup')).toBe('idle')
    for (const a of ['codex', 'gemini']) expect(hook.sessionStartStatus(a, 'startup')).toBe('started')
    expect(hook.sessionStartStatus('claude', 'compact')).toBeNull()
  })
})

describe('B011 #5: a long turn must not age out to idle', () => {
  it('tool batches every ~9 minutes keep the report fresh for a 30 minute turn', async () => {
    r = createReplay()
    await r.send(claude('UserPromptSubmit'))
    for (let i = 0; i < 3; i++) {
      r.wait(9 * 60 * 1000)
      await r.send(claude('PostToolBatch'))
      expect(age(r.state())).toBeLessThan(HOOK_STATUS_TTL_MS)
    }
    r.wait(9 * 60 * 1000)
    expect(age(r.state())).toBeLessThan(HOOK_STATUS_TTL_MS) // 36 min after the prompt
  })

  it('a burst of batches does not rewrite the state each time', async () => {
    r = createReplay()
    await r.send(claude('UserPromptSubmit'))
    const first = r.state()!.updatedAt
    r.wait(2000)
    await r.send(claude('PostToolBatch'))
    expect(r.state()!.updatedAt).toBe(first)
  })
  // NOT FIXED: a single tool call that runs longer than the TTL emits no event at all
  // (PreToolUse fires before it, PostToolBatch after), so nothing in the hook can refresh.
})

describe('B011 #7: compact', () => {
  it('a manual /compact at an idle prompt leaves the agent idle', async () => {
    r = createReplay()
    await r.run([claude('UserPromptSubmit'), claude('Stop')])
    r.wait(120000)
    expect((await r.send(claude('SessionStart', { source: 'compact' }))).status).toBe('idle')
  })

  it('an auto compaction mid-turn leaves the agent active', async () => {
    r = createReplay()
    await r.run([claude('UserPromptSubmit'), claude('PostToolBatch')])
    expect((await r.send(claude('SessionStart', { source: 'compact' }))).status).toBe('active')
  })

  it('a compact with no prior report writes nothing', async () => {
    r = createReplay()
    expect((await r.send(claude('SessionStart', { source: 'compact' }))).state).toBeNull()
  })
})

describe('B011 #8: out-of-order settle reports', () => {
  it('a delayed idle_prompt for the previous turn does not overwrite the new turn', async () => {
    r = createReplay()
    const out = await r.run([
      claude('UserPromptSubmit', { prompt_id: 'p1' }),
      claude('Stop', { prompt_id: 'p1' }),
      claude('UserPromptSubmit', { prompt_id: 'p2' }),
      claude('Notification', { prompt_id: 'p1' }),
    ])
    expect(out.map(o => o.status)).toEqual(['active', 'idle', 'active', 'active'])
  })

  it('Grok: a StopCancelled that arrives after the next UserPromptSubmit is ignored', async () => {
    r = createReplay()
    const out = await r.run([
      grok('UserPromptSubmit', { promptId: 'g1' }),
      grok('UserPromptSubmit', { promptId: 'g2' }),
      grok('StopCancelled', { promptId: 'g1', reason: 'user_interrupt' }),
    ])
    expect(out.map(o => o.status)).toEqual(['active', 'active', 'active'])
    expect((await r.send(grok('Stop', { promptId: 'g2' }))).status).toBe('idle')
  })

  it('a turn the hook never saw start (agent woke itself) still settles', async () => {
    r = createReplay()
    await r.send(claude('UserPromptSubmit', { prompt_id: 'p1' }))
    expect((await r.send(claude('Stop', { prompt_id: 'unseen-turn' }))).status).toBe('idle')
  })

  it('an idle_prompt for the CURRENT turn still settles', async () => {
    r = createReplay()
    await r.run([claude('UserPromptSubmit', { prompt_id: 'p1' })])
    expect((await r.send(claude('Notification', { prompt_id: 'p1' }))).status).toBe('waiting_for_input')
  })
})

describe('B011 #6: agents sharing a working directory', () => {
  // SKIPPED, not fixed. Every reader (sessions-service getHookState, lib/chat-transcript.mjs
  // chatStatePath, the by-cwd index.json) addresses the state by md5(cwd), and a second
  // agent in the same directory cannot be told apart from the first without a per-agent
  // key those readers do not have. Per-session files would be written and never read.
  it('documents the collision: the last writer wins', async () => {
    r = createReplay()
    await r.send(claude('UserPromptSubmit', { session_id: 'agent-a', prompt_id: 'a1' }))
    const b = await r.send(claude('Stop', { session_id: 'agent-b', prompt_id: 'b1' }))
    expect(b.status).toBe('idle')
  })
})

describe('B011 #9: parsing', () => {
  it('stop_hook_active is read strictly: the string "false" is not active', () => {
    expect(hook.isStopHookActive({ stop_hook_active: 'false' })).toBe(false)
    expect(hook.isStopHookActive({ stopHookActive: 'false' })).toBe(false)
    expect(hook.isStopHookActive({ stop_hook_active: false })).toBe(false)
    expect(hook.isStopHookActive({ stop_hook_active: true })).toBe(true)
    expect(hook.isStopHookActive({ stopHookActive: true })).toBe(true)
    expect(hook.isStopHookActive({ stop_hook_active: 'true' })).toBe(true)
  })

  it('detects Codex by its rollout path when the model has no gpt- prefix', () => {
    expect(hook.detectAgent({ hook_event_name: 'Stop', model: 'o3', transcript_path: '/Users/x/.codex/sessions/2026/10/09/rollout-1.jsonl' })).toBe('codex')
    expect(hook.detectAgent({ hook_event_name: 'Stop', model: 'claude-sonnet-5-5', transcript_path: '/Users/x/.claude/projects/p/s.jsonl' })).toBe('claude')
  })

  it('reads prompt ids and notification types in both key styles', async () => {
    r = createReplay()
    await r.send(grok('UserPromptSubmit', { promptId: 'g1' }))
    await r.send(grok('UserPromptSubmit', { promptId: 'g2' }))
    // camelCase-only notificationType (Grok), for the previous turn: ignored
    const stale = await r.send({ ...grok('Notification', { promptId: 'g1', notificationType: 'idle_prompt' }) })
    expect(stale.status).toBe('active')
    const fresh = await r.send({ ...grok('Notification', { promptId: 'g2', notificationType: 'idle_prompt' }) })
    expect(fresh.status).toBe('waiting_for_input')
  })
  // `source` is one word, identical in snake_case and camelCase, so there is no second key
  // style to read: not reproducible.
})
