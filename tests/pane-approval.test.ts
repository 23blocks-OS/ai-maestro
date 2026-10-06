import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  approvalKindForProgram,
  parseGrokApproval,
  parseCodexApproval,
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
})

describe('Grok approval card (captured pane)', () => {
  it('parses the five options with the digit key to send', () => {
    const c = parseGrokApproval(fx('grok-approval.txt'))!
    expect(c.status).toBe('permission_request')
    expect(c.source).toBe('pane')
    expect(c.options.map((o: any) => o.key)).toEqual(['1', '2', '3', '4', '5'])
    expect(c.options[2]).toMatchObject({ key: '3', label: 'Yes, proceed', value: 'yes' })
    expect(c.options[3]).toMatchObject({ key: '4', value: 'no' })
    expect(c.options[4]).toMatchObject({ key: '5', value: 'no' })
    expect(c.answerByKey).toBe(true)
  })

  it('carries the title and command so the card shows what is approved', () => {
    const c = parseGrokApproval(fx('grok-approval.txt'))!
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
    const c = parseCodexApproval(fx('codex-approval.txt'))!
    expect(c.status).toBe('permission_request')
    expect(c.options.map((o: any) => o.key)).toEqual(['1', '2', '3'])
    expect(c.options[0]).toMatchObject({ label: 'Yes, proceed', value: 'yes' })
    expect(c.options[1].label).toContain("don't ask again")
    expect(c.options[2]).toMatchObject({ label: 'No, and tell Codex what to do differently', value: 'no' })
    expect(c.answerByKey).toBe(true)
  })

  it('carries the question, reason and command', () => {
    const c = parseCodexApproval(fx('codex-approval.txt'))!
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
