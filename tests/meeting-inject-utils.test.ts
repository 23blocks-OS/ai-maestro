import { describe, it, expect } from 'vitest'
import { stripAvatarPaths } from '@/lib/meeting-inject-utils'

describe('stripAvatarPaths', () => {
  it('strips relative-path avatar references with spaces in filename', () => {
    const msg = 'see ../../../../mnt/agents/rollie/vault/.assets/Small Avatar.png here'
    expect(stripAvatarPaths(msg)).toBe('see [avatar] here')
  })

  it('strips absolute /mnt/agents avatar paths', () => {
    const msg = 'my avatar is /mnt/agents/celestia/avatar.png thanks'
    expect(stripAvatarPaths(msg)).toBe('my avatar is [avatar] thanks')
  })

  it('replaces with literal [avatar]', () => {
    const msg = 'look at ../avatars/small.png cool right'
    expect(stripAvatarPaths(msg)).toContain('[avatar]')
    expect(stripAvatarPaths(msg)).not.toContain('.png')
  })

  it('covers common image extensions case-insensitively', () => {
    const cases = [
      '../pic.PNG',
      '../pic.jpg',
      '../pic.JPEG',
      '../pic.gif',
      '../pic.webp',
      '../pic.svg',
    ]
    for (const c of cases) {
      expect(stripAvatarPaths(c)).toBe('[avatar]')
    }
  })

  it('leaves non-image file references intact', () => {
    const msg = 'bug in ../src/server.ts and docs at /mnt/agents/notes.md'
    expect(stripAvatarPaths(msg)).toBe(msg)
  })

  it('leaves URLs to images alone', () => {
    const msg = 'avatar: https://example.com/small.png cool'
    expect(stripAvatarPaths(msg)).toBe(msg)
  })

  it('handles messages with no paths at all', () => {
    expect(stripAvatarPaths('hello world')).toBe('hello world')
    expect(stripAvatarPaths('')).toBe('')
  })

  it('strips multiple avatar paths in one message', () => {
    const msg = '../a/x.png and /mnt/agents/b/y.jpg together'
    expect(stripAvatarPaths(msg)).toBe('[avatar] and [avatar] together')
  })
})
