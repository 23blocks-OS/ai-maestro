import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  approvalKindForProgram,
  parseGrokApproval,
  parseCodexApproval,
  parseCopilotApproval,
  parseApprovalForProgram,
} from '@/lib/pane-approval.mjs'

// Real captures: Grok Build and codex-cli 0.153.4 in tmux, 2026-10-06.
const fx = (n: string) => fs.readFileSync(path.join(__dirname, 'fixtures/approval', n), 'utf8')

describe('approvalKindForProgram', () => {
  it('maps programs', () => {
    expect(approvalKindForProgram('grok')).toBe('grok')
    expect(approvalKindForProgram('Codex CLI')).toBe('codex')
    expect(approvalKindForProgram('claude')).toBeNull()
    expect(approvalKindForProgram(undefined)).toBeNull()
  })

  it('maps Copilot CLI by whole name, like the launcher, and not the older gh copilot extension', () => {
    for (const p of ['copilot', 'Copilot', 'copilot-cli', 'GitHub Copilot CLI', 'github-copilot']) expect(approvalKindForProgram(p), p).toBe('copilot')
    for (const p of ['gh copilot', 'gh-copilot', 'copilots', 'my-copilot']) expect(approvalKindForProgram(p), p).toBeNull()
  })
})

describe('Grok approval card (captured pane)', () => {
  it('parses the five options with the digit key to send', () => {
    const c = parseGrokApproval(fx('grok-approval.txt'))! as any
    expect(c.status).toBe('permission_request')
    expect(c.source).toBe('pane')
    expect(c.options.map((o: any) => o.key)).toEqual(['1', '2', '3', '4', '5'])
    expect(c.options[2]).toMatchObject({ key: '3', label: 'Yes, proceed', value: 'yes' })
    expect(c.options[3]).toMatchObject({ key: '4', value: 'no' })
    expect(c.options[4]).toMatchObject({ key: '5', value: 'no' })
    expect(c.answerByKey).toBe(true)
  })

  it('carries the title and command so the card shows what is approved', () => {
    const c = parseGrokApproval(fx('grok-approval.txt'))! as any
    expect(c.description).toBe('Create empty askme2.txt and confirm it exists')
    expect(c.toolName).toBe('Bash')
    expect(c.toolInput.command).toBe('touch askme2.txt && ls -la askme2.txt')
  })

  it('returns null once the menu is gone (after reject)', () => {
    expect(parseGrokApproval(fx('grok-after-reject.txt'))).toBeNull()
  })

  it('returns null when the menu is followed by conversation output', () => {
    const stale = fx('grok-approval.txt').trimEnd() + '\n\n• Ran touch askme2.txt\n  └ (no output)\n› next\n'
    expect(parseGrokApproval(stale)).toBeNull()
  })

  it('rejects a truncated menu (option 1 lost)', () => {
    const cut = fx('grok-approval.txt').split('\n').filter((l) => !/┃\s+1 \(/.test(l)).join('\n')
    expect(parseGrokApproval(cut)).toBeNull()
  })
})

describe('Codex approval card (captured pane)', () => {
  it('parses the three options; keys are digits', () => {
    const c = parseCodexApproval(fx('codex-approval.txt'))! as any
    expect(c.status).toBe('permission_request')
    expect(c.options.map((o: any) => o.key)).toEqual(['1', '2', '3'])
    expect(c.options[0]).toMatchObject({ label: 'Yes, proceed', value: 'yes' })
    expect(c.options[1].label).toContain("don't ask again")
    expect(c.options[2]).toMatchObject({ label: 'No, and tell Codex what to do differently', value: 'no' })
    expect(c.answerByKey).toBe(true)
  })

  it('carries the question, reason and command', () => {
    const c = parseCodexApproval(fx('codex-approval.txt'))! as any
    expect(c.message).toBe('Would you like to run the following command?')
    expect(c.description).toContain('May I create askme.txt')
    expect(c.toolName).toBe('Bash')
    expect(c.toolInput.command).toBe('touch askme.txt')
  })

  it('returns null after the prompt is answered', () => {
    expect(parseCodexApproval(fx('codex-after-reject.txt'))).toBeNull()
  })

  it('returns null when a menu sits above later conversation', () => {
    const stale = fx('codex-approval.txt').trimEnd() + '\n\n• Ran touch askme.txt\n› Ask Codex to do anything\n'
    expect(parseCodexApproval(stale)).toBeNull()
  })

  it('ignores the update and trust menus (different footer, no approval question)', () => {
    const t = ['  Do you trust the contents of this directory?', '› 1. Yes, continue', '  2. No, quit', '  Press enter to continue'].join('\n')
    expect(parseCodexApproval(t)).toBeNull()
  })
})

describe('program routing', () => {
  it('picks the parser by program and never cross-parses', () => {
    expect(parseApprovalForProgram('grok', fx('grok-approval.txt'))).not.toBeNull()
    expect(parseApprovalForProgram('codex', fx('codex-approval.txt'))).not.toBeNull()
    expect(parseApprovalForProgram('codex', fx('grok-approval.txt'))).toBeNull()
    expect(parseApprovalForProgram('grok', fx('codex-approval.txt'))).toBeNull()
    expect(parseApprovalForProgram('claude', fx('codex-approval.txt'))).toBeNull()
  })
})


// Real captures: GitHub Copilot CLI 1.0.96 in tmux, 2026-10-12, launched WITHOUT signing in. These are the
// questions it asks by itself: trust the folder, which account, how to sign in.
describe('Copilot CLI approval card (captured panes)', () => {
  it('the folder-trust question: three options, a digit selects at once, "No" is a no', () => {
    const c = parseCopilotApproval(fx('copilot-trust.txt'))! as any
    expect(c.status).toBe('permission_request')
    expect(c.source).toBe('pane')
    expect(c.answerByKey).toBe(true)
    expect(c.message).toBe('Do you trust the files in this folder?')
    expect(c.options.map((o: any) => o.key)).toEqual(['1', '2', '3'])
    expect(c.options[0]).toMatchObject({ key: '1', label: 'Yes', value: 'yes' })
    expect(c.options[1]).toMatchObject({ key: '2', label: 'Yes, and remember this folder for future sessions', value: 'yes' })
    expect(c.options[2]).toMatchObject({ key: '3', label: 'No', value: 'no' }) // "(Esc)" hint removed
  })

  it('shows which folder and what Copilot will do there, with the wrapped path put back together and no box borders', () => {
    const c = parseCopilotApproval(fx('copilot-trust.txt'))! as any
    expect(c.description).toContain('cpfix-work')
    expect(c.description).toMatch(/Copilot can read files in this folder/)
    expect(c.description).not.toMatch(/[│╭╰╮╯]/)
    expect(c.description).not.toContain('Confirm folder trust')
    const path = c.description.match(/\/private\/tmp\/\S+/)![0]
    expect(path.endsWith('cpfix-work')).toBe(true) // one path with no break in it, not two pieces
  })

  it('the account question after /login', () => {
    const c = parseCopilotApproval(fx('copilot-account.txt'))! as any
    expect(c.message).toBe('What account do you want to log into?')
    expect(c.options.map((o: any) => o.label)).toEqual(['GitHub.com', 'GitHub Enterprise Cloud (*.ghe.com)', 'Your organization (Microsoft Entra)'])
    expect(c.options.map((o: any) => o.key)).toEqual(['1', '2', '3'])
  })

  it('the sign-in method question', () => {
    const c = parseCopilotApproval(fx('copilot-signin-method.txt'))! as any
    expect(c.message).toBe('How do you want to sign in?')
    expect(c.options.map((o: any) => o.label)).toEqual(['Sign in with your browser (recommended)', 'Sign in with a device code'])
  })

  it('gives no card once the menu is answered (the normal prompt is back)', () => {
    expect(parseCopilotApproval(fx('copilot-after-trust.txt'))).toBeNull()
  })

  it('gives no card when conversation output follows the menu (a stale capture)', () => {
    const stale = fx('copilot-account.txt').trimEnd() + '\n\n ● Signed in as someone\n'
    expect(parseCopilotApproval(stale)).toBeNull()
  })

  it('gives no card for a picker that shares the footer but asks no question (a title, not a "?")', () => {
    const picker = ' Select a model\n ❯ 1. Claude Sonnet 4.5\n   2. GPT-5\n ↑/↓ to navigate · enter to select\n'
    expect(parseCopilotApproval(picker)).toBeNull()
  })

  it('gives no card for a numbered list in the conversation without the menu footer', () => {
    expect(parseCopilotApproval(' Which one do you want?\n 1. first\n 2. second\n')).toBeNull()
    expect(parseCopilotApproval('')).toBeNull()
    expect(parseCopilotApproval(undefined as any)).toBeNull()
  })

  it('does not guess when the options do not start at 1', () => {
    expect(parseCopilotApproval(' Do you want it?\n ❯ 2. Yes\n   3. No\n ↑/↓ to navigate · enter to select\n')).toBeNull()
  })

  it('is what parseApprovalForProgram returns for a Copilot agent, and only for a Copilot agent', () => {
    expect(parseApprovalForProgram('copilot', fx('copilot-trust.txt'))).not.toBeNull()
    expect(parseApprovalForProgram('GitHub Copilot CLI', fx('copilot-account.txt'))).not.toBeNull()
    expect(parseApprovalForProgram('grok', fx('copilot-trust.txt'))).toBeNull()
    expect(parseApprovalForProgram('codex', fx('copilot-trust.txt'))).toBeNull()
    expect(parseApprovalForProgram('claude', fx('copilot-trust.txt'))).toBeNull()
  })

  it('the other tools\' readers do not mistake a Copilot menu for theirs', () => {
    for (const f of ['copilot-trust.txt', 'copilot-account.txt', 'copilot-signin-method.txt']) {
      expect(parseGrokApproval(fx(f)), f).toBeNull()
      expect(parseCodexApproval(fx(f)), f).toBeNull()
    }
  })
})

// Real captures: GitHub Copilot CLI 1.0.97 in tmux, 2026-10-14, driven against a local fake OpenAI-compatible
// model (bring-your-own-provider mode, no GitHub login). These are the "may I run this?" questions Copilot
// asks in a conversation. Paths are sanitised; every line keeps its width.
describe('Copilot CLI tool-permission cards (captured panes)', () => {
  it('"Do you want to run this command?": the command becomes a Bash tool input, three options, No is a no', () => {
    const c = parseCopilotApproval(fx('copilot-run-command.txt'))! as any
    expect(c.status).toBe('permission_request')
    expect(c.message).toBe('Do you want to run this command?')
    expect(c.toolName).toBe('Bash')
    expect(c.toolInput).toEqual({ command: 'rm -f zzz.txt && echo done' })
    expect(c.description).toBe('Do you want to run this command?')
    expect(c.options.map((o: any) => [o.key, o.value])).toEqual([['1', 'yes'], ['2', 'yes'], ['3', 'no']])
    expect(c.options[1].label).toMatch(/^Yes, and don't ask again for `rm` in this directory/)
    expect(c.answerByKey).toBe(true)
  })

  it('"Do you want to edit <file>?": the question names the file, the diff stays in the description, no Bash input', () => {
    const c = parseCopilotApproval(fx('copilot-edit-file.txt'))! as any
    expect(c.message).toBe('Do you want to edit /home/dev/work/projB/notes.txt?')
    expect(c.description).toMatch(/1 -\s+hello b/)
    expect(c.description).toMatch(/1 \+\s+hello c/)
    expect(c.toolName).toBeUndefined()
    expect(c.options).toHaveLength(3)
    expect(c.options[1].label).toMatch(/^Yes, and don't ask again for file operations when in this directory/)
  })

  it('"Do you want to create <file>?" works from a capture cut mid-box (no top border)', () => {
    const c = parseCopilotApproval(fx('copilot-create-file.txt'))! as any
    expect(c.message).toBe('Do you want to create /home/dev/work/projB/new.txt?')
    expect(c.description).toMatch(/2 \+\s+line two/)
    expect(c.options.map((o: any) => o.value)).toEqual(['yes', 'yes', 'no'])
  })

  it('is only offered to a Copilot agent', () => {
    expect(parseApprovalForProgram('copilot', fx('copilot-run-command.txt'))).not.toBeNull()
    expect(parseApprovalForProgram('codex', fx('copilot-run-command.txt'))).toBeNull()
    expect(parseApprovalForProgram('grok', fx('copilot-run-command.txt'))).toBeNull()
  })

  it('leaves no card once the prompt is answered (the footer is gone)', () => {
    const answered = fx('copilot-run-command.txt').split('\n').slice(0, -14).join('\n') + '\n\n ● The command finished.\n'
    expect(parseCopilotApproval(answered)).toBeNull()
  })
})
