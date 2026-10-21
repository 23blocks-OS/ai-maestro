/**
 * Claude Code's PermissionRequest hook, observe-only: "a permission or question is pending" is
 * reported the moment Claude Code asks, instead of ~6 s later through the permission_prompt
 * notification (which a keystroke in the pane defers). The payloads are real ones recorded from
 * Claude Code 2.1.306 (tests/fixtures/claude-hooks).
 *
 * What the recording showed (scratchpad research, summarised in the PR):
 *  - PermissionRequest fires ~0.05 s after PreToolUse, at the moment the dialog is drawn; the
 *    Notification(permission_prompt) arrives 6.0 s later and is deferred by any keystroke.
 *  - A tool approval, an AskUserQuestion and an ExitPlanMode all fire PermissionRequest.
 *  - Nothing fires when the user answers; the next signal is PostToolUse / PostToolBatch.
 *  - permission_suggestions does not list the dialog's options, so options stay with the pane.
 */
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import { createRequire } from 'module'
import { createReplay, claude, grok, codex, type Replay } from './helpers/hook-replay'

const require = createRequire(import.meta.url)
const hook = require('../scripts/claude-hooks/ai-maestro-hook.cjs')
const ev = JSON.parse(fs.readFileSync(new URL('./fixtures/claude-hooks/permission-events.json', import.meta.url), 'utf8'))

let replay: Replay | null = null
afterEach(() => { replay?.cleanup(); replay = null })

describe('PermissionRequest: the agent is marked as waiting on a decision at once', () => {
  it('writes permission_request with what is asked and no invented options', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    const r = await replay.send(ev.bashPermissionRequest)
    expect(r.status).toBe('permission_request')
    expect(r.state?.toolName).toBe('Bash')
    expect(r.state?.description).toMatch(/^Run: touch /)
    expect(r.state?.options).toEqual([])
    expect(r.state?.observed).toBe(true)
  })

  it('never answers the dialog: the hook output carries no decision', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    const r = await replay.send(ev.bashPermissionRequest)
    expect(r.response).toEqual({})
  })

  it('does not let the later permission_prompt notification replace it', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    await replay.send(ev.bashPermissionRequest)
    replay.wait(6000)
    const r = await replay.send(ev.notificationPermissionPrompt)
    expect(r.status).toBe('permission_request')
    expect(r.state?.observed).toBe(true)
  })

  it('without the PermissionRequest event (older Claude Code, auto mode) the notification still marks it', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    const r = await replay.send(ev.notificationPermissionPrompt)
    expect(r.status).toBe('waiting_for_input')
    expect(r.notificationType).toBe('permission_prompt')
  })

  it('treats an AskUserQuestion and an ExitPlanMode the same way, without keeping the question list or the plan', async () => {
    for (const name of ['askUserQuestionPermissionRequest', 'exitPlanModePermissionRequest']) {
      replay = createReplay({ cwd: '/work/proj' })
      const r = await replay.send(ev[name])
      expect(r.status, name).toBe('permission_request')
      expect(r.state?.options, name).toEqual([])
      const written = JSON.stringify(r.state)
      expect(written, name).not.toContain('planFilePath')
      expect(written, name).not.toContain('multiSelect')
      replay.cleanup(); replay = null
    }
    replay = createReplay({ cwd: '/work/proj' })
    const q = await replay.send(ev.askUserQuestionPermissionRequest)
    expect(q.state?.toolInput).toEqual({ question: 'Which color do you prefer?' })
  })

  it('a subagent asking is still the session waiting, and says which subagent', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    expect(ev.subagentPermissionRequest.agent_id).toBeTruthy()
    const r = await replay.send(ev.subagentPermissionRequest)
    expect(r.status).toBe('permission_request')
    expect(r.state?.agentId).toBe(ev.subagentPermissionRequest.agent_id)
  })
})

describe('PermissionRequest: only a short summary leaves the hook', () => {
  it('a Write keeps its path, not the file it would write', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    const r = await replay.send(claude('PermissionRequest', {
      cwd: '/work/proj', tool_name: 'Write', tool_input: { file_path: '/work/proj/a.txt', content: 'SECRET'.repeat(200000) },
    }))
    expect(r.state?.toolInput).toEqual({ file_path: '/work/proj/a.txt' })
    expect(r.state?.description).toBe('Create /work/proj/a.txt?')
    expect(JSON.stringify(r.state)).not.toContain('SECRET')
  })

  it('a long command is cut, and the rest of the tool input is dropped', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    const r = await replay.send(claude('PermissionRequest', {
      cwd: '/work/proj', tool_name: 'Bash', tool_input: { command: 'echo ' + 'x'.repeat(5000), description: 'TOKEN-IN-DESCRIPTION', timeout: 9 },
    }))
    expect(String(r.state?.toolInput.command).length).toBeLessThanOrEqual(300)
    expect(String(r.state?.toolInput.command).endsWith('…')).toBe(true)
    expect(String(r.state?.description).length).toBeLessThanOrEqual(300)
    expect(JSON.stringify(r.state)).not.toContain('TOKEN-IN-DESCRIPTION')
    expect(Object.keys(r.state?.toolInput)).toEqual(['command'])
  })

  it('summarizeToolInput survives odd input', () => {
    expect(hook.summarizeToolInput('Bash', null)).toEqual({})
    expect(hook.summarizeToolInput('Bash', 'rm -rf /')).toEqual({})
    expect(hook.summarizeToolInput('AskUserQuestion', { questions: [] })).toEqual({})
    expect(hook.describePermission('Mystery', undefined)).toBe('Allow Mystery?')
  })
})

describe('PermissionRequest: fails open', () => {
  it('a payload with no tool name or a string tool_input still records the pending decision and does not throw', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    const r = await replay.send(claude('PermissionRequest', { cwd: '/work/proj', tool_name: undefined, tool_input: 'oops' }))
    expect(r.status).toBe('permission_request')
    expect(r.state?.toolName).toBe('a tool')
  })
})

describe('PermissionRequest: clearing', () => {
  it('clears when the tool batch finishes (Claude Code fires nothing when the user answers)', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    await replay.send(ev.bashPermissionRequest)
    replay.wait(20000)
    const r = await replay.send(ev.postToolBatch)
    expect(r.status).toBe('active')
  })

  it('clears when the turn ends, and when the next prompt starts', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    await replay.send(ev.bashPermissionRequest)
    expect((await replay.send(ev.stop)).status).toBe('idle')
    await replay.send(ev.bashPermissionRequest)
    expect((await replay.send(claude('UserPromptSubmit', { cwd: '/work/proj' }))).status).toBe('active')
  })
})

describe('PermissionRequest: any later event replaces it', () => {
  it('a later idle_prompt notification, a new prompt, or the end of the turn each supersede the request', async () => {
    replay = createReplay({ cwd: '/work/proj' })
    await replay.send(ev.bashPermissionRequest)
    replay.wait(60000)
    const idle = await replay.send(ev.notificationIdlePrompt)
    expect(idle.status).toBe('waiting_for_input')
    expect(idle.notificationType).toBe('idle_prompt')
    expect(idle.state?.observed).toBeUndefined()
  })
})

describe('PermissionRequest: other agents are not affected', () => {
  it('a Grok or Codex event of this name records nothing (their approvals come from the pane)', async () => {
    for (const payload of [grok('PermissionRequest', { cwd: '/work/proj' }), codex('PermissionRequest', { cwd: '/work/proj' })]) {
      replay = createReplay({ cwd: '/work/proj' })
      const r = await replay.send(payload)
      expect(r.state).toBeNull()
      replay.cleanup(); replay = null
    }
  })
})

describe('the server address', () => {
  it('defaults to the local port and can be moved with AIM_SERVER_URL', () => {
    const before = process.env.AIM_SERVER_URL
    try {
      delete process.env.AIM_SERVER_URL
      expect(hook.aimBase()).toBe('http://localhost:23000')
      process.env.AIM_SERVER_URL = 'http://localhost:23087/'
      expect(hook.aimBase()).toBe('http://localhost:23087')
    } finally {
      if (before === undefined) delete process.env.AIM_SERVER_URL; else process.env.AIM_SERVER_URL = before
    }
  })
})

describe('the chat card for an observed permission', () => {
  it('is built from the pane when the hook reported it without options, and left alone when it has its own', async () => {
    const { needsPaneApprovalCard } = await import('../lib/pane-approval.mjs')
    expect(needsPaneApprovalCard(null, null)).toBe(true)
    expect(needsPaneApprovalCard({ status: 'active' }, null)).toBe(true)
    expect(needsPaneApprovalCard({ status: 'permission_request', observed: true, options: [] }, null)).toBe(true)
    expect(needsPaneApprovalCard({ status: 'permission_request', options: [] }, 'grok')).toBe(true)
    expect(needsPaneApprovalCard({ status: 'permission_request', observed: true, options: [{ key: '1' }] }, null)).toBe(false)
    expect(needsPaneApprovalCard({ status: 'permission_request', options: [] }, null)).toBe(false)
  })
})

describe('what the server relays to chat clients', () => {
  it('an observed report keeps its flag, so the chat knows to take the options from the pane', () => {
    const relayed = hook.buildHookStateData({ status: 'permission_request', toolName: 'Bash', toolInput: { command: 'ls' }, description: 'Run: ls', options: [], observed: true })
    expect(relayed.observed).toBe(true)
    expect(relayed.options).toEqual([])
    expect(hook.buildHookStateData({ status: 'permission_request', options: [{ key: '1' }] }).observed).toBeUndefined()
    expect(hook.buildHookStateData({ status: 'active' })).toBeUndefined()
  })
})
