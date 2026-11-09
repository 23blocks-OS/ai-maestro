/**
 * B038: the chat's dots follow the shared status, so they need no PTY. The words under them: the live detail
 * when a terminal happens to provide one, else "Working", and after 2 minutes how long it has run.
 */
import { describe, it, expect } from 'vitest'
import { workingLabel } from '@/components/chat/ChatWorkingIndicator'

describe('workingLabel', () => {
  it('plain "Working" without a detail (chat-only: no PTY)', () => {
    expect(workingLabel(null, 0)).toBe('Working')
  })
  it('the live detail when there is one', () => {
    expect(workingLabel({ label: 'Bash', detail: 'yarn test' }, 0)).toBe('Bash · yarn test')
    expect(workingLabel({ label: 'Thinking' }, 0)).toBe('Thinking')
  })
  it('says how long after 2 minutes, so a long run does not look stuck', () => {
    expect(workingLabel(null, 119_000)).toBe('Working')
    expect(workingLabel(null, 150_000)).toBe('Working · still working, 2 min')
  })
})
