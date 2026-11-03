/**
 * B025: the approval card showed the command (from the PermissionRequest hook), then seconds later only
 * "Do you want to proceed?" and the options, once the card from the pane replaced it. The card must keep
 * saying what is being approved, and never pair one request's command with another request's menu.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parsePermissionMenu } from '@/lib/pane-permission.mjs'
import { cardWithPaneMenu } from '@/lib/pane-approval.mjs'

// Claude Code 2.1.306, captured with tmux capture-pane (tests/fixtures/claude-hooks)
const FIXTURE = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/claude-hooks/pane-observed-permission.json'), 'utf8'))
const pane = () => parsePermissionMenu(FIXTURE.dialog)!

const hook = (command: string) => ({
  status: 'permission_request', observed: true, options: [], toolName: 'Bash',
  toolInput: { command }, description: `Run: ${command}`, message: 'Claude wants to bash',
})

describe('the card read from the pane says what is approved', () => {
  it('reads the command, the description and the tool from the dialog', () => {
    const card = pane()
    expect(card.options.map((o: any) => o.key)).toEqual(['1', '2', '3', '4'])
    expect(card.toolName).toBe('Bash')
    expect(card.toolInput).toEqual({ command: 'touch /work/proj/a2.txt' })
    expect(card.description).toBe('Create empty file a2.txt at the specified path')
  })

  it('a menu without a dialog around it still parses, without a command', () => {
    const card = parsePermissionMenu(['Do you want to proceed?', '❯ 1. Yes', '  2. No'].join('\n'))!
    expect(card.options).toHaveLength(2)
    expect(card.toolInput).toBeUndefined()
    expect(card.description).toBe('Do you want to proceed?')
  })
})

describe('cardWithPaneMenu', () => {
  it('keeps the hook\'s command and gains the menu when the screen shows the same command', () => {
    const card = cardWithPaneMenu(hook('touch /work/proj/a2.txt'), pane())
    expect(card.toolInput).toEqual({ command: 'touch /work/proj/a2.txt' })
    expect(card.description).toBe('Run: touch /work/proj/a2.txt')
    expect(card.options).toHaveLength(4)
  })

  it('never puts an earlier request\'s command next to a new menu', () => {
    const card = cardWithPaneMenu(hook('rm -rf /work/proj/old'), pane())
    expect(card.toolInput).toEqual({ command: 'touch /work/proj/a2.txt' })
    expect(card.description).not.toContain('rm -rf')
  })

  it('uses the pane card when there is no hook request, and the hook state when there is no menu', () => {
    const p = pane()
    expect(cardWithPaneMenu(null, p)).toBe(p)
    const h = hook('ls')
    expect(cardWithPaneMenu(h, null)).toBe(h)
  })
})
