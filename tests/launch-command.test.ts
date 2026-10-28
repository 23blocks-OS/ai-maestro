import { describe, it, expect } from 'vitest'
import { buildLaunchCommand, sanitizeProgramArgs } from '@/lib/launch-command'

const base = { agentName: 'aria', env: {} as NodeJS.ProcessEnv }
const CLAUDE_PREFIX = 'CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 '

describe('buildLaunchCommand: Claude Code', () => {
  it('a plain supervised launch gets only the scrollback fix', () => {
    expect(buildLaunchCommand({ ...base, command: 'claude', kind: 'claude' })).toBe(`${CLAUDE_PREFIX}claude`)
    expect(buildLaunchCommand({ ...base, command: 'claude', kind: 'claude', permissionMode: 'supervised' })).toBe(`${CLAUDE_PREFIX}claude`)
  })

  it('maps every other mode to Claude\'s own --permission-mode', () => {
    const cases: Record<string, string> = { planOnly: 'plan', trustEdits: 'acceptEdits', smartAuto: 'auto', fullAutonomy: 'bypassPermissions' }
    for (const [mode, cli] of Object.entries(cases)) {
      expect(buildLaunchCommand({ ...base, command: 'claude', kind: 'claude', permissionMode: mode })).toBe(`${CLAUDE_PREFIX}claude --permission-mode ${cli}`)
    }
  })

  it('orders extra arguments, model, mode, then the channel flag', () => {
    expect(buildLaunchCommand({
      ...base, command: 'claude', kind: 'claude', programArgs: '--chrome', model: 'opus', permissionMode: 'trustEdits',
      env: { AIMAESTRO_CHANNEL_FLAG: '--channels plugin:amp@x' },
    })).toBe(`${CLAUDE_PREFIX}claude --chrome --model opus --permission-mode acceptEdits --channels plugin:amp@x`)
  })

  it('a model chosen in the launch options replaces the agent\'s model', () => {
    expect(buildLaunchCommand({ ...base, command: 'claude', kind: 'claude', model: 'opus', launchOptions: { model: 'sonnet' } })).toBe(`${CLAUDE_PREFIX}claude --model sonnet`)
  })

  it('keeps the fullscreen renderer when asked, and a wrapper keeps Claude\'s flags (keyed off the kind)', () => {
    expect(buildLaunchCommand({ ...base, command: 'claude', kind: 'claude', env: { AIMAESTRO_KEEP_ALT_SCREEN: 'true' } })).toBe('claude')
    expect(buildLaunchCommand({ ...base, command: '/usr/local/bin/claude-sandboxed.sh', kind: 'claude', permissionMode: 'fullAutonomy' }))
      .toBe(`${CLAUDE_PREFIX}/usr/local/bin/claude-sandboxed.sh --permission-mode bypassPermissions`)
  })

  it('Claude Code ignores the other tools\' options', () => {
    expect(buildLaunchCommand({ ...base, command: 'claude', kind: 'claude', launchOptions: { continue: true, thinking: 'high' } })).toBe(`${CLAUDE_PREFIX}claude`)
  })
})

describe('buildLaunchCommand: the other tools', () => {
  it('Grok Build: its own flags, nothing Claude-specific', () => {
    expect(buildLaunchCommand({ ...base, command: 'grok', kind: 'grok' })).toBe('grok')
    expect(buildLaunchCommand({ ...base, command: 'grok', kind: 'grok', permissionMode: 'fullAutonomy' })).toBe('grok --always-approve')
    expect(buildLaunchCommand({ ...base, command: 'grok', kind: 'grok', permissionMode: 'planOnly', launchOptions: { continue: true } })).toBe('grok --permission-mode plan --continue')
  })

  it('Copilot CLI: allow-all-tools only for full autonomy, then its options', () => {
    expect(buildLaunchCommand({ ...base, command: 'copilot', kind: 'copilot', permissionMode: 'trustEdits' })).toBe('copilot')
    expect(buildLaunchCommand({ ...base, command: 'copilot', kind: 'copilot', permissionMode: 'fullAutonomy', launchOptions: { model: 'gpt-5', effort: 'high', continue: true, addDir: '~/x' } }))
      .toBe('copilot --model gpt-5 --allow-all-tools --reasoning-effort high --continue --add-dir ~/x')
  })

  it('Pi: no permission flags, only its options', () => {
    expect(buildLaunchCommand({ ...base, command: 'pi', kind: 'pi', permissionMode: 'fullAutonomy' })).toBe('pi')
    expect(buildLaunchCommand({ ...base, command: 'pi', kind: 'pi', launchOptions: { thinking: 'low', noSession: true } })).toBe('pi --thinking low --no-session')
    expect(buildLaunchCommand({ ...base, command: 'pi', kind: 'pi', launchOptions: { tools: 'messaging' } })).toBe("pi --tools read,grep,find,ls,amp_inbox,amp_read,amp_reply,amp_send --exclude-tools 'mcp__*'")
    expect(buildLaunchCommand({ ...base, command: 'pi', kind: 'pi', launchOptions: { tools: 'full' } })).toBe('pi')
    expect(buildLaunchCommand({ ...base, command: 'codex', kind: 'codex', launchOptions: { tools: 'messaging' } })).not.toContain('--tools')
  })

  it('a tool with no declaration adds only the agent\'s own arguments and model', () => {
    expect(buildLaunchCommand({ ...base, command: 'codex', kind: 'codex', programArgs: '--full-auto', model: 'o3' })).toBe('codex --full-auto --model o3')
    // Codex's own flags, read from `codex --help` 0.153.4.
    const codex = { ...base, command: 'codex', kind: 'codex' as const }
    expect(buildLaunchCommand({ ...codex, permissionMode: 'supervised' })).toBe('codex')
    expect(buildLaunchCommand({ ...codex, permissionMode: 'planOnly' })).toBe('codex --sandbox read-only')
    expect(buildLaunchCommand({ ...codex, permissionMode: 'smartAuto' })).toBe('codex --approve-for-me')
    expect(buildLaunchCommand({ ...codex, permissionMode: 'fullAutonomy', launchOptions: { model: 'gpt-5', search: true } })).toBe('codex --model gpt-5 --dangerously-bypass-approvals-and-sandbox --search')
    expect(buildLaunchCommand({ ...codex, permissionMode: 'trustEdits' })).toBe('codex')
    expect(buildLaunchCommand({ ...base, command: 'gemini', kind: 'gemini', permissionMode: 'fullAutonomy', launchOptions: { continue: true } })).toBe('gemini')
  })
})

describe('buildLaunchCommand: safety', () => {
  it('drops invalid option values and strips shell characters from extra arguments', () => {
    expect(buildLaunchCommand({ ...base, command: 'copilot', kind: 'copilot', launchOptions: { model: 'x; rm -rf ~', addDir: '$(id)' } })).toBe('copilot')
    const typed = buildLaunchCommand({ ...base, command: 'copilot', kind: 'copilot', programArgs: '--x; rm -rf ~ $(id) `id` | tee > f & y' })
    expect(typed).not.toMatch(/[;$`|><&()'"\\]/) // nothing that can end a shell word or start a command
    expect(typed.startsWith('copilot --x')).toBe(true)
    expect(sanitizeProgramArgs(' --a=1 ;& ')).toBe('--a=1')
  })
})
