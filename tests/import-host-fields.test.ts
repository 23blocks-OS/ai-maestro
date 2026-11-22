import { describe, it, expect } from 'vitest'
import { mapHomeFolder } from '@/services/agents-transfer-service'

describe('import maps the source home folder (#856)', () => {
  const none = () => false
  it('moves a missing folder under another user home to this home', () => {
    expect(mapHomeFolder('/home/alice/agents/web', '/home/bob', none)).toBe('/home/bob/agents/web')
    expect(mapHomeFolder('/Users/alice/work', '/home/bob', none)).toBe('/home/bob/work')
    expect(mapHomeFolder('/home/alice', '/Users/bob', none)).toBe('/Users/bob')
  })
  it('keeps a folder that exists here, one outside a home, or the same home', () => {
    expect(mapHomeFolder('/home/alice/x', '/home/bob', () => true)).toBe('/home/alice/x')
    expect(mapHomeFolder('/srv/agents/x', '/home/bob', none)).toBe('/srv/agents/x')
    expect(mapHomeFolder('/home/bob/x', '/home/bob', none)).toBe('/home/bob/x')
    expect(mapHomeFolder(undefined, '/home/bob', none)).toBeUndefined()
  })
})
