import { describe, it, expect } from 'vitest'
import { shouldSyncWorkingDirectory } from '@/lib/index-delta'

describe('shouldSyncWorkingDirectory', () => {
  const home = '/Users/someone'
  it('follows an agent that really works in another folder', () => {
    expect(shouldSyncWorkingDirectory('/work/a', '/work/b', home)).toBe(true)
  })
  it('does nothing when they already match or one is unknown', () => {
    expect(shouldSyncWorkingDirectory('/work/a', '/work/a', home)).toBe(false)
    expect(shouldSyncWorkingDirectory('/work/a', null, home)).toBe(false)
    expect(shouldSyncWorkingDirectory(undefined, '/work/b', home)).toBe(false)
  })
  it('never copies the home folder into the record (the wake fallback)', () => {
    expect(shouldSyncWorkingDirectory('/Users/someone/agents/tct-gm', home, home)).toBe(false)
    expect(shouldSyncWorkingDirectory('/Users/someone/agents/tct-gm', home + '/', home)).toBe(false)
  })
})
