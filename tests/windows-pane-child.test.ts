import { describe, it, expect, vi } from 'vitest'
import { paneOccupant } from '@/lib/windows-pane-child'
import { isShellCommand } from '@/lib/pane-occupant'

describe('paneOccupant (psmux names the newest process, not the foreground job)', () => {
  it('names the pane shell\'s child when psmux reports a shell under a running program', async () => {
    const childNames = vi.fn(async () => ['claude'])
    expect(await paneOccupant({ command: 'bash', pid: '9564' }, { platform: 'win32', childNames })).toBe('claude')
    expect(childNames).toHaveBeenCalledWith('9564')
  })

  it('keeps the shell when the pane shell has no child (really at its prompt)', async () => {
    expect(await paneOccupant({ command: 'powershell', pid: '1' }, { platform: 'win32', childNames: async () => [] })).toBe('powershell')
  })

  it('does not look up children when psmux already names a program', async () => {
    const childNames = vi.fn(async () => ['x'])
    expect(await paneOccupant({ command: 'claude', pid: '1' }, { platform: 'win32', childNames })).toBe('claude')
    expect(childNames).not.toHaveBeenCalled()
  })

  it('changes nothing off Windows (tmux already reports the foreground job)', async () => {
    const childNames = vi.fn(async () => ['claude'])
    expect(await paneOccupant({ command: 'bash', pid: '1' }, { platform: 'linux', childNames })).toBe('bash')
    expect(childNames).not.toHaveBeenCalled()
  })

  it('leaves the command alone without a pane pid', async () => {
    expect(await paneOccupant({ command: 'bash' }, { platform: 'win32', childNames: async () => ['claude'] })).toBe('bash')
  })

  it('a nested shell as the child still reads as a shell', async () => {
    const r = await paneOccupant({ command: 'pwsh', pid: '1' }, { platform: 'win32', childNames: async () => ['pwsh'] })
    expect(isShellCommand(r)).toBe(true)
  })
})
